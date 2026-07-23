import puppeteer from "@cloudflare/puppeteer";
import { ensureSchema } from "../../db/ensure-schema";
import { normalizeAuthorizedAuto24Record, type AuthorizedAuto24Record } from "./auto24";
import { matchesRadar } from "./matching";
import type { NormalizedListing, RadarQuery } from "./types";

const DEFAULT_SEARCH_URL =
  "https://www.auto24.ee/kasutatud/nimekiri.php?ad=1&otsi=otsi&ae=1&ak=0";
const SOURCE = "Auto24";

export interface Auto24CollectorEnv {
  DB: D1Database;
  BROWSER: Fetcher;
  AUTO24_SEARCH_URL?: string;
}

type ActiveRadar = {
  id: number;
  user_email: string;
  sources: string;
  filter_json: string | null;
};

type ExtractedAuto24Record = AuthorizedAuto24Record & {
  bodyType?: string | null;
  powerKw?: number | null;
};

export type Auto24RunResult = {
  runId: number;
  status: "success" | "blocked" | "failed";
  receivedCount: number;
  newListingCount: number;
  newMatchCount: number;
  message?: string;
};

export async function collectAuto24(env: Auto24CollectorEnv): Promise<Auto24RunResult> {
  await ensureSchema(env.DB);
  const started = await env.DB
    .prepare("INSERT INTO source_runs (source, status) VALUES (?, ?) RETURNING id")
    .bind(SOURCE, "running")
    .first<{ id: number }>();
  if (!started) throw new Error("Не удалось создать запись запуска Auto24");

  try {
    const records = await fetchAuto24WithBrowser(
      env.BROWSER,
      env.AUTO24_SEARCH_URL || DEFAULT_SEARCH_URL,
    );
    const result = await ingestAuto24Records(env.DB, records);
    await finishRun(env.DB, started.id, "success", result);
    return { runId: started.id, status: "success", ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка Auto24";
    const status = message.startsWith("AUTO24_BLOCKED:") ? "blocked" : "failed";
    await finishRun(env.DB, started.id, status, {
      receivedCount: 0,
      newListingCount: 0,
      newMatchCount: 0,
      message,
    });
    return {
      runId: started.id,
      status,
      receivedCount: 0,
      newListingCount: 0,
      newMatchCount: 0,
      message,
    };
  }
}

export async function ingestAuto24Records(
  database: D1Database,
  records: ExtractedAuto24Record[],
) {
  await ensureSchema(database);
  const radarResult = await database
    .prepare(
      `SELECT r.id, r.user_email, r.sources, f.filter_json
       FROM radars r
       LEFT JOIN radar_filters f ON f.radar_id = r.id
       WHERE r.enabled = 1`,
    )
    .all<ActiveRadar>();
  const radars = radarResult.results
    .filter((radar) => parseSources(radar.sources).includes(SOURCE))
    .map((radar) => ({ ...radar, filters: parseFilters(radar.filter_json) }));

  let newListingCount = 0;
  let newMatchCount = 0;

  for (const record of records) {
    const listing = normalizeAuthorizedAuto24Record(record);
    const existing = await database
      .prepare("SELECT id FROM listings WHERE source = ? AND external_id = ?")
      .bind(listing.source, listing.externalId)
      .first<{ id: number }>();

    await upsertListing(database, listing);
    const stored = await database
      .prepare("SELECT id FROM listings WHERE source = ? AND external_id = ?")
      .bind(listing.source, listing.externalId)
      .first<{ id: number }>();
    if (!stored) continue;
    if (!existing) newListingCount += 1;

    for (const radar of radars) {
      if (!matchesRadar(radar.filters, listing)) continue;
      const match = await database
        .prepare(
          `INSERT OR IGNORE INTO radar_matches (radar_id, listing_id)
           VALUES (?, ?)`,
        )
        .bind(radar.id, stored.id)
        .run();
      if (!match.meta.changes) continue;

      newMatchCount += 1;
      const matchId = Number(match.meta.last_row_id);
      if (matchId > 0) {
        await database
          .prepare(
            `INSERT OR IGNORE INTO notification_deliveries (match_id, channel, status)
             SELECT ?, 'telegram', 'pending'
             WHERE EXISTS (
               SELECT 1 FROM telegram_connections
               WHERE user_email = ? AND connected = 1 AND chat_id IS NOT NULL
             )`,
          )
          .bind(matchId, radar.user_email)
          .run();
      }
    }
  }

  return {
    receivedCount: records.length,
    newListingCount,
    newMatchCount,
  };
}

async function fetchAuto24WithBrowser(
  browserBinding: Fetcher,
  searchUrl: string,
): Promise<ExtractedAuto24Record[]> {
  const url = new URL(searchUrl);
  if (!["auto24.ee", "www.auto24.ee"].includes(url.hostname)) {
    throw new Error("AUTO24_SEARCH_URL должен вести на auto24.ee");
  }

  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "CarPulseMVP/0.1 (+https://github.com/ArtjomEST/CarPulse; authorized Auto24 test)",
    );
    const response = await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const status = response?.status() ?? 0;
    const inspectionJson = await page.evaluate(() =>
      JSON.stringify({
        title: document.title,
        text: document.body?.innerText.slice(0, 800) || "",
        rows: document.querySelectorAll(".result-row").length,
      }),
    );
    const inspection = JSON.parse(inspectionJson) as {
      title: string;
      text: string;
      rows: number;
    };
    const challengeText = `${inspection.title} ${inspection.text}`.toLocaleLowerCase();
    if (
      status === 403 ||
      status === 429 ||
      challengeText.includes("security check") ||
      challengeText.includes("проверку безопасности") ||
      challengeText.includes("turvaküsimus")
    ) {
      throw new Error(
        `AUTO24_BLOCKED: Auto24 вернул защитную проверку (${status || "без HTTP-статуса"}). Нужен allowlist для CarPulse или официальный API.`,
      );
    }
    if (!inspection.rows) {
      throw new Error("Auto24 открылся, но строки .result-row не найдены — возможно, изменилась разметка");
    }

    const recordsJson = await page.evaluate(() =>
      JSON.stringify(
        Array.from(document.querySelectorAll(".result-row"))
          .slice(0, 50)
          .map((row) => {
            const link = row.querySelector<HTMLAnchorElement>("a.main[href*='/soidukid/']");
            const href = link?.getAttribute("href") || "";
            const id = href.match(/\/soidukid\/(\d+)/)?.[1] || "";
            const number = (selector: string) => {
              const value = row.querySelector(selector)?.textContent || "";
              const parsed = Number(value.replace(/[^\d]/g, ""));
              return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
            };
            const text = (selector: string) =>
              row.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() || null;
            const title = link?.textContent?.replace(/\s+/g, " ").trim() || "";
            const engine = text(".engine");
            return {
              id,
              url: id ? `https://www.auto24.ee/soidukid/${id}` : "",
              title,
              make: link?.querySelector("span:not(.model):not(.engine)")?.textContent?.trim() || null,
              model: text("a.main .model"),
              priceEur: number(".description > .finance .price"),
              year: number(".extra .year"),
              mileageKm: number(".extra .mileage"),
              fuel: text(".extra .fuel.sm-none"),
              transmission: text(".extra .transmission.sm-none"),
              imageUrl: row.querySelector<HTMLImageElement>(".thumbnail img.thumb")?.src || null,
              bodyType: text(".extra .bodytype"),
              powerKw: engine ? Number(engine.match(/(\d+)\s*kW/i)?.[1] || 0) || null : null,
            };
          })
          .filter((record) => record.id && record.title),
      ),
    );
    return (JSON.parse(recordsJson) as ExtractedAuto24Record[]).map(translateAuto24Record);
  } finally {
    await browser.close();
  }
}

