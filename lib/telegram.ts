type TelegramAlert = {
  chatId: string;
  title: string;
  price: string;
  details: string;
  url: string;
};

export async function sendTelegramAlert(alert: TelegramAlert, botToken = process.env.TELEGRAM_BOT_TOKEN) {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN не настроен");

  const text = [
    `🚗 <b>${escapeHtml(alert.title)}</b>`,
    `<b>${escapeHtml(alert.price)}</b>`,
    escapeHtml(alert.details),
  ].join("\n");

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: alert.chatId,
      text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "Открыть объявление", url: alert.url }]] },
    }),
  });

  if (!response.ok) throw new Error(`Telegram API вернул ${response.status}`);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
