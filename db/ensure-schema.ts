import { env } from "cloudflare:workers";

let schemaReady: Promise<unknown> | null = null;

export async function ensureSchema(database: D1Database = env.DB) {
  if (!database) throw new Error("D1 binding DB is unavailable");
  schemaReady ??= initializeSchema(database);
  await schemaReady;
}

async function initializeSchema(database: D1Database) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL DEFAULT 600000,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at TEXT
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email)"),
    database.prepare("CREATE INDEX IF NOT EXISTS users_role_status_idx ON users(role, status)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT
    )`),
    database.prepare("CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key TEXT PRIMARY KEY NOT NULL,
      failure_count INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      blocked_until TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS radars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
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
    database.prepare(`CREATE TABLE IF NOT EXISTS telegram_accounts (
      user_id INTEGER PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chat_id TEXT,
      telegram_username TEXT,
      telegram_first_name TEXT,
      connect_code_hash TEXT,
      code_expires_at TEXT,
      connected INTEGER NOT NULL DEFAULT 0,
      connected_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS telegram_accounts_chat_id_unique_idx ON telegram_accounts(chat_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS telegram_accounts_code_hash_idx ON telegram_accounts(connect_code_hash)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      external_listing_id TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_listing_idx ON favorites(user_email, source, external_listing_id)"),
    database.prepare(`CREATE TABLE IF NOT EXISTS user_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS user_favorites_user_listing_idx ON user_favorites(user_id, listing_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS user_favorites_user_created_idx ON user_favorites(user_id, created_at)"),
  ]);

  // Existing MVP databases predate account ownership and delivery retries.
  await ensureColumn(database, "radars", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
  await ensureColumn(database, "notification_deliveries", "attempt_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(database, "notification_deliveries", "next_attempt_at", "TEXT");
  await database.batch([
    database.prepare("CREATE INDEX IF NOT EXISTS radars_user_id_idx ON radars(user_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS notification_deliveries_retry_idx ON notification_deliveries(status, next_attempt_at)"),
  ]);
}

async function ensureColumn(
  database: D1Database,
  table: string,
  column: string,
  declaration: string,
) {
  const info = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (info.results.some((item) => item.name === column)) return;
  await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`).run();
}
