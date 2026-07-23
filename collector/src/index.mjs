import puppeteer from "puppeteer-core";
import { setTimeout as wait } from "node:timers/promises";

const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_CHROME_PATH = "/usr/bin/chromium";
const DEFAULT_PROFILE_DIR = "/data/chrome-profile";

const baseUrl = requiredEnvironment("CARPULSE_BASE_URL").replace(/\/+$/, "");
const collectorSecret = requiredEnvironment("AUTO24_COLLECTOR_SECRET");
const sitesBypassToken = process.env.CARPULSE_SITES_BYPASS_TOKEN?.trim();
const collectorEndpoint = `${baseUrl}/api/sources/auto24/collector`;
const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || DEFAULT_CHROME_PATH;
const profileDirectory = process.env.AUTO24_PROFILE_DIR || DEFAULT_PROFILE_DIR;
const intervalMinutes = positiveNumber(
  process.env.AUTO24_INTERVAL_MINUTES,
  DEFAULT_INTERVAL_MINUTES,
);
const challengeWaitMs = positiveNumber(
  process.env.AUTO24_CHALLENGE_WAIT_MS,
  45_000,
);
const runOnce = process.argv.includes("--once");

let stopping = false;
let currentBrowser = null;

process.on("SIGTERM", () => {
  stopping = true;
  void currentBrowser?.close();
});
process.on("SIGINT", () => {
  stopping = true;
  void currentBrowser?.close();
});

await runCollector();

async function runCollector() {
  do {
    const startedAt = new Date().toISOString();
    try {
      const result = await collectOnce();
      console.log(
        JSON.stringify({
          event: "auto24_run",
          startedAt,
          finishedAt: new Date().toISOString(),
          ...result,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.startsWith("AUTO24_BLOCKED:")
        ? "blocked"
        : "failed";
      try {
        await reportRun({ status, message });
      } catch (reportError) {
        console.error(
          JSON.stringify({
            event: "auto24_report_failed",
            message:
              reportError instanceof Error
                ? reportError.message
                : String(reportError),
          }),
        );
      }
      console.error(
        JSON.stringify({
          event: "auto24_run_failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          status,
          message,
        }),
      );
    }

    if (runOnce || stopping) break;
    const delayMs = millisecondsUntilNextRun(intervalMinutes);
    console.log(
      JSON.stringify({
        event: "auto24_next_run",
        at: new Date(Date.now() + delayMs).toISOString(),
      }),
    );
    await wait(delayMs);
  } while (!stopping);
}

async function collectOnce() {
  const configuration = await fetchConfiguration();
  if (!configuration.radars.length) {
    return await reportRun({ status: "success", records: [] });
  }

  currentBrowser = await puppeteer.launch({
    executablePath: chromePath,
    headless: process.env.AUTO24_HEADLESS !== "false",
    userDataDir: profileDirectory,
    args: [
      "--disable-dev-shm-usage",
      "--disable-features=Translate",
      "--lang=et-EE",
      "--no-first-run",
      "--no-sandbox",
    ],
  });

  try {
    const pages = await currentBrowser.pages();
    const page = pages[0] || (await currentBrowser.newPage());
    await page.setViewport({
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
    });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "et-EE,et;q=0.9,en;q=0.8",
    });

    const baseSearchUrl = new URL(configuration.searchUrl);
    if (!["auto24.ee", "www.auto24.ee"].includes(baseSearchUrl.hostname)) {
      throw new Error("CarPulse вернул адрес поиска не на auto24.ee");
    }
    await openAuto24Page(page, baseSearchUrl.toString(), false);
    const makeOptions = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("#searchParam-cmm-1-make option"),
      ).map((option) => ({
        value: option.value,
        label: option.textContent?.trim() || "",
      })),
    );

    const groupedSearches = new Map();
    for (const radar of configuration.radars) {
      const radarUrl = buildAuto24SearchUrl(
        baseSearchUrl,
        radar.filters || {},
        makeOptions,
        configuration.filterValues,
      );
      if (!radarUrl) continue;
      const key = radarUrl.toString();
      groupedSearches.set(key, [
        ...(groupedSearches.get(key) || []),
        radar.id,
      ]);
    }

    const recordsById = new Map();
    for (const [radarUrl, radarIds] of groupedSearches) {
      await openAuto24Page(page, radarUrl, true);
      const records = await extractAuto24Rows(page);
      for (const record of records) {
        const key = String(record.id);
        const existing = recordsById.get(key);
        recordsById.set(key, {
          ...(existing || record),
          candidateRadarIds: [
            ...new Set([
              ...(existing?.candidateRadarIds || []),
              ...radarIds,
            ]),
          ],
        });
      }
    }

    return await reportRun({
      status: "success",
      records: [...recordsById.values()].map(translateAuto24Record),
    });
  } finally {
    await currentBrowser.close().catch(() => undefined);
    currentBrowser = null;
  }
}

