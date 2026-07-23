import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(600000),
  role: text("role").notNull().default("user"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastLoginAt: text("last_login_at"),
}, (table) => [
  uniqueIndex("users_email_unique_idx").on(table.email),
  index("users_role_status_idx").on(table.role, table.status),
]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  userAgent: text("user_agent"),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

export const loginAttempts = sqliteTable("login_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  failureCount: integer("failure_count").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  blockedUntil: text("blocked_until"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const radars = sqliteTable("radars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  userEmail: text("user_email").notNull(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  sources: text("sources").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("radars_user_id_idx").on(table.userId),
  index("radars_user_email_idx").on(table.userEmail),
]);

export const radarFilters = sqliteTable("radar_filters", {
  radarId: integer("radar_id").primaryKey().references(() => radars.id, { onDelete: "cascade" }),
  filterJson: text("filter_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const listings = sqliteTable("listings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  externalId: text("external_id").notNull(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  make: text("make"),
  model: text("model"),
  priceEur: integer("price_eur"),
  year: integer("year"),
  mileageKm: integer("mileage_km"),
  fuel: text("fuel"),
  transmission: text("transmission"),
  location: text("location"),
  imageUrl: text("image_url"),
  rawJson: text("raw_json"),
  firstSeenAt: text("first_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [
  uniqueIndex("listings_source_external_idx").on(table.source, table.externalId),
  index("listings_last_seen_idx").on(table.lastSeenAt),
]);

export const radarMatches = sqliteTable("radar_matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  radarId: integer("radar_id").notNull().references(() => radars.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  matchedAt: text("matched_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  notificationState: text("notification_state").notNull().default("pending"),
}, (table) => [
  uniqueIndex("radar_matches_unique_idx").on(table.radarId, table.listingId),
  index("radar_matches_matched_at_idx").on(table.matchedAt),
]);

export const sourceRuns = sqliteTable("source_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  status: text("status").notNull(),
  receivedCount: integer("received_count").notNull().default(0),
  newListingCount: integer("new_listing_count").notNull().default(0),
  newMatchCount: integer("new_match_count").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
}, (table) => [index("source_runs_source_started_idx").on(table.source, table.startedAt)]);

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matchId: integer("match_id").notNull().references(() => radarMatches.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  externalMessageId: text("external_message_id"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sentAt: text("sent_at"),
}, (table) => [
  uniqueIndex("notification_delivery_match_channel_idx").on(table.matchId, table.channel),
  index("notification_deliveries_retry_idx").on(table.status, table.nextAttemptAt),
]);

// Kept for compatibility with the pre-account MVP. New Telegram connections use
// telegram_accounts and are owned by user_id.
export const telegramConnections = sqliteTable("telegram_connections", {
  userEmail: text("user_email").primaryKey(),
  chatId: text("chat_id"),
  connectCode: text("connect_code").notNull(),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const telegramAccounts = sqliteTable("telegram_accounts", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id"),
  telegramUsername: text("telegram_username"),
  telegramFirstName: text("telegram_first_name"),
  connectCodeHash: text("connect_code_hash"),
  codeExpiresAt: text("code_expires_at"),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  connectedAt: text("connected_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("telegram_accounts_chat_id_unique_idx").on(table.chatId),
  index("telegram_accounts_code_hash_idx").on(table.connectCodeHash),
]);

export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  externalListingId: text("external_listing_id").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("favorites_user_listing_idx").on(table.userEmail, table.source, table.externalListingId)]);

export const userFavorites = sqliteTable("user_favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("user_favorites_user_listing_idx").on(table.userId, table.listingId),
  index("user_favorites_user_created_idx").on(table.userId, table.createdAt),
]);
