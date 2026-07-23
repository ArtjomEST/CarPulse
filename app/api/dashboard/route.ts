import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../db/ensure-schema";
import {
  authErrorResponse,
  AuthError,
  requireSameOrigin,
  requireUser,
} from "../../../lib/auth";
import type { RadarQuery } from "../../../lib/sources/types";

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
  radar_id: number;
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
    const user = await requireUser(env.DB, request);
    const collectorMode =
      (env as unknown as { AUTO24_MODE?: string }).AUTO24_MODE === "external"
        ? "external"
        : "browser";
    const [radarResult, listingResult, telegram, auto24Run, favoriteResult] = await Promise.all([
      env.DB.prepare(
        `SELECT r.id, r.name, r.query, r.sources, r.enabled, r.created_at,
                f.filter_json,
                COUNT(rm.id) AS matches,
                MAX(rm.matched_at) AS last_match_at
         FROM radars r
         LEFT JOIN radar_filters f ON f.radar_id = r.id
         LEFT JOIN radar_matches rm ON rm.radar_id = r.id
         WHERE r.user_id = ?
         GROUP BY r.id
         ORDER BY r.id DESC`,
      )
        .bind(user.id)
        .all<RadarRow>(),
      env.DB.prepare(
        `SELECT l.id, r.id AS radar_id, l.external_id, l.url, l.title, l.make, l.model,
                l.price_eur, l.year, l.mileage_km, l.fuel, l.transmission,
                l.location, l.image_url, l.raw_json, l.source,
                rm.matched_at, r.name AS radar_name
         FROM radar_matches rm
         INNER JOIN listings l ON l.id = rm.listing_id
         INNER JOIN radars r ON r.id = rm.radar_id
         WHERE r.user_id = ?
         ORDER BY rm.matched_at DESC
         LIMIT 500`,
      )
        .bind(user.id)
        .all<ListingRow>(),
      env.DB.prepare(
        `SELECT chat_id, telegram_username, telegram_first_name, connected,
                connected_at, code_expires_at, updated_at
         FROM telegram_accounts WHERE user_id = ?`,
      )
        .bind(user.id)
        .first(),
      env.DB.prepare(
        `SELECT id, status, received_count, new_listing_count, new_match_count,
                error_message, started_at, finished_at
         FROM source_runs WHERE source = 'Auto24'
         ORDER BY id DESC LIMIT 1`,
      ).first(),
      env.DB.prepare(
        "SELECT listing_id FROM user_favorites WHERE user_id = ? ORDER BY id DESC",
      )
        .bind(user.id)
        .all<{ listing_id: number }>(),
    ]);

    const groupedListings = new Map<
      number,
      {
        listing: ListingRow;
        radars: Map<number, string>;
      }
    >();
    for (const listing of listingResult.results) {
      const existing = groupedListings.get(listing.id);
      if (existing) {
        existing.radars.set(listing.radar_id, listing.radar_name);
        continue;
      }
      if (groupedListings.size >= 50) continue;
      groupedListings.set(listing.id, {
        listing,
        radars: new Map([[listing.radar_id, listing.radar_name]]),
      });
    }

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
      listings: [...groupedListings.values()].map(({ listing, radars }) => {
        const raw = parseJson<Record<string, unknown>>(listing.raw_json, {});
        const radarMatches = [...radars].map(([id, name]) => ({ id, name }));
        return {
          id: listing.id,
          radarId: listing.radar_id,
          radars: radarMatches,
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
          radarName: [...new Set(radarMatches.map((radar) => radar.name))].join(
            " · ",
          ),
          powerKw: typeof raw.powerKw === "number" ? raw.powerKw : null,
          bodyType: typeof raw.bodyType === "string" ? raw.bodyType : null,
        };
      }),
      telegram,
      favorites: favoriteResult.results.map((favorite) => favorite.listing_id),
      sources: {
        Auto24: {
          intervalMinutes: 30,
          mode: collectorMode,
          lastRun: auto24Run,
        },
        "SS.lv": { mode: "not_connected" },
        Nettiauto: { mode: "not_connected" },
        "mobile.de": { mode: "not_connected" },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureSchema();
    const user = await requireUser(env.DB, request);
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
      listingId?: number;
    };

    if (payload.action === "create_radar") {
      const name = payload.radar?.name?.trim();
      if (!name) return Response.json({ error: "Укажите название радара" }, { status: 400 });
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM radars WHERE user_id = ?")
        .bind(user.id)
        .first<{ count: number }>();
      if (Number(count?.count || 0) >= 10) {
        return Response.json({ error: "Для MVP доступно не больше 10 радаров" }, { status: 409 });
      }

      const sources = (payload.radar?.sources || ["Auto24"])
        .filter((source) => ALLOWED_SOURCES.has(source))
        .slice(0, 4);
      const filters = normalizeFilters(payload.radar?.filters);
      const created = await env.DB.prepare(
        `INSERT INTO radars (user_id, user_email, name, query, sources, enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, name, query, sources, enabled, created_at`,
      )
        .bind(
          user.id,
          user.email,
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
        `UPDATE radars SET enabled = ? WHERE id = ? AND user_id = ?
         RETURNING id, enabled`,
      )
        .bind(payload.enabled ? 1 : 0, id, user.id)
        .first<{ id: number; enabled: number }>();
      if (!updated) return Response.json({ error: "Радар не найден" }, { status: 404 });
      return Response.json({ id: updated.id, enabled: Boolean(updated.enabled) });
    }

    if (payload.action === "update_radar") {
      const id = Number(payload.radar?.id);
      const name = payload.radar?.name?.trim();
      if (!Number.isInteger(id)) {
        return Response.json({ error: "Некорректный ID радара" }, { status: 400 });
      }
      if (!name) {
        return Response.json({ error: "Укажите название радара" }, { status: 400 });
      }
      const owned = await env.DB.prepare(
        "SELECT id FROM radars WHERE id = ? AND user_id = ?",
      )
        .bind(id, user.id)
        .first<{ id: number }>();
      if (!owned) return Response.json({ error: "Радар не найден" }, { status: 404 });

      const sources = (payload.radar?.sources || ["Auto24"])
        .filter((source) => ALLOWED_SOURCES.has(source))
        .slice(0, 4);
      const filters = normalizeFilters(payload.radar?.filters);
      const query = payload.radar?.query?.trim() || describeFilters(filters);
      const enabled = payload.radar?.enabled === false ? 0 : 1;

      await env.DB.batch([
        env.DB.prepare(
          `UPDATE radars
           SET name = ?, query = ?, sources = ?, enabled = ?
           WHERE id = ? AND user_id = ?`,
        ).bind(
          name,
          query,
          JSON.stringify(sources.length ? sources : ["Auto24"]),
          enabled,
          id,
          user.id,
        ),
        env.DB.prepare(
          `INSERT INTO radar_filters (radar_id, filter_json, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(radar_id) DO UPDATE SET
             filter_json = excluded.filter_json,
             updated_at = CURRENT_TIMESTAMP`,
        ).bind(id, JSON.stringify(filters)),
      ]);

      return Response.json({
        radar: {
          id,
          name,
          query,
          sources: sources.length ? sources : ["Auto24"],
          enabled: Boolean(enabled),
          filters,
        },
      });
    }

    if (payload.action === "delete_radar") {
      const id = Number(payload.id);
      if (!Number.isInteger(id)) {
        return Response.json({ error: "Некорректный ID радара" }, { status: 400 });
      }
      const deleted = await env.DB.prepare(
        `DELETE FROM radars
         WHERE id = ? AND user_id = ?
         RETURNING id`,
      )
        .bind(id, user.id)
        .first<{ id: number }>();
      if (!deleted) return Response.json({ error: "Радар не найден" }, { status: 404 });
      return Response.json({ id: deleted.id, deleted: true });
    }

    if (payload.action === "toggle_favorite") {
      const listingId = Number(payload.listingId);
      if (!Number.isInteger(listingId) || listingId <= 0) {
        return Response.json({ error: "Некорректное объявление" }, { status: 400 });
      }
      const ownedListing = await env.DB
        .prepare(
          `SELECT l.id, l.external_id, l.source
           FROM listings l
           WHERE l.id = ? AND EXISTS (
             SELECT 1
             FROM radar_matches rm
             INNER JOIN radars r ON r.id = rm.radar_id
             WHERE rm.listing_id = l.id AND r.user_id = ?
           )`,
        )
        .bind(listingId, user.id)
        .first<{ id: number; external_id: string; source: string }>();
      if (!ownedListing) {
        return Response.json({ error: "Объявление не найдено в ваших радарах" }, { status: 404 });
      }
      const existing = await env.DB
        .prepare(
          "SELECT id FROM user_favorites WHERE user_id = ? AND listing_id = ?",
        )
        .bind(user.id, listingId)
        .first<{ id: number }>();
      if (existing) {
        await env.DB
          .prepare("DELETE FROM user_favorites WHERE id = ? AND user_id = ?")
          .bind(existing.id, user.id)
          .run();
        return Response.json({ listingId, favorite: false });
      }
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO user_favorites (user_id, listing_id)
           VALUES (?, ?)`,
        )
        .bind(user.id, listingId)
        .run();
      return Response.json({ listingId, favorite: true });
    }

    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
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
