import { sha256 } from "./auth";

type TelegramAlert = {
  chatId: string;
  title: string;
  price: string;
  details: string;
  url: string;
};

type TelegramApiEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramMessage = {
  message_id: number;
};

export type TelegramBotIdentity = {
  id: number;
  username: string;
  first_name: string;
};

export function createTelegramConnectCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = crypto.getRandomValues(new Uint8Array(8));
  let suffix = "";
  for (const value of random) suffix += alphabet[value % alphabet.length];
  return `CP_${suffix}`;
}

export function parseTelegramConnectCode(text?: string | null) {
  const normalized = (text || "").trim().toLocaleUpperCase("en");
  const startMatch = normalized.match(/^\/START(?:@\w+)?\s+([A-Z0-9_-]{4,64})$/u);
  const plainMatch = normalized.match(/^([A-Z0-9_-]{4,64})$/u);
  const code = startMatch?.[1] || plainMatch?.[1] || null;
  return code?.startsWith("CP_") ? code : null;
}

export async function telegramCodeHash(code: string) {
  return sha256(code.trim().toLocaleUpperCase("en"));
}

export async function deriveTelegramWebhookSecret(botToken: string) {
  return sha256(`carpulse-telegram-webhook:${botToken}`);
}

export async function getTelegramBotIdentity(botToken: string) {
  return telegramApi<TelegramBotIdentity>(botToken, "getMe", {});
}

export async function configureTelegramWebhook(
  botToken: string,
  webhookUrl: string,
) {
  const url = new URL(webhookUrl);
  if (url.protocol !== "https:") {
    throw new Error("Telegram webhook должен использовать HTTPS");
  }
  return telegramApi<boolean>(botToken, "setWebhook", {
    url: url.toString(),
    secret_token: await deriveTelegramWebhookSecret(botToken),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

export async function sendTelegramText(
  botToken: string,
  input: {
    chatId: string;
    text: string;
    button?: { text: string; url: string };
  },
) {
  return telegramApi<TelegramMessage>(botToken, "sendMessage", {
    chat_id: input.chatId,
    text: input.text,
    parse_mode: "HTML",
    ...(input.button
      ? {
          reply_markup: {
            inline_keyboard: [[input.button]],
          },
        }
      : {}),
  });
}

export async function sendTelegramAlert(
  alert: TelegramAlert,
  botToken: string,
) {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN не настроен");

  const text = [
    `🚗 <b>${escapeHtml(alert.title)}</b>`,
    `<b>${escapeHtml(alert.price)}</b>`,
    escapeHtml(alert.details),
  ].join("\n");

  const message = await sendTelegramText(botToken, {
    chatId: alert.chatId,
    text,
    button: { text: "Открыть объявление", url: alert.url },
  });
  return String(message.message_id);
}

export async function deliverPendingTelegramNotifications(
  database: D1Database,
  botToken?: string,
  limit = 25,
) {
  if (!botToken) {
    return { processed: 0, sent: 0, failed: 0, configured: false };
  }

  const pending = await database
    .prepare(
      `SELECT nd.id, nd.attempt_count, ta.chat_id,
              l.title, l.url, l.price_eur, l.year, l.mileage_km,
              l.fuel, l.transmission,
              (
                SELECT GROUP_CONCAT(DISTINCT r2.name)
                FROM radar_matches rm2
                INNER JOIN radars r2 ON r2.id = rm2.radar_id
                WHERE rm2.listing_id = l.id AND r2.user_id = r.user_id
              ) AS radar_names
       FROM notification_deliveries nd
       INNER JOIN radar_matches rm ON rm.id = nd.match_id
       INNER JOIN listings l ON l.id = rm.listing_id
       INNER JOIN radars r ON r.id = rm.radar_id
       INNER JOIN users u ON u.id = r.user_id
       INNER JOIN telegram_accounts ta ON ta.user_id = r.user_id
       WHERE nd.channel = 'telegram'
         AND nd.status IN ('pending', 'failed')
         AND nd.attempt_count < 5
         AND (nd.next_attempt_at IS NULL OR nd.next_attempt_at <= CURRENT_TIMESTAMP)
         AND u.status = 'active'
         AND ta.connected = 1
         AND ta.chat_id IS NOT NULL
       ORDER BY nd.id
       LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(100, Math.round(limit))))
    .all<{
      id: number;
      attempt_count: number;
      chat_id: string;
      title: string;
      url: string;
      price_eur: number | null;
      year: number | null;
      mileage_km: number | null;
      fuel: string | null;
      transmission: string | null;
      radar_names: string | null;
    }>();

  let sent = 0;
  let failed = 0;
  for (const delivery of pending.results) {
    const claimed = await database
      .prepare(
        `UPDATE notification_deliveries
         SET status = 'sending'
         WHERE id = ? AND status IN ('pending', 'failed')`,
      )
      .bind(delivery.id)
      .run();
    if (!claimed.meta.changes) continue;

    try {
      const messageId = await sendTelegramAlert(
        {
          chatId: delivery.chat_id,
          title: delivery.title,
          price: delivery.price_eur
            ? `${new Intl.NumberFormat("ru-RU").format(delivery.price_eur)} €`
            : "Цена не указана",
          details: [
            delivery.year ? `${delivery.year} год` : null,
            delivery.mileage_km
              ? `${new Intl.NumberFormat("ru-RU").format(delivery.mileage_km)} км`
              : null,
            delivery.fuel,
            delivery.transmission,
            delivery.radar_names
              ? `Радар: ${delivery.radar_names.replaceAll(",", " · ")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
          url: delivery.url,
        },
        botToken,
      );
      await database
        .prepare(
          `UPDATE notification_deliveries
           SET status = 'sent', attempt_count = attempt_count + 1,
               external_message_id = ?, error_message = NULL,
               next_attempt_at = NULL, sent_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(messageId, delivery.id)
        .run();
      sent += 1;
    } catch (error) {
      const attempts = delivery.attempt_count + 1;
      const retryMinutes = [1, 5, 15, 60, 180][Math.min(attempts - 1, 4)];
      const nextAttemptAt = new Date(
        Date.now() + retryMinutes * 60_000,
      )
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      await database
        .prepare(
          `UPDATE notification_deliveries
           SET status = 'failed', attempt_count = ?,
               error_message = ?, next_attempt_at = ?
           WHERE id = ?`,
        )
        .bind(
          attempts,
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Неизвестная ошибка Telegram",
          nextAttemptAt,
          delivery.id,
        )
        .run();
      failed += 1;
    }
  }

  return {
    processed: sent + failed,
    sent,
    failed,
    configured: true,
  };
}

async function telegramApi<T>(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
) {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN не настроен");
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json()) as TelegramApiEnvelope<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(
      payload.description
        ? `Telegram API: ${payload.description}`
        : `Telegram API вернул HTTP ${response.status}`,
    );
  }
  return payload.result;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
