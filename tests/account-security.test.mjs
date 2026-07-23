import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account authentication stores slow password hashes and protected sessions", async () => {
  const [auth, schema, migration] = await Promise.all([
    read("lib/auth.ts"),
    read("db/schema.ts"),
    read("drizzle/0002_chilly_kinsey_walden.sql"),
  ]);

  assert.match(auth, /PBKDF2/);
  assert.match(auth, /PASSWORD_ITERATIONS = 600_000/);
  assert.match(auth, /PBKDF2_OPERATION_LIMIT = 100_000/);
  assert.match(auth, /while \(remaining > 0\)/);
  assert.match(auth, /passwordSaltForRound/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /Secure/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(auth, /tokenHash/);
  assert.match(schema, /passwordHash: text\("password_hash"\)/);
  assert.match(schema, /passwordSalt: text\("password_salt"\)/);
  assert.match(migration, /CREATE TABLE `users`/);
  assert.match(migration, /CREATE TABLE `sessions`/);
});

test("dashboard ownership is based on authenticated user ids", async () => {
  const dashboard = await read("app/api/dashboard/route.ts");

  assert.match(dashboard, /requireUser\(env\.DB, request\)/);
  assert.match(dashboard, /WHERE r\.user_id = \?/);
  assert.match(dashboard, /WHERE id = \? AND user_id = \?/);
  assert.doesNotMatch(dashboard, /DEMO_EMAIL|demo@carpulse\.local/);
  assert.doesNotMatch(
    dashboard,
    /request\.headers\.get\("oai-authenticated-user-email"\)/,
  );
});

test("admin and Telegram endpoints enforce server-side authorization", async () => {
  const [admin, webhook, connection] = await Promise.all([
    read("app/api/admin/users/route.ts"),
    read("app/api/telegram/webhook/route.ts"),
    read("app/api/telegram/connection/route.ts"),
  ]);

  assert.match(admin, /requireAdmin\(env\.DB, request\)/);
  assert.match(admin, /last_admin_required/);
  assert.match(admin, /cannot_delete_self/);
  assert.match(webhook, /x-telegram-bot-api-secret-token/);
  assert.match(webhook, /code_expires_at > CURRENT_TIMESTAMP/);
  assert.match(connection, /createTelegramConnectCode/);
  assert.match(connection, /15 \* 60_000/);
});

test("runtime schema checks do not cache request-scoped D1 promises", async () => {
  const schemaBootstrap = await read("db/ensure-schema.ts");

  assert.match(schemaBootstrap, /SELECT id FROM users LIMIT 1/);
  assert.doesNotMatch(schemaBootstrap, /schemaReady\s*\?\?=/);
  assert.doesNotMatch(schemaBootstrap, /schemaReady:\s*Promise/);
});
