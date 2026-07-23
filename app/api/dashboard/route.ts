import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure-schema";
import type { RadarQuery } from "../../../lib/sources/types";

const DEMO_EMAIL = "demo@carpulse.local";
const ALLOWED_SOURCES = new Set(["Auto24", "SS.lv", "Nettiauto", "mobile.de"]);

type RadarRow = {
  id: number;
  name: string;
  query: string;
  sources: string;
  enabled: number;
  created_at: string;
  filter_json: string | null;
  matches: number;
  last_match_at: string | null;
};

type ListingRow = {
  id: number;
  external_id: string;
  url: string;
  title: string;
  make: string | null;
  model: string | null;
  price_eur: number | null;
  year: number | null;
  mileage_km: number | null;
  fuel: string | null;
  transmission: string | null;
  location: string | null;
  image_url: string | null;
  raw_json: string | null;
  source: string;
  matched_at: string;
  radar_name: string;
};

function userEmail(request: Request) {
  return request.headers.get("oai-authenticated-user-email") ?? DEMO_EMAIL;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  if (message.includes("no such table")) {
    return "База ещё не подготовлена. Примените миграции D1 и повторите запрос.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const email = userEmail(request);
    const [radarResult, listingResult, telegram, auto24Run] = await Promise.all([
      env.DB.prepare(
        `SELECT r.id, r.name, r.query, r.sources, r.enabled, r.created_at,
                f.filter_json,
                COUNT(rm.id) AS matches,
                MAX(rm.matched_at) AS last_match_at
         FROM radars r
         LEFT JOIN radar_filters f ON f.radar_id = r.id
         LEFT JOIN radar_matches rm ON rm.radar_id = r.id
         WHERE r.user_email = ?
         GROUP BY r.id
         ORDER BY r.id DESC`,
      )
        .bind(email)
        .all<RadarRow>(),
      env.DB.prepare(
        `SELECT l.id, l.external_id, l.url, l.title, l.make, l.model,
                l.price_eur, l.year, l.mileage_km, l.fuel, l.transmission,
                l.location, l.image_url, l.raw_json, l.source,
                rm.matched_at, r.name AS radar_name
         FROM radar_matches rm
         INNER JOIN listings l ON l.id = rm.listing_id
         INNER JOIN radars r ON r.id = rm.radar_id
         WHERE r.user_email = ?
         ORDER BY rm.matched_at DESC
         LIMIT 50`,
      )
        .bind(email)
        .all<ListingRow>(),
      env.DB.prepare(
        `SELECT user_email, chat_id, connect_code, connected, updated_at
         FROM telegram_connections WHERE user_email = ?`,
      )
        .bind(email)
        .first(),
      env.DB.prepare(
        `SELECT id, status, received_count, new_listing_count, new_match_count,
                error_message, started_at, finished_at
         FROM source_runs WHERE source = 'Auto24'
         ORDER BY id DESC LIMIT 1`,
      ).first(),
    ]);

    return Response.json({
      radars: radarResult.results.map((radar) => ({
        id: radar.id,
        name: radar.name,
        query: radar.query,
        sources: parseJson<string[]>(radar.sources, []),
        enabled: Boolean(radar.enabled),
        createdAt: radar.created_at,
        filters: parseJson<RadarQuery>(radar.filter_json, {}),
        matches: Number(radar.matches || 0),
        lastMatchAt: radar.last_match_at,
      })),
      listings: listingResult.results.map((listing) => {
        const raw = parseJson<Record<string, unknown>>(listing.raw_json, {});
        return {
          id: listing.id,
          externalId: listing.external_id,
          url: listing.url,
          title: listing.title,
          make: listing.make,
          model: listing.model,
          priceEur: listing.price_eur,
          year: listing.year,
          mileageKm: listing.mileage_km,
          fuel: listing.fuel,
          transmission: listing.transmission,
          location: listing.location,
          imageUrl: listing.image_url,
          source: listing.source,
          matchedAt: listing.matched_at,
          radarName: listing.radar_name,
          powerKw: typeof raw.powerKw === "number" ? raw.powerKw : null,
          bodyType: typeof raw.bodyType === "string" ? raw.bodyType : null,
        };
      }),
      telegram,
      sources: {
        Auto24: {
          intervalMinutes: 30,
          mode: "browser",
          lastRun: auto24Run,
        },
        "SS.lv": { mode: "not_connected" },
        Nettiauto: { mode: "not_connected" },
        "mobile.de": { mode: "not_connected" },
      },
    });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const email = userEmail(request);
    const payload = (await request.json()) as {
      action?: string;
      radar?: {
        id?: number;
        name?: string;
        query?: string;
        sources?: string[];
        enabled?: boolean;
        filters?: RadarQuery;
      };
      id?: number;
      enabled?: boolean;
    };

    if (payload.action === "create_radar") {
      const name = payload.radar?.name?.trim();
      if (!name) return Response.json({ error: "Укажите название радара" }, { status: 400 });
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM radars WHERE user_email = ?")
        .bind(email)
        .first<{ count: number }>();
      if (Number(count?.count || 0) >= 10) {
        return Response.json({ error: "Для MVP доступно не больше 10 радаров" }, { status: 409 });
      }

      const sources = (payload.radar?.sources || ["Auto24"])
        .filter((source) => ALLOWED_SOURCES.has(source))
        .slice(0, 4);
      const filters = normalizeFilters(payload.radar?.filters);
      const created = await env.DB.prepare(
        `INSERT INTO radars (user_email, name, query, sources, enabled)
         VALUES (?, ?, ?, ?, ?) RETURNING id, name, query, sources, enabled, created_at`,
      )
        .bind(
          email,
          name,
          payload.radar?.query?.trim() || describeFilters(filters),
          JSON.stringify(sources.length ? sources : ["Auto24"]),
          payload.radar?.enabled === false ? 0 : 1,
        )
        .first<{
          id: number;
          name: string;
          query: string;
          sources: string;
          enabled: number;
          created_at: string;
        }>();
      if (!created) throw new Error("Не удалось сохранить радар");

      await env.DB.prepare(
        "INSERT INTO radar_filters (radar_id, filter_json) VALUES (?, ?)",
      )
        .bind(created.id, JSON.stringify(filters))
        .run();

      return Response.json(
        {
          radar: {
            id: created.id,
            name: created.name,
            query: created.query,
            sources: parseJson<string[]>(created.sources, []),
            enabled: Boolean(created.enabled),
            createdAt: created.created_at,
            filters,
            matches: 0,
            lastMatchAt: null,
          },
        },
        { status: 201 },
      );
    }

    if (payload.action === "toggle_radar") {
      const id = Number(payload.id);
      if (!Number.isInteger(id)) {
        return Response.json({ error: "Некорректный ID радара" }, { status: 400 });
      }
      const updated = await env.DB.prepare(
        `UPDATE radars SET enabled = ? WHERE id = ? AND user_email = ?
         RETURNING id, enabled`,
      )
        .bind(payload.enabled ? 1 : 0, id, email)
        .first<{ id: number; enabled: number }>();
      if (!updated) return Response.json({ error: "Радар не найден" }, { status: 404 });
      return Response.json({ id: updated.id, enabled: Boolean(updated.enabled) });
    }

    if (payload.action === "telegram_code") {
      const connectCode = `CP-${Math.floor(1000 + Math.random() * 9000)}`;
      await env.DB.prepare(
        `INSERT INTO telegram_connections (user_email, connect_code, connected)
         VALUES (?, ?, 0)
         ON CONFLICT(user_email) DO UPDATE SET
           connect_code = excluded.connect_code,
           connected = 0,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(email, connectCode)
        .run();
      return Response.json({ connectCode });
    }

    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

function normalizeFilters(filters?: RadarQuery): RadarQuery {
  const text = (value?: string) => value?.trim() || undefined;
  const integer = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.round(value)
      : undefined;
  return {
    catalogMakeId: text(filters?.catalogMakeId),
    catalogModelId: text(filters?.catalogModelId),
    make: text(filters?.make),
    model: text(filters?.model),
    priceMin: integer(filters?.priceMin),
    priceMax: integer(filters?.priceMax),
    yearMin: integer(filters?.yearMin),
    yearMax: integer(filters?.yearMax),
    mileageMin: integer(filters?.mileageMin),
    mileageMax: integer(filters?.mileageMax),
    powerMin: integer(filters?.powerMin),
    powerMax: integer(filters?.powerMax),
    fuel: text(filters?.fuel),
    transmission: text(filters?.transmission),
    bodyType: text(filters?.bodyType),
    drivetrain: text(filters?.drivetrain),
    location: text(filters?.location),
  };
}

function describeFilters(filters: RadarQuery) {
  const vehicle = [filters.make, filters.model].filter(Boolean).join(" ") || "Все марки";
  const parts = [vehicle];
  if (filters.yearMin || filters.yearMax) {
    parts.push(`${filters.yearMin || "…"}–${filters.yearMax || "…"}`);
  }
  if (filters.priceMin || filters.priceMax) {
    parts.push(`${filters.priceMin || 0}–${filters.priceMax || "…"} €`);
  }
  if (filters.mileageMin || filters.mileageMax) {
    parts.push(`${filters.mileageMin || 0}–${filters.mileageMax || "…"} км`);
  }
  return parts.join(" · ");
}

function parseJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
