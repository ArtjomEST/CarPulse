import { env } from "cloudflare:workers";
import {
  authErrorResponse,
  AuthError,
  createUser,
  normalizeEmail,
  requireAdmin,
  requireSameOrigin,
  setUserPassword,
  validateEmail,
  validateName,
  type UserRole,
  type UserStatus,
} from "../../../../lib/auth";

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  radar_count: number;
  favorite_count: number;
  telegram_connected: number;
};

export async function GET(request: Request) {
  try {
    await requireAdmin(env.DB, request);
    const users = await env.DB
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
                u.updated_at, u.last_login_at,
                (SELECT COUNT(*) FROM radars r WHERE r.user_id = u.id) AS radar_count,
                (SELECT COUNT(*) FROM user_favorites f WHERE f.user_id = u.id) AS favorite_count,
                COALESCE(
                  (SELECT connected FROM telegram_accounts t WHERE t.user_id = u.id),
                  0
                ) AS telegram_connected
         FROM users u
         ORDER BY
           CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END,
           u.created_at DESC
         LIMIT 250`,
      )
      .all<ManagedUser>();

    return Response.json({
      users: users.results.map(publicUser),
      summary: {
        total: users.results.length,
        active: users.results.filter((user) => user.status === "active").length,
        admins: users.results.filter((user) => user.role === "admin").length,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const admin = await requireAdmin(env.DB, request);
    const payload = (await request.json()) as {
      action?: string;
      id?: number;
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      status?: UserStatus;
    };

    if (payload.action === "create_user") {
      const user = await createUser(env.DB, {
        name: payload.name || "",
        email: payload.email || "",
        password: payload.password || "",
        role: payload.role,
        status: payload.status,
      });
      return Response.json({ user: publicUser(user) }, { status: 201 });
    }

    const userId = Number(payload.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AuthError(
        "Не удалось определить пользователя. Обновите список.",
        400,
        "invalid_user_id",
      );
    }
    const target = await env.DB
      .prepare("SELECT id, name, email, role, status FROM users WHERE id = ?")
      .bind(userId)
      .first<{
        id: number;
        name: string;
        email: string;
        role: UserRole;
        status: UserStatus;
      }>();
    if (!target) {
      throw new AuthError("Пользователь не найден.", 404, "user_not_found");
    }

    if (payload.action === "update_user") {
      const name = validateName(payload.name || "");
      const email = validateEmail(payload.email || "");
      const role: UserRole = payload.role === "admin" ? "admin" : "user";
      const status: UserStatus =
        payload.status === "blocked" ? "blocked" : "active";

      if (
        target.id === admin.id &&
        (role !== target.role || status !== target.status)
      ) {
        throw new AuthError(
          "Нельзя изменить собственную роль или заблокировать свой аккаунт.",
          409,
          "cannot_restrict_self",
        );
      }
      if (
        target.role === "admin" &&
        target.status === "active" &&
        (role !== "admin" || status !== "active")
      ) {
        await assertAnotherActiveAdmin(target.id);
      }

      try {
        await env.DB.batch([
          env.DB
            .prepare(
              `UPDATE users
               SET name = ?, email = ?, role = ?, status = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            )
            .bind(name, email, role, status, target.id),
          env.DB
            .prepare("UPDATE radars SET user_email = ? WHERE user_id = ?")
            .bind(email, target.id),
          ...(status === "blocked"
            ? [
                env.DB
                  .prepare("DELETE FROM sessions WHERE user_id = ?")
                  .bind(target.id),
              ]
            : []),
        ]);
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes("UNIQUE") || error.message.includes("unique"))
        ) {
          throw new AuthError(
            "Аккаунт с этой почтой уже существует.",
            409,
            "email_exists",
          );
        }
        throw error;
      }

      const updated = await loadManagedUser(target.id);
      return Response.json({ user: updated ? publicUser(updated) : null });
    }

    if (payload.action === "reset_password") {
      if (target.id === admin.id) {
        throw new AuthError(
          "Свой пароль изменяйте в разделе «Настройки», указав текущий пароль.",
          409,
          "use_account_password_change",
        );
      }
      await setUserPassword(env.DB, target.id, payload.password || "");
      await env.DB
        .prepare("DELETE FROM sessions WHERE user_id = ?")
        .bind(target.id)
        .run();
      return Response.json({ id: target.id, passwordReset: true });
    }

    if (payload.action === "delete_user") {
      if (target.id === admin.id) {
        throw new AuthError(
          "Нельзя удалить собственный аккаунт администратора.",
          409,
          "cannot_delete_self",
        );
      }
      if (target.role === "admin" && target.status === "active") {
        await assertAnotherActiveAdmin(target.id);
      }

      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id),
        env.DB.prepare("DELETE FROM user_favorites WHERE user_id = ?").bind(target.id),
        env.DB.prepare("DELETE FROM telegram_accounts WHERE user_id = ?").bind(target.id),
        env.DB.prepare("DELETE FROM radars WHERE user_id = ?").bind(target.id),
        env.DB.prepare("DELETE FROM users WHERE id = ?").bind(target.id),
      ]);
      return Response.json({ id: target.id, deleted: true });
    }

    throw new AuthError("Неизвестное действие администратора.", 400, "unknown_action");
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function assertAnotherActiveAdmin(excludedId: number) {
  const remaining = await env.DB
    .prepare(
      `SELECT COUNT(*) AS count FROM users
       WHERE role = 'admin' AND status = 'active' AND id != ?`,
    )
    .bind(excludedId)
    .first<{ count: number }>();
  if (Number(remaining?.count || 0) < 1) {
    throw new AuthError(
      "В системе должен остаться хотя бы один активный администратор.",
      409,
      "last_admin_required",
    );
  }
}

async function loadManagedUser(id: number) {
  return env.DB
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
              u.updated_at, u.last_login_at,
              (SELECT COUNT(*) FROM radars r WHERE r.user_id = u.id) AS radar_count,
              (SELECT COUNT(*) FROM user_favorites f WHERE f.user_id = u.id) AS favorite_count,
              COALESCE(
                (SELECT connected FROM telegram_accounts t WHERE t.user_id = u.id),
                0
              ) AS telegram_connected
       FROM users u WHERE u.id = ?`,
    )
    .bind(id)
    .first<ManagedUser>();
}

function publicUser(user: Partial<ManagedUser> & {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}) {
  return {
    id: user.id,
    name: user.name,
    email: normalizeEmail(user.email),
    role: user.role,
    status: user.status,
    createdAt: user.created_at || null,
    updatedAt: user.updated_at || null,
    lastLoginAt: user.last_login_at || null,
    radarCount: Number(user.radar_count || 0),
    favoriteCount: Number(user.favorite_count || 0),
    telegramConnected: Boolean(user.telegram_connected),
  };
}
