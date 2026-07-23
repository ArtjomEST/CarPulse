import { mkdir, writeFile } from "node:fs/promises";

const OUTPUT_PATH = new URL("../data/vehicle-catalog.json", import.meta.url);
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const AUTO24_MAKES = [
  "Abarth",
  "Alfa Romeo",
  "Alpina",
  "Aston Martin",
  "Audi",
  "Austin",
  "BAIC",
  "BMW",
  "BYD",
  "Bentley",
  "Buick",
  "Cadillac",
  "Chery",
  "Chevrolet",
  "Chrysler",
  "Citroen",
  "Cupra",
  "DFSK",
  "DS",
  "Dacia",
  "Daihatsu",
  "Dodge",
  "Dongfeng",
  "Ferrari",
  "Fiat",
  "Fisker",
  "Ford",
  "Foton",
  "GAZ",
  "GMC",
  "GWM",
  "Honda",
  "Hummer",
  "Hyundai",
  "IZ",
  "Ineos",
  "Infiniti",
  "Isuzu",
  "Iveco",
  "Jaguar",
  "Jeep",
  "KGM",
  "Karma",
  "Kia",
  "LUAZ",
  "Lada",
  "Lamborghini",
  "Lancia",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Lotus",
  "Lynk & Co",
  "MG",
  "MINI",
  "Maserati",
  "Maxus",
  "Mazda",
  "McLaren",
  "Mercedes-AMG",
  "Mercedes-Benz",
  "Mercury",
  "Mitsubishi",
  "Moskvich",
  "Nissan",
  "Oldsmobile",
  "Opel",
  "Peugeot",
  "Polestar",
  "Pontiac",
  "Porsche",
  "Ram",
  "Renault",
  "Rivian",
  "Rolls-Royce",
  "SEAT",
  "SWM",
  "Saab",
  "Seres",
  "Skoda",
  "Skywell",
  "Smart",
  "SsangYong",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "UAZ",
  "VAZ",
  "Volkswagen",
  "Volvo",
  "Xpeng",
  "ZAZ",
];

const MAKE_ALIASES = new Map([
  ["mercedes", "mercedes-benz"],
  ["mercedes benz", "mercedes-benz"],
  ["mersedes benz", "mercedes-benz"],
  ["mini", "mini"],
  ["bmw alpina", "alpina"],
  ["fiat abarth", "abarth"],
  ["fiat-abarth", "abarth"],
  ["seat", "seat"],
  ["skoda", "skoda"],
  ["škoda", "skoda"],
  ["citroën", "citroen"],
  ["ssang yong", "ssangyong"],
  ["ssang-yong", "ssangyong"],
  ["moskvitsh", "moskvich"],
  ["москвич", "moskvich"],
  ["газ", "gaz"],
  ["ваз", "vaz"],
  ["xpeng", "xpeng"],
]);

