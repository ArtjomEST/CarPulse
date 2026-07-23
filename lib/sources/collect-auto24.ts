import puppeteer from "@cloudflare/puppeteer";
import type { Page } from "@cloudflare/puppeteer";
import { ensureSchema } from "../../db/ensure-schema";
import { auto24FilterValues } from "../vehicle-filters";
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
  drivetrain?: string | null;
  powerKw?: number | null;
  candidateRadarIds?: number[];
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
    const radars = await loadActiveAuto24Radars(env.DB);
    const records = await fetchAuto24WithBrowser(
      env.BROWSER,
      env.AUTO24_SEARCH_URL || DEFAULT_SEARCH_URL,
      radars,
    );
    const result = await ingestAuto24Records(env.DB, records, radars);
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
  suppliedRadars?: Array<ActiveRadar & { filters: RadarQuery }>,
) {
  await ensureSchema(database);
  const radars = suppliedRadars || (await loadActiveAuto24Radars(database));

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
      const matchedBySourceQuery = record.candidateRadarIds?.includes(radar.id);
      if (!matchedBySourceQuery && !matchesRadar(radar.filters, listing)) continue;
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
  radars: Array<ActiveRadar & { filters: RadarQuery }>,
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
    await assertAuto24Page(page, response?.status() ?? 0, false);

    const makeOptionsJson = await page.evaluate(() =>
      JSON.stringify(
        Array.from(
          document.querySelectorAll("#searchParam-cmm-1-make option"),
        ).map((option) => ({
          value: (option as unknown as { value: string }).value,
          label: option.textContent?.trim() || "",
        })),
      ),
    );
    const makeOptions = JSON.parse(makeOptionsJson) as Array<{ value: string; label: string }>;
    const groupedSearches = new Map<string, number[]>();

    for (const radar of radars.slice(0, 10)) {
      const radarUrl = buildAuto24SearchUrl(url, radar.filters, makeOptions);
      if (!radarUrl) continue;
      const key = radarUrl.toString();
      groupedSearches.set(key, [...(groupedSearches.get(key) || []), radar.id]);
    }

    if (!groupedSearches.size) return [];

    const recordsById = new Map<string, ExtractedAuto24Record>();
    for (const [radarUrl, radarIds] of groupedSearches) {
      const searchResponse = await page.goto(radarUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await assertAuto24Page(page, searchResponse?.status() ?? 0, true);
      const records = await extractAuto24Rows(page);
      for (const record of records) {
        const existing = recordsById.get(String(record.id));
        recordsById.set(String(record.id), {
          ...(existing || record),
          candidateRadarIds: [
            ...new Set([...(existing?.candidateRadarIds || []), ...radarIds]),
          ],
        });
      }
    }

    return [...recordsById.values()].map(translateAuto24Record);
  } finally {
    await browser.close();
  }
}

async function loadActiveAuto24Radars(database: D1Database) {
  const radarResult = await database
    .prepare(
      `SELECT r.id, r.user_email, r.sources, f.filter_json
       FROM radars r
       LEFT JOIN radar_filters f ON f.radar_id = r.id
       WHERE r.enabled = 1`,
    )
    .all<ActiveRadar>();
  return radarResult.results
    .filter((radar) => parseSources(radar.sources).includes(SOURCE))
    .map((radar) => ({ ...radar, filters: parseFilters(radar.filter_json) }));
}

function buildAuto24SearchUrl(
  baseUrl: URL,
  filters: RadarQuery,
  makes: Array<{ value: string; label: string }>,
) {
  const url = new URL(baseUrl);
  url.pathname = "/kasutatud/nimekiri.php";
  url.search = "";
  url.searchParams.set("a", "100");
  url.searchParams.set("ad", "1");
  url.searchParams.set("ae", "1");
  url.searchParams.set("af", "100");
  url.searchParams.set("ak", "0");
  url.searchParams.set("otsi", "otsi");

  if (filters.make) {
    const wanted = foldVehicleValue(filters.make);
    const make = makes.find((option) => foldVehicleValue(option.label) === wanted);
    if (!make?.value) return null;
    url.searchParams.set("b", make.value);
  }
  if (filters.model) url.searchParams.set("c", filters.model);
  setNumeric(url, "f1", filters.yearMin);
  setNumeric(url, "f2", filters.yearMax);
  setNumeric(url, "g1", filters.priceMin);
  setNumeric(url, "g2", filters.priceMax);
  setNumeric(url, "k1", filters.powerMin);
  setNumeric(url, "k2", filters.powerMax);
  setNumeric(url, "l1", filters.mileageMin);
  setNumeric(url, "l2", filters.mileageMax);
  appendMapped(url, "h[]", auto24FilterValues.fuel, filters.fuel);
  appendMapped(url, "i[]", auto24FilterValues.transmission, filters.transmission);
  appendMapped(url, "j[]", auto24FilterValues.bodyType, filters.bodyType);
  appendMapped(url, "p[]", auto24FilterValues.drivetrain, filters.drivetrain);
  appendMapped(url, "ab[]", auto24FilterValues.location, filters.location);
  return url;
}

function setNumeric(url: URL, key: string, value?: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    url.searchParams.set(key, String(Math.round(value)));
  }
}

function appendMapped(
  url: URL,
  key: string,
  map: Record<string, readonly string[]>,
  value?: string,
) {
  if (!value) return;
  for (const mapped of map[value] || []) url.searchParams.append(key, mapped);
}

function foldVehicleValue(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("en");
  if (normalized === "mercedes") return "mercedesbenz";
  return normalized;
}

async function assertAuto24Page(
  page: Page,
  status: number,
  allowEmptyResults: boolean,
) {
  const inspectionJson = await page.evaluate(() =>
    JSON.stringify({
      title: document.title,
      text: document.body?.innerText.slice(0, 800) || "",
      rows: document.querySelectorAll(".result-row").length,
      hasSearchForm: Boolean(document.querySelector("#searchParam-cmm-1-make")),
    }),
  );
  const inspection = JSON.parse(inspectionJson) as {
    title: string;
    text: string;
    rows: number;
    hasSearchForm: boolean;
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
  if (!inspection.hasSearchForm || (!allowEmptyResults && !inspection.rows)) {
    throw new Error("Auto24 открылся, но форма или строки результатов не найдены — возможно, изменилась разметка");
  }
}

async function extractAuto24Rows(
  page: Page,
) {
  const recordsJson = await page.evaluate(() =>
    JSON.stringify(
      Array.from(document.querySelectorAll(".result-row"))
        .slice(0, 100)
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
            drivetrain: text(".extra .drive"),
            powerKw: engine ? Number(engine.match(/(\d+)\s*kW/i)?.[1] || 0) || null : null,
          };
        })
        .filter((record) => record.id && record.title),
    ),
  );
  return JSON.parse(recordsJson) as ExtractedAuto24Record[];
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
