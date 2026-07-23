import { env } from "cloudflare:workers";
import { collectAuto24, type Auto24CollectorEnv } from "../../../../../lib/sources/collect-auto24";

type SyncEnv = Auto24CollectorEnv & {
  AUTO24_SYNC_SECRET?: string;
};

function runtimeEnv() {
  return env as unknown as SyncEnv;
}

export async function GET() {
  return Response.json({
    source: "Auto24",
    mode: "browser",
    schedule: "*/30 * * * *",
    intervalMinutes: 30,
    search: "Новые объявления за сутки, сначала самые свежие, первые 50",
  });
}

export async function POST(request: Request) {
  const workerEnv = runtimeEnv();
  if (!workerEnv.AUTO24_SYNC_SECRET) {
    return Response.json(
      { error: "AUTO24_SYNC_SECRET не настроен" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${workerEnv.AUTO24_SYNC_SECRET}`) {
    return Response.json({ error: "Неверный ключ синхронизации" }, { status: 401 });
  }

  const result = await collectAuto24(workerEnv);
  return Response.json(result, {
    status: result.status === "failed" ? 502 : result.status === "blocked" ? 409 : 200,
  });
}
