import { env } from "cloudflare:workers";
import {
  loadAuto24CollectorConfiguration,
  recordExternalAuto24Run,
  type ExtractedAuto24Record,
} from "../../../../../lib/sources/collect-auto24";

type CollectorEnv = {
  DB: D1Database;
  AUTO24_COLLECTOR_SECRET?: string;
  AUTO24_SEARCH_URL?: string;
};

function runtimeEnv() {
  return env as unknown as CollectorEnv;
}

function authorized(request: Request, collectorEnv: CollectorEnv) {
  return Boolean(
    collectorEnv.AUTO24_COLLECTOR_SECRET &&
      request.headers.get("authorization") ===
        `Bearer ${collectorEnv.AUTO24_COLLECTOR_SECRET}`,
  );
}

export async function GET(request: Request) {
  const collectorEnv = runtimeEnv();
  if (!collectorEnv.AUTO24_COLLECTOR_SECRET) {
    return Response.json(
      { error: "AUTO24_COLLECTOR_SECRET не настроен" },
      { status: 503 },
    );
  }
  if (!authorized(request, collectorEnv)) {
    return Response.json({ error: "Неверный ключ сборщика" }, { status: 401 });
  }

  const configuration = await loadAuto24CollectorConfiguration(
    collectorEnv.DB,
    collectorEnv.AUTO24_SEARCH_URL,
  );
  return Response.json(configuration);
}

export async function POST(request: Request) {
  const collectorEnv = runtimeEnv();
  if (!collectorEnv.AUTO24_COLLECTOR_SECRET) {
    return Response.json(
      { error: "AUTO24_COLLECTOR_SECRET не настроен" },
      { status: 503 },
    );
  }
  if (!authorized(request, collectorEnv)) {
    return Response.json({ error: "Неверный ключ сборщика" }, { status: 401 });
  }

  const payload = (await request.json()) as {
    status?: "success" | "blocked" | "failed";
    records?: ExtractedAuto24Record[];
    message?: string;
  };
  if (!payload.status || !["success", "blocked", "failed"].includes(payload.status)) {
    return Response.json({ error: "Некорректный статус запуска" }, { status: 400 });
  }
  if (payload.status === "success" && !Array.isArray(payload.records)) {
    return Response.json({ error: "Отсутствует список объявлений" }, { status: 400 });
  }
  if ((payload.records?.length || 0) > 1000) {
    return Response.json(
      { error: "За один запуск можно передать не больше 1000 объявлений" },
      { status: 413 },
    );
  }

  const result = await recordExternalAuto24Run(collectorEnv.DB, {
    status: payload.status,
    records: payload.records,
    message: payload.message?.slice(0, 1000),
  });
  return Response.json(result, {
    status: result.status === "success" ? 200 : result.status === "blocked" ? 409 : 502,
  });
}
