import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const radars = sqliteTable("radars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  sources: text("sources").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("radars_user_email_idx").on(table.userEmail)]);

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
  externalMessageId: text("external_message_id"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  sentAt: text("sent_at"),
}, (table) => [uniqueIndex("notification_delivery_match_channel_idx").on(table.matchId, table.channel)]);

export const telegramConnections = sqliteTable("telegram_connections", {
  userEmail: text("user_email").primaryKey(),
  chatId: text("chat_id"),
  connectCode: text("connect_code").notNull(),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  externalListingId: text("external_listing_id").notNull(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("favorites_user_listing_idx").on(table.userEmail, table.source, table.externalListingId)]);