function translateAuto24Record(record: ExtractedAuto24Record): ExtractedAuto24Record {
  const fuel: Record<string, string> = {
    bensiin: "Бензин",
    diisel: "Дизель",
    elekter: "Электро",
    hübriid: "Гибрид",
  };
  const transmission: Record<string, string> = {
    automaat: "Автомат",
    manuaal: "Механика",
    poolautomaat: "Полуавтомат",
  };
  const fuelKey = record.fuel?.toLocaleLowerCase() || "";
  const transmissionKey = record.transmission?.toLocaleLowerCase() || "";
  return {
    ...record,
    fuel: fuel[fuelKey] || record.fuel,
    transmission: transmission[transmissionKey] || record.transmission,
  };
}

async function upsertListing(database: D1Database, listing: NormalizedListing) {
  await database
    .prepare(
      `INSERT INTO listings (
         source, external_id, url, title, make, model, price_eur, year,
         mileage_km, fuel, transmission, location, image_url, raw_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, external_id) DO UPDATE SET
         url = excluded.url,
         title = excluded.title,
         make = excluded.make,
         model = excluded.model,
         price_eur = excluded.price_eur,
         year = excluded.year,
         mileage_km = excluded.mileage_km,
         fuel = excluded.fuel,
         transmission = excluded.transmission,
         location = excluded.location,
         image_url = excluded.image_url,
         raw_json = excluded.raw_json,
         last_seen_at = CURRENT_TIMESTAMP,
         active = 1`,
    )
    .bind(
      listing.source,
      listing.externalId,
      listing.url,
      listing.title,
      listing.make,
      listing.model,
      listing.priceEur,
      listing.year,
      listing.mileageKm,
      listing.fuel,
      listing.transmission,
      listing.location,
      listing.imageUrl,
      JSON.stringify(listing.raw),
    )
    .run();
}

async function finishRun(
  database: D1Database,
  runId: number,
  status: string,
  result: {
    receivedCount: number;
    newListingCount: number;
    newMatchCount: number;
    message?: string;
  },
) {
  await database
    .prepare(
      `UPDATE source_runs
       SET status = ?, received_count = ?, new_listing_count = ?,
           new_match_count = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      status,
      result.receivedCount,
      result.newListingCount,
      result.newMatchCount,
      result.message || null,
      runId,
    )
    .run();
}

function parseSources(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseFilters(value: string | null): RadarQuery {
  try {
    return value ? (JSON.parse(value) as RadarQuery) : {};
  } catch {
    return {};
  }
}
