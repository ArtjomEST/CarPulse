import { env } from "cloudflare:workers";
import {
  authErrorResponse,
  AuthError,
  createSession,
  requireSameOrigin,
  requireUser,
  sessionCookie,
  setUserPassword,
  verifyCurrentPassword,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireUser(env.DB, request);
    const payload = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (
      !(await verifyCurrentPassword(
        env.DB,
        user.id,
        payload.currentPassword || "",
      ))
    ) {
      throw new AuthError(
        "Текущий пароль не подошёл. Проверьте его и повторите.",
        400,
        "current_password_invalid",
      );
    }

    await setUserPassword(env.DB, user.id, payload.newPassword || "");
    await env.DB
      .prepare("DELETE FROM sessions WHERE user_id = ?")
      .bind(user.id)
      .run();
    const token = await createSession(env.DB, user.id, request);
    return Response.json(
      { changed: true },
      { headers: { "Set-Cookie": sessionCookie(token) } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
