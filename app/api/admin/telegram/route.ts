import { env } from "cloudflare:workers";
import {
  authErrorResponse,
  AuthError,
  requireAdmin,
  requireSameOrigin,
} from "../../../../lib/auth";
import {
  configureTelegramWebhook,
  getTelegramBotIdentity,
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
    await requireAdmin(telegramEnv.DB, request);
    if (!telegramEnv.TELEGRAM_BOT_TOKEN) {
      return Response.json({ configured: false });
    }
    const bot = await getTelegramBotIdentity(telegramEnv.TELEGRAM_BOT_TOKEN);
    return Response.json({
      configured: true,
      bot: {
        id: bot.id,
        username: bot.username,
        name: bot.first_name,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const telegramEnv = runtimeEnv();
    await requireAdmin(telegramEnv.DB, request);
    if (!telegramEnv.TELEGRAM_BOT_TOKEN) {
      throw new AuthError(
        "Сначала добавьте TELEGRAM_BOT_TOKEN в защищённые переменные Sites.",
        503,
        "telegram_not_configured",
      );
    }
    const webhookUrl = new URL("/api/telegram/webhook", request.url).toString();
    await configureTelegramWebhook(
      telegramEnv.TELEGRAM_BOT_TOKEN,
      webhookUrl,
    );
    const bot = await getTelegramBotIdentity(telegramEnv.TELEGRAM_BOT_TOKEN);
    return Response.json({
      configured: true,
      webhookUrl,
      bot: {
        id: bot.id,
        username: bot.username,
        name: bot.first_name,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