async function fetchConfiguration() {
  const response = await fetch(collectorEndpoint, {
    headers: collectorHeaders({
      Accept: "application/json",
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error || `CarPulse вернул HTTP ${response.status}`,
    );
  }
  return payload;
}

async function reportRun(payload) {
  const response = await fetch(collectorEndpoint, {
    method: "POST",
    headers: collectorHeaders({
      Accept: "application/json",
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  const expectedErrorStatus =
    (payload.status === "blocked" && response.status === 409) ||
    (payload.status === "failed" && response.status === 502);
  if (!response.ok && !expectedErrorStatus) {
    throw new Error(
      result.error || `CarPulse вернул HTTP ${response.status}`,
    );
  }
  return result;
}

function collectorHeaders(headers = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${collectorSecret}`,
    ...(sitesBypassToken
      ? {
          "OAI-Sites-Authorization": `Bearer ${sitesBypassToken}`,
        }
      : {}),
  };
}

async function openAuto24Page(page, url, allowEmptyResults) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  let inspection = await inspectAuto24Page(page);

  if (isAuto24Challenge(inspection, response?.status() || 0)) {
    console.warn(
      JSON.stringify({
        event: "auto24_challenge",
        url,
        status: response?.status() || 0,
      }),
    );
    await page
      .waitForSelector("#searchParam-cmm-1-make", {
        timeout: challengeWaitMs,
      })
      .catch(() => null);
    inspection = await inspectAuto24Page(page);
  }

  if (isAuto24Challenge(inspection, 0)) {
    throw new Error(
      `AUTO24_BLOCKED: защитная проверка не завершилась за ${Math.round(challengeWaitMs / 1000)} секунд`,
    );
  }
  if (
    !inspection.hasSearchForm ||
    (!allowEmptyResults && inspection.rows === 0)
  ) {
    throw new Error(
      "Auto24 открылся, но форма или строки результатов не найдены",
    );
  }
}

async function inspectAuto24Page(page) {
  return await page.evaluate(() => ({
    title: document.title,
    text: document.body?.innerText.slice(0, 800) || "",
    rows: document.querySelectorAll(".result-row").length,
    hasSearchForm: Boolean(
      document.querySelector("#searchParam-cmm-1-make"),
    ),
  }));
}

function isAuto24Challenge(inspection, status) {
  const text = `${inspection.title} ${inspection.text}`.toLocaleLowerCase();
  return (
    status === 403 ||
    status === 429 ||
    text.includes("security check") ||
    text.includes("проверку безопасности") ||
    text.includes("turvaküsimus") ||
    text.includes("turvakontroll")
  );
}

async function extractAuto24Rows(page) {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll(".result-row"))
      .slice(0, 100)
      .map((row) => {
        const link = row.querySelector("a.main[href*='/soidukid/']");
        const href = link?.getAttribute("href") || "";
        const id = href.match(/\/soidukid\/(\d+)/)?.[1] || "";
        const number = (selector) => {
          const value = row.querySelector(selector)?.textContent || "";
          const parsed = Number(value.replace(/[^\d]/g, ""));
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        };
        const text = (selector) =>
          row
            .querySelector(selector)
            ?.textContent?.replace(/\s+/g, " ")
            .trim() || null;
        const title =
          link?.textContent?.replace(/\s+/g, " ").trim() || "";
        const engine = text(".engine");
        return {
          id,
          url: id ? `https://www.auto24.ee/soidukid/${id}` : "",
          title,
          make:
            link
              ?.querySelector("span:not(.model):not(.engine)")
              ?.textContent?.trim() || null,
          model: text("a.main .model"),
          priceEur: number(".description > .finance .price"),
          year: number(".extra .year"),
          mileageKm: number(".extra .mileage"),
          fuel: text(".extra .fuel.sm-none"),
          transmission: text(".extra .transmission.sm-none"),
          imageUrl:
            row.querySelector(".thumbnail img.thumb")?.src || null,
          bodyType: text(".extra .bodytype"),
          drivetrain: text(".extra .drive"),
          powerKw: engine
            ? Number(engine.match(/(\d+)\s*kW/i)?.[1] || 0) || null
            : null,
          location: null,
        };
      })
      .filter((record) => record.id && record.title),
  );
}

function buildAuto24SearchUrl(
  baseUrl,
  filters,
  makes,
  filterValues,
) {
  const url = new URL(baseUrl);
  url.pathname = "/kasutatud/nimekiri.php";
  url.search = "";
  url.searchParams.set("a", "100");
  url.searchParams.set("ad", "1");
  url.searchParams.set("ae", "1");
  url.searchParams.set("af", "100");
  url.searchParams.set("ak", "0");
  url.searchParams.set("otsi", "otsi");

  if (filters.make) {
    const wanted = foldVehicleValue(filters.make);
    const make = makes.find(
      (option) => foldVehicleValue(option.label) === wanted,
    );
    if (!make?.value) return null;
    url.searchParams.set("b", make.value);
  }
  if (filters.model) url.searchParams.set("c", filters.model);
  setNumeric(url, "f1", filters.yearMin);
  setNumeric(url, "f2", filters.yearMax);
  setNumeric(url, "g1", filters.priceMin);
  setNumeric(url, "g2", filters.priceMax);
  setNumeric(url, "k1", filters.powerMin);
  setNumeric(url, "k2", filters.powerMax);
  setNumeric(url, "l1", filters.mileageMin);
  setNumeric(url, "l2", filters.mileageMax);
  appendMapped(url, "h[]", filterValues.fuel, filters.fuel);
  appendMapped(
    url,
    "i[]",
    filterValues.transmission,
    filters.transmission,
  );
  appendMapped(url, "j[]", filterValues.bodyType, filters.bodyType);
  appendMapped(url, "p[]", filterValues.drivetrain, filters.drivetrain);
  appendMapped(url, "ab[]", filterValues.location, filters.location);
  return url;
}

function setNumeric(url, key, value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    url.searchParams.set(key, String(Math.round(value)));
  }
}

function appendMapped(url, key, map, value) {
  if (!value) return;
  for (const mapped of map[value] || []) {
    url.searchParams.append(key, mapped);
  }
}

function foldVehicleValue(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("en");
  return normalized === "mercedes" ? "mercedesbenz" : normalized;
}

function translateAuto24Record(record) {
  const fuels = {
    bensiin: "Бензин",
    diisel: "Дизель",
    elekter: "Электро",
    hübriid: "Гибрид",
  };
  const transmissions = {
    automaat: "Автомат",
    manuaal: "Механика",
    poolautomaat: "Полуавтомат",
  };
  const fuelKey = record.fuel?.toLocaleLowerCase() || "";
  const transmissionKey =
    record.transmission?.toLocaleLowerCase() || "";
  return {
    ...record,
    fuel: fuels[fuelKey] || record.fuel,
    transmission:
      transmissions[transmissionKey] || record.transmission,
  };
}

function millisecondsUntilNextRun(minutes) {
  const intervalMs = minutes * 60_000;
  const remainder = Date.now() % intervalMs;
  return (remainder === 0 ? intervalMs : intervalMs - remainder) + 2_000;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}
