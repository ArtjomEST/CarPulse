import { env } from "cloudflare:workers";
import { ensureSchema } from "../../../../db/ensure-schema";
import { bootstrapOwnerEmail, getSessionUser } from "../../../../lib/auth";

export async function GET(request: Request) {
  await ensureSchema(env.DB);
  const user = await getSessionUser(env.DB, request);
  if (user) {
    return Response.json({
      user,
      bootstrapAvailable: false,
      registrationEnabled: true,
    });
  }

  const count = await env.DB
    .prepare("SELECT COUNT(*) AS count FROM users")
    .first<{ count: number }>();
  const noUsers = Number(count?.count || 0) === 0;
  const ownerEmail = bootstrapOwnerEmail(request);

  return Response.json({
    user: null,
    bootstrapAvailable: noUsers && Boolean(ownerEmail),
    bootstrapEmail:
      noUsers && ownerEmail ? ownerEmail : undefined,
    registrationEnabled: !noUsers,
  });
}
