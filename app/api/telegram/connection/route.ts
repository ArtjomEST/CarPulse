import { env } from "cloudflare:workers";
import {
  authErrorResponse,
  AuthError,
  requireSameOrigin,
  requireUser,
} from "../../../../lib/auth";
import {
  createTelegramConnectCode,
  getTelegramBotIdentity,
  sendTelegramText,
  telegramCodeHash,
} from "../../../../lib/telegram";

type TelegramRuntimeEnv = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
};

function runtimeEnv() {
  return env as unknown as TelegramRuntimeEnv;
}

export async function GET(request: Request) {
  try {
    const telegramEnv = runtimeEnv();
    const user = await requireUser(telegramEnv.DB, request);
    const connection = await telegramEnv.DB
      .prepare(
        `SELECT chat_id, telegram_username, telegram_first_name, connected,
                connected_at, code_expires_at, updated_at
         FROM telegram_accounts WHERE user_id = ?`,
      )
      .bind(user.id)
      .first<{
        chat_id: string | null;
        telegram_username: string | null;
        telegram_first_name: string | null;
        connected: number;
        connected_at: string | null;
        code_expires_at: string | null;
        updated_at: string;
      }>();

    return Response.json({
      configured: Boolean(telegramEnv.TELEGRAM_BOT_TOKEN),
      connection: connection
        ? {
            connected: Boolean(connection.connected),
            username: connection.telegram_username,
            firstName: connection.telegram_first_name,
            connectedAt: connection.connected_at,
            codeExpiresAt: connection.code_expires_at,
            updatedAt: connection.updated_at,
          }
        : { connected: false },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const telegramEnv = runtimeEnv();
    const user = await requireUser(telegramEnv.DB, request);
    const payload = (await request.json()) as { action?: string };

    if (payload.action === "create_code") {
      if (!telegramEnv.TELEGRAM_BOT_TOKEN) {
        throw new AuthError(
          "Telegram-бот ещё не настроен администратором.",
          503,
          "telegram_not_configured",
        );
      }
      const [bot, code] = await Promise.all([
        getTelegramBotIdentity(telegramEnv.TELEGRAM_BOT_TOKEN),
        Promise.resolve(createTelegramConnectCode()),
      ]);
      const codeHash = await telegramCodeHash(code);
      const expiresAt = new Date(Date.now() + 15 * 60_000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      await telegramEnv.DB
        .prepare(
          `INSERT INTO telegram_accounts (
             user_id, connected, connect_code_hash, code_expires_at, updated_at
           ) VALUES (?, 0, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             chat_id = NULL,
             telegram_username = NULL,
             telegram_first_name = NULL,
             connected = 0,
             connected_at = NULL,
             connect_code_hash = excluded.connect_code_hash,
             code_expires_at = excluded.code_expires_at,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(user.id, codeHash, expiresAt)
        .run();

      return Response.json({
        code,
        expiresAt,
        botUsername: bot.username,
        deepLink: `https://t.me/${bot.username}?start=${encodeURIComponent(code)}`,
      });
    }

    if (payload.action === "disconnect") {
      await telegramEnv.DB
        .prepare(
          `UPDATE telegram_accounts
           SET chat_id = NULL, telegram_username = NULL,
               telegram_first_name = NULL, connected = 0,
               connected_at = NULL, connect_code_hash = NULL,
               code_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
        )
        .bind(user.id)
        .run();
      return Response.json({ disconnected: true });
    }

    if (payload.action === "test") {
      if (!telegramEnv.TELEGRAM_BOT_TOKEN) {
        throw new AuthError(
          "Telegram-бот ещё не настроен.",
          503,
          "telegram_not_configured",
        );
      }
      const connection = await telegramEnv.DB
        .prepare(
          `SELECT chat_id FROM telegram_accounts
           WHERE user_id = ? AND connected = 1 AND chat_id IS NOT NULL`,
        )
        .bind(user.id)
        .first<{ chat_id: string }>();
      if (!connection) {
        throw new AuthError(
          "Сначала подключите Telegram к аккаунту.",
          409,
          "telegram_not_connected",
        );
      }
      await sendTelegramText(telegramEnv.TELEGRAM_BOT_TOKEN, {
        chatId: connection.chat_id,
        text:
          "✅ <b>CarPulse подключён</b>\nТестовое сообщение доставлено. Новые совпадения будут приходить в этот чат.",
      });
      return Response.json({ sent: true });
    }

    throw new AuthError("Неизвестное действие Telegram.", 400, "unknown_action");
  } catch (error) {
    return authErrorResponse(error);
  }
}