const DISPLAY_NAMES = new Map([
  ["abarth", "Abarth"],
  ["alfa romeo", "Alfa Romeo"],
  ["bmw", "BMW"],
  ["byd", "BYD"],
  ["citroen", "Citroen"],
  ["ds", "DS"],
  ["gaz", "GAZ"],
  ["gmc", "GMC"],
  ["gwm", "GWM"],
  ["kgm", "KGM"],
  ["lada", "Lada"],
  ["mg", "MG"],
  ["mini", "MINI"],
  ["moskvich", "Moskvich"],
  ["ram", "RAM"],
  ["seat", "SEAT"],
  ["skoda", "Skoda"],
  ["uaz", "UAZ"],
  ["vaz", "VAZ"],
  ["xpeng", "XPENG"],
]);

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function fold(value) {
  return decodeHtml(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase("en");
}

function canonicalMakeKey(value) {
  const folded = fold(value);
  return MAKE_ALIASES.get(folded) || folded;
}

function displayMakeName(value) {
  const key = canonicalMakeKey(value);
  if (key === "mercedes-benz") return "Mercedes-Benz";
  return DISPLAY_NAMES.get(key) || decodeHtml(value).trim();
}

function canonicalModelKey(value) {
  return fold(value)
    .replace(/\bseries all\b/g, "")
    .replace(/\ball models\b/g, "")
    .trim();
}

async function fetchText(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en,ru;q=0.8",
        "User-Agent": USER_AGENT,
      },
    });
  } catch (error) {
    throw new Error(`${url}: ${error instanceof Error ? error.message : error}`);
  }
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function extractSelect(html, id) {
  const match = html.match(new RegExp(`<select[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, "i"));
  return match?.[1] || "";
}

function extractOptions(selectHtml) {
  return Array.from(selectHtml.matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi))
    .map((match) => ({
      id: decodeHtml(match[1]),
      name: decodeHtml(match[2].replace(/<[^>]+>/g, "")),
    }))
    .filter((option) => option.id && option.name);
}

function flattenNettiautoModels(value, output = []) {
  if (!value || typeof value !== "object") return output;
  for (const [rawName, rawId] of Object.entries(value)) {
    if (rawId && typeof rawId === "object") {
      flattenNettiautoModels(rawId, output);
      continue;
    }
    const name = decodeHtml(rawName.replace(/^_/, ""));
    const id = String(rawId ?? "");
    if (
      !name ||
      !id ||
      id.includes(",") ||
      /\((all|kaikki)\)/i.test(name) ||
      /^(other|muu(?: merkki| malli)?)$/i.test(name)
    ) {
      continue;
    }
    output.push({ id, name });
  }
  return output;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function loadNettiauto() {
  const html = await fetchText("https://www.nettiauto.com/en");
  const makes = [
    ...new Map(
      extractOptions(extractSelect(html, "make")).map((make) => [make.id, make]),
    ).values(),
  ];
  const withModels = await mapWithConcurrency(makes, 6, async (make) => {
    const url = new URL("https://www.nettiauto.com/en/options/list");
    url.search = new URLSearchParams({
      changeType: "make",
      vehicleType: "1",
      make: make.id,
      changeFrom: "advanceSearch",
    }).toString();
    try {
      const payload = JSON.parse(await fetchText(url));
      return { ...make, models: flattenNettiautoModels(payload.model) };
    } catch (error) {
      console.warn(`Nettiauto ${make.name}: ${error instanceof Error ? error.message : error}`);
      return { ...make, models: [] };
    }
  });
  return withModels;
}

async function loadSs() {
  const html = await fetchText("https://www.ss.com/ru/transport/cars/");
  const makes = Array.from(
    html.matchAll(
      /href="\/ru\/transport\/cars\/([a-z0-9-]+)\/"[^>]*class="a_category"[^>]*>([^<]+)<\/a>/gi,
    ),
  )
    .map((match) => ({ slug: match[1], name: decodeHtml(match[2]) }))
    .filter(
      (make) =>
        ![
          "new",
          "search",
          "others",
          "retro-cars",
          "sport-cars",
          "tuned-cars",
          "exclusive-cars",
          "electric-cars",
          "exchange",
          "rss",
        ].includes(make.slug),
    );

  return mapWithConcurrency(makes, 6, async (make) => {
    try {
      const makeHtml = await fetchText(`https://www.ss.com/ru/transport/cars/${make.slug}/`);
      const pattern = new RegExp(
        `href="/ru/transport/cars/${make.slug}/([a-z0-9-]+)/"[^>]*class="a_category"[^>]*>([^<]+)<\\/a>`,
        "gi",
      );
      const models = Array.from(makeHtml.matchAll(pattern))
        .map((match) => {
          const fullName = decodeHtml(match[2]);
          return {
            slug: match[1],
            name: fullName.replace(new RegExp(`^${escapeRegExp(make.name)}\\s+`, "i"), ""),
          };
        })
        .filter(
          (model) =>
            !["search", "sell", "buy", "exchange", "rss", "another"].includes(model.slug) &&
            !/^(другие|обмен легковых авто)$/i.test(model.name),
        );
      return { ...make, models };
    } catch (error) {
      console.warn(`SS.lv ${make.name}: ${error instanceof Error ? error.message : error}`);
      return { ...make, models: [] };
    }
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addMake(store, name, source, reference) {
  const key = canonicalMakeKey(name);
  if (!key) return null;
  let make = store.get(key);
  if (!make) {
    make = {
      id: key.replace(/\s+/g, "-"),
      name: displayMakeName(name),
      aliases: new Set(),
      sources: {},
      models: new Map(),
    };
    store.set(key, make);
  }
  make.aliases.add(decodeHtml(name));
  make.sources[source] = reference;
  return make;
}

function addModel(make, name, source, reference) {
  const key = canonicalModelKey(name);
  if (!key) return;
  let model = make.models.get(key);
  if (!model) {
    model = {
      id: key.replace(/\s+/g, "-"),
      name: decodeHtml(name),
      aliases: new Set(),
      sources: {},
    };
    make.models.set(key, model);
  }
  model.aliases.add(decodeHtml(name));
  model.sources[source] = reference;
}

async function main() {
  const [nettiauto, ss] = await Promise.all([loadNettiauto(), loadSs()]);
  const store = new Map();

  for (const name of AUTO24_MAKES) {
    addMake(store, name, "Auto24", { name });
  }
  for (const item of nettiauto) {
    const make = addMake(store, item.name, "Nettiauto", { id: item.id, name: item.name });
    if (!make) continue;
    for (const model of item.models) {
      addModel(make, model.name, "Nettiauto", { id: model.id, name: model.name });
    }
  }
  for (const item of ss) {
    const make = addMake(store, item.name, "SS.lv", { slug: item.slug, name: item.name });
    if (!make) continue;
    for (const model of item.models) {
      addModel(make, model.name, "SS.lv", { slug: model.slug, name: model.name });
    }
  }

  // mobile.de uses the same passenger-car taxonomy space. Until its official
  // reference API is connected, the merged catalog is the safe UI fallback.
  for (const make of store.values()) {
    make.sources["mobile.de"] = { name: make.name, fallback: true };
  }

  const makes = [...store.values()]
    .map((make) => ({
      id: make.id,
      name: make.name,
      aliases: [...make.aliases].sort((a, b) => a.localeCompare(b)),
      sources: make.sources,
      models: [...make.models.values()]
        .map((model) => ({
          id: model.id,
          name: model.name,
          aliases: [...model.aliases].sort((a, b) => a.localeCompare(b)),
          sources: model.sources,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceUrls: [
      "https://www.auto24.ee/makes/",
      "https://www.nettiauto.com/en",
      "https://www.nettiauto.com/en/options/list",
      "https://www.ss.com/ru/transport/cars/",
      "https://suchen.mobile.de/fahrzeuge/search.html?s=Car&vc=Car",
    ],
    makes,
  };

  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  const modelCount = makes.reduce((sum, make) => sum + make.models.length, 0);
  console.log(`Wrote ${makes.length} makes and ${modelCount} models to ${OUTPUT_PATH.pathname}`);
}

await main();
