import { env } from "cloudflare:workers";
import {
  authErrorResponse,
  deleteRequestSession,
  expiredSessionCookie,
  requireSameOrigin,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await deleteRequestSession(env.DB, request);
    return Response.json(
      { loggedOut: true },
      { headers: { "Set-Cookie": expiredSessionCookie() } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
