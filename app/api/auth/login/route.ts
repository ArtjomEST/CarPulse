import { env } from "cloudflare:workers";
import {
  authenticateUser,
  authErrorResponse,
  createSession,
  requireSameOrigin,
  sessionCookie,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const payload = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const user = await authenticateUser(
      env.DB,
      request,
      payload.email || "",
      payload.password || "",
    );
    const token = await createSession(env.DB, user.id, request);
    return Response.json(
      { user },
      { headers: { "Set-Cookie": sessionCookie(token) } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
