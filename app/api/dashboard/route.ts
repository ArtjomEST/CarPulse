import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { radars, telegramConnections } from "../../../db/schema";

const DEMO_EMAIL = "demo@carpulse.local";

function userEmail(request: Request) {
  return request.headers.get("oai-authenticated-user-email") ?? DEMO_EMAIL;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  if (message.includes("no such table")) {
    return "База ещё не подготовлена. Примените миграции D1 и повторите запрос.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    const email = userEmail(request);
    const db = getDb();
    const [savedRadars, telegram] = await Promise.all([
      db.select().from(radars).where(eq(radars.userEmail, email)).orderBy(desc(radars.id)),
      db.select().from(telegramConnections).where(eq(telegramConnections.userEmail, email)).limit(1),
    ]);
    return Response.json({ radars: savedRadars, telegram: telegram[0] ?? null });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const email = userEmail(request);
    const payload = (await request.json()) as {
      action?: string;
      radar?: { name?: string; query?: string; sources?: string[]; enabled?: boolean };
    };
    const db = getDb();

    if (payload.action === "create_radar") {
      const name = payload.radar?.name?.trim();
      if (!name) return Response.json({ error: "Укажите название радара" }, { status: 400 });
      const [created] = await db.insert(radars).values({
        userEmail: email,
        name,
        query: payload.radar?.query?.trim() || "Все автомобили",
        sources: JSON.stringify(payload.radar?.sources ?? ["Auto24"]),
        enabled: payload.radar?.enabled ?? true,
      }).returning();
      return Response.json({ radar: created }, { status: 201 });
    }

    if (payload.action === "telegram_code") {
      const connectCode = `CP-${Math.floor(1000 + Math.random() * 9000)}`;
      await db.insert(telegramConnections).values({
        userEmail: email,
        connectCode,
        connected: false,
      }).onConflictDoUpdate({
        target: telegramConnections.userEmail,
        set: { connectCode, connected: false, updatedAt: new Date().toISOString() },
      });
      return Response.json({ connectCode });
    }

    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}
