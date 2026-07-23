import { setTimeout as wait } from "node:timers/promises";

const baseUrl = (process.env.CARPULSE_DEV_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const scheduledUrl = new URL("/cdn-cgi/handler/scheduled", baseUrl);
scheduledUrl.searchParams.set("cron", "*/30 * * * *");
const productionUrl = process.env.CARPULSE_PRODUCTION_URL?.replace(/\/+$/, "");
const productionCollectorSecret =
  process.env.CARPULSE_PRODUCTION_COLLECTOR_SECRET?.trim();
const sitesBypassToken = process.env.CARPULSE_SITES_BYPASS_TOKEN?.trim();
const runImmediately = process.argv.includes("--now");
const shutdown = new AbortController();
let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
  shutdown.abort();
});
process.on("SIGTERM", () => {
  stopping = true;
  shutdown.abort();
});

if (runImmediately) await triggerScheduled(true);

while (!stopping) {
  const delayMs = millisecondsUntilNextHalfHour();
  console.log(
    `[local-cron] Следующая проверка Auto24: ${new Date(Date.now() + delayMs).toLocaleString("ru-RU")}`,
  );
  try {
    await wait(delayMs, undefined, { signal: shutdown.signal });
  } catch (error) {
    if (!stopping) throw error;
  }
  if (!stopping) await triggerScheduled(false);
}

async function triggerScheduled(waitForServer) {
  const attempts = waitForServer ? 30 : 1;
  for (let attempt = 1; attempt <= attempts && !stopping; attempt += 1) {
    try {
      const response = await fetch(scheduledUrl, {
        signal: AbortSignal.any([
          shutdown.signal,
          AbortSignal.timeout(10 * 60_000),
        ]),
      });
      const message = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${message}`);
      }
      console.log(
        `[local-cron] Проверка Auto24 запущена в ${new Date().toLocaleString("ru-RU")}`,
      );
      await syncProductionFromLocal();
      return;
    } catch (error) {
      if (attempt === attempts) {
        console.error(
          `[local-cron] Не удалось запустить проверку: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
      try {
        await wait(1_000, undefined, { signal: shutdown.signal });
      } catch (waitError) {
        if (!stopping) throw waitError;
      }
    }
  }
}

async function syncProductionFromLocal() {
  if (!productionUrl || !productionCollectorSecret) return;

  try {
    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, {
      signal: AbortSignal.any([
        shutdown.signal,
        AbortSignal.timeout(30_000),
      ]),
    });
    const dashboard = await dashboardResponse.json();
    if (!dashboardResponse.ok) {
      throw new Error(`локальный кабинет вернул HTTP ${dashboardResponse.status}`);
    }

    const records = new Map();
    for (const listing of dashboard.listings || []) {
      if (!listing.externalId || !listing.url || !listing.title) continue;
      records.set(String(listing.externalId), {
        id: listing.externalId,
        url: listing.url,
        title: listing.title,
        make: listing.make,
        model: listing.model,
        priceEur: listing.priceEur,
        year: listing.year,
        mileageKm: listing.mileageKm,
        fuel: listing.fuel,
        transmission: listing.transmission,
        bodyType: listing.bodyType,
        powerKw: listing.powerKw,
        location: listing.location,
        imageUrl: listing.imageUrl,
      });
    }

    const response = await fetch(
      `${productionUrl}/api/sources/auto24/collector`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${productionCollectorSecret}`,
          "Content-Type": "application/json",
          ...(sitesBypassToken
            ? {
                "OAI-Sites-Authorization": `Bearer ${sitesBypassToken}`,
              }
            : {}),
        },
        body: JSON.stringify({
          status: "success",
          records: [...records.values()],
        }),
        signal: AbortSignal.any([
          shutdown.signal,
          AbortSignal.timeout(2 * 60_000),
        ]),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        result.error || `production вернул HTTP ${response.status}`,
      );
    }
    console.log(
      `[local-cron] Production обновлён: ${result.receivedCount} объявлений, ${result.newMatchCount} новых совпадений`,
    );
  } catch (error) {
    if (stopping) return;
    console.error(
      `[local-cron] Не удалось обновить production: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function millisecondsUntilNextHalfHour() {
  const intervalMs = 30 * 60_000;
  const remainder = Date.now() % intervalMs;
  return (remainder === 0 ? intervalMs : intervalMs - remainder) + 2_000;
}
