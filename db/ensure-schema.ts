import { env } from "cloudflare:workers";

let schemaReady: Promise<unknown> | null = null;

export async function ensureSchema(database: D1Database = env.DB) {
  if (!database) throw new Error("D1 binding DB is unavailable");
  schemaReady ??= database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS radars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      sources TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS radars_user_email_idx ON radars(user_email)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS radar_filters (
      radar_id INTEGER PRIMARY KEY NOT NULL REFERENCES radars(id) ON DELETE CASCADE,
      filter_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      make TEXT,
      model TEXT,
      price_eur INTEGER,
      year INTEGER,
      mileage_km INTEGER,
      fuel TEXT,
      transmission TEXT,
      location TEXT,
      image_url TEXT,
      raw_json TEXT,
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      active INTEGER NOT NULL DEFAULT 1
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS listings_source_external_idx ON listings(source, external_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS listings_last_seen_idx ON listings(last_seen_at)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS radar_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      radar_id INTEGER NOT NULL REFERENCES radars(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      notification_state TEXT NOT NULL DEFAULT 'pending'
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS radar_matches_unique_idx ON radar_matches(radar_id, listing_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS radar_matches_matched_at_idx ON radar_matches(matched_at)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS source_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      received_count INTEGER NOT NULL DEFAULT 0,
      new_listing_count INTEGER NOT NULL DEFAULT 0,
      new_match_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS source_runs_source_started_idx ON source_runs(source, started_at)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES radar_matches(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      external_message_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_match_channel_idx ON notification_deliveries(match_id, channel)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS telegram_connections (
      user_email TEXT PRIMARY KEY NOT NULL,
      chat_id TEXT,
      connect_code TEXT NOT NULL,
      connected INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      external_listing_id TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_listing_idx ON favorites(user_email, source, external_listing_id)"),
  ]);
  await schemaReady;
}
