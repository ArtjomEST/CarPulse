import { env } from "cloudflare:workers";
import {
  authErrorResponse,
  AuthError,
  bootstrapOwnerEmail,
  createSession,
  createUser,
  normalizeEmail,
  requireSameOrigin,
  sessionCookie,
} from "../../../../lib/auth";
import { ensureSchema } from "../../../../db/ensure-schema";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureSchema(env.DB);
    const ownerEmail = bootstrapOwnerEmail(request);
    if (!ownerEmail) {
      throw new AuthError(
        "Первого администратора можно создать только через закрытый доступ владельца.",
        403,
        "owner_identity_required",
      );
    }

    const count = await env.DB
      .prepare("SELECT COUNT(*) AS count FROM users")
      .first<{ count: number }>();
    if (Number(count?.count || 0) > 0) {
      throw new AuthError(
        "Администратор уже создан. Используйте обычный вход.",
        409,
        "bootstrap_complete",
      );
    }

    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };
    if (normalizeEmail(payload.email || "") !== normalizeEmail(ownerEmail)) {
      throw new AuthError(
        "Почта администратора должна совпадать с почтой владельца Sites.",
        403,
        "owner_email_mismatch",
      );
    }

    const user = await createUser(env.DB, {
      name: payload.name || "",
      email: payload.email || "",
      password: payload.password || "",
      role: "admin",
    });

    await linkLegacyOwnerData(user.id, user.email);
    const token = await createSession(env.DB, user.id, request);
    return Response.json(
      { user },
      {
        status: 201,
        headers: { "Set-Cookie": sessionCookie(token) },
      },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function linkLegacyOwnerData(userId: number, email: string) {
  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE radars SET user_id = ?
         WHERE user_id IS NULL AND lower(user_email) = ?`,
      )
      .bind(userId, email),
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO user_favorites (user_id, listing_id)
         SELECT ?, l.id
         FROM favorites f
         INNER JOIN listings l
           ON l.source = f.source
          AND l.external_id = f.external_listing_id
         WHERE lower(f.user_email) = ?`,
      )
      .bind(userId, email),
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO telegram_accounts (
           user_id, chat_id, connected, connected_at, updated_at
         )
         SELECT ?, chat_id, connected,
                CASE WHEN connected = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
                CURRENT_TIMESTAMP
         FROM telegram_connections
         WHERE lower(user_email) = ?`,
      )
      .bind(userId, email),
  ]);
}
