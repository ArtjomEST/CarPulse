import { env } from "cloudflare:workers";
import {
  authErrorResponse,
  AuthError,
  createSession,
  createUser,
  requireSameOrigin,
  sessionCookie,
} from "../../../../lib/auth";
import { ensureSchema } from "../../../../db/ensure-schema";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureSchema(env.DB);
    const admin = await env.DB
      .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
      .first<{ id: number }>();
    if (!admin) {
      throw new AuthError(
        "Регистрация откроется после создания первого администратора.",
        503,
        "bootstrap_required",
      );
    }

    const payload = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };
    const user = await createUser(env.DB, {
      name: payload.name || "",
      email: payload.email || "",
      password: payload.password || "",
      role: "user",
    });
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
