import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const radars = sqliteTable("radars", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userEmail: text("user_email").notNull(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  sources: text("sources").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
});
