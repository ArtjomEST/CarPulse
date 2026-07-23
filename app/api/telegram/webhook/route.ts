import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../db/ensure-schema";
import {
  deriveTelegramWebhookSecret,
  parseTelegramConnectCode,
  sendTelegramText,
  telegramCodeHash,
} from "../../../../lib/telegram";

type TelegramRuntimeEnv = {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
    };
  };
};

function runtimeEnv() {
  return env as unknown as TelegramRuntimeEnv;
}

export async function POST(request: Request) {
  const telegramEnv = runtimeEnv();
  if (!telegramEnv.TELEGRAM_BOT_TOKEN) {
    return Response.json({ error: "Telegram bot is not configured" }, { status: 503 });
  }

  const expectedSecret = await deriveTelegramWebhookSecret(
    telegramEnv.TELEGRAM_BOT_TOKEN,
  );
  if (
    request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret
  ) {
    return Response.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  await ensureSchema(telegramEnv.DB);
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message?.text || message.chat.type !== "private") {
    return Response.json({ accepted: true });
  }

  const chatId = String(message.chat.id);
  if (/^\/stop(?:@\w+)?$/iu.test(message.text.trim())) {
    await telegramEnv.DB
      .prepare(
        `UPDATE telegram_accounts
         SET chat_id = NULL, telegram_username = NULL,
             telegram_first_name = NULL, connected = 0,
             connected_at = NULL, connect_code_hash = NULL,
             code_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE chat_id = ?`,
      )
      .bind(chatId)
      .run();
    await sendTelegramText(telegramEnv.TELEGRAM_BOT_TOKEN, {
      chatId,
      text:
        "Уведомления CarPulse отключены. Подключить этот чат снова можно в настройках аккаунта.",
    });
    return Response.json({ accepted: true, disconnected: true });
  }

  const code = parseTelegramConnectCode(message.text);
  if (!code) {
    await sendTelegramText(telegramEnv.TELEGRAM_BOT_TOKEN, {
      chatId,
      text:
        "Откройте CarPulse → Настройки → Telegram и отправьте сюда одноразовый код подключения.",
    });
    return Response.json({ accepted: true });
  }

  const account = await telegramEnv.DB
    .prepare(
      `SELECT ta.user_id, u.name
       FROM telegram_accounts ta
       INNER JOIN users u ON u.id = ta.user_id
       WHERE ta.connect_code_hash = ?
         AND ta.code_expires_at > CURRENT_TIMESTAMP
         AND u.status = 'active'
       LIMIT 1`,
    )
    .bind(await telegramCodeHash(code))
    .first<{ user_id: number; name: string }>();
  if (!account) {
    await sendTelegramText(telegramEnv.TELEGRAM_BOT_TOKEN, {
      chatId,
      text:
        "Этот код не найден или уже истёк. Создайте новый код в настройках CarPulse.",
    });
    return Response.json({ accepted: true, connected: false });
  }

  const occupied = await telegramEnv.DB
    .prepare(
      `SELECT user_id FROM telegram_accounts
       WHERE chat_id = ? AND user_id != ? AND connected = 1`,
    )
    .bind(chatId, account.user_id)
    .first<{ user_id: number }>();
  if (occupied) {
    await sendTelegramText(telegramEnv.TELEGRAM_BOT_TOKEN, {
      chatId,
      text:
        "Этот Telegram-чат уже подключён к другому аккаунту CarPulse. Сначала отключите его командой /stop.",
    });
    return Response.json({ accepted: true, connected: false });
  }

  await telegramEnv.DB
    .prepare(
      `UPDATE telegram_accounts
       SET chat_id = ?, telegram_username = ?, telegram_first_name = ?,
           connected = 1, connected_at = CURRENT_TIMESTAMP,
           connect_code_hash = NULL, code_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .bind(
      chatId,
      message.chat.username || null,
      message.chat.first_name || null,
      account.user_id,
    )
    .run();
  await sendTelegramText(telegramEnv.TELEGRAM_BOT_TOKEN, {
    chatId,
    text:
      `✅ <b>Telegram подключён</b>\n${escapeHtml(account.name)}, новые совпадения CarPulse будут приходить в этот чат.`,
  });
  return Response.json({ accepted: true, connected: true });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
