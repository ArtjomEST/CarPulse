import type { NormalizedListing, RadarQuery } from "./types";

const MAKE_ALIASES: Record<string, string> = {
  mercedes: "mercedesbenz",
  mersedesbenz: "mercedesbenz",
  skoda: "skoda",
  škoda: "skoda",
  citroen: "citroen",
  citroën: "citroen",
  mini: "mini",
  seat: "seat",
  vaz: "vaz",
  ваз: "vaz",
  gaz: "gaz",
  газ: "gaz",
  moskvich: "moskvich",
  москвич: "moskvich",
  moskvitsh: "moskvich",
  xpeng: "xpeng",
};

const VALUE_ALIASES: Record<string, Record<string, string>> = {
  fuel: {
    bensiin: "petrol",
    бензин: "petrol",
    petrol: "petrol",
    gasoline: "petrol",
    diisel: "diesel",
    дизель: "diesel",
    diesel: "diesel",
    elekter: "electric",
    электро: "electric",
    electric: "electric",
    sähkö: "electric",
    hybrid: "hybrid",
    hübriid: "hybrid",
    гибрид: "hybrid",
    hybridi: "hybrid",
    pistikhübriid: "plugin-hybrid",
    подключаемыйгибрид: "plugin-hybrid",
    pluginhybrid: "plugin-hybrid",
    lpg: "lpg",
    cng: "cng",
    vesinik: "hydrogen",
    hydrogen: "hydrogen",
    водород: "hydrogen",
    etanool: "ethanol",
    ethanol: "ethanol",
  },
  transmission: {
    automaat: "automatic",
    автомат: "automatic",
    automatic: "automatic",
    automaatti: "automatic",
    manuaal: "manual",
    механика: "manual",
    ручная: "manual",
    manual: "manual",
    manuaali: "manual",
    poolautomaat: "semi-automatic",
    полуавтомат: "semi-automatic",
    робот: "semi-automatic",
    semiautomatic: "semi-automatic",
  },
  bodyType: {
    sedaan: "sedan",
    седан: "sedan",
    sedan: "sedan",
    luukpära: "hatchback",
    хэтчбек: "hatchback",
    hatchback: "hatchback",
    universaal: "wagon",
    универсал: "wagon",
    stationwagon: "wagon",
    kombi: "wagon",
    maastur: "suv",
    джип: "suv",
    внедорожник: "suv",
    suv: "suv",
    mahtuniversaal: "minivan",
    минивэн: "minivan",
    minivan: "minivan",
    kupee: "coupe",
    купе: "coupe",
    coupe: "coupe",
    kabriolett: "convertible",
    кабриолет: "convertible",
    convertible: "convertible",
    pikap: "pickup",
    пикап: "pickup",
    pickup: "pickup",
    väikekaubik: "van",
    kaubik: "van",
    фургон: "van",
    van: "van",
  },
  drivetrain: {
    esivedu: "fwd",
    переднийпривод: "fwd",
    frontwheeldrive: "fwd",
    fwd: "fwd",
    tagavedu: "rwd",
    заднийпривод: "rwd",
    rearwheeldrive: "rwd",
    rwd: "rwd",
    nelikvedu: "awd",
    полныйпривод: "awd",
    allwheeldrive: "awd",
    fourwheeldrive: "awd",
    awd: "awd",
    "4x4": "awd",
  },
  location: {
    eesti: "estonia",
    estonia: "estonia",
    эстония: "estonia",
    läti: "latvia",
    latvia: "latvia",
    латвия: "latvia",
    soome: "finland",
    finland: "finland",
    финляндия: "finland",
    saksamaa: "germany",
    germany: "germany",
    германия: "germany",
  },
};

function fold(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLocaleLowerCase("en");
}

function canonicalMake(value?: string | null) {
  const normalized = fold(value);
  return MAKE_ALIASES[normalized] || normalized;
}

function includesVehicleValue(value: string | null, expected?: string) {
  if (!expected?.trim()) return true;
  const actual = fold(value);
  const wanted = fold(expected);
  return actual === wanted || actual.includes(wanted) || wanted.includes(actual);
}

function canonicalOption(group: keyof typeof VALUE_ALIASES, value?: string | null) {
  const normalized = fold(value);
  const aliases = VALUE_ALIASES[group];
  if (aliases[normalized]) return aliases[normalized];
  const contained = Object.entries(aliases).find(([alias]) => normalized.includes(alias));
  return contained?.[1] || normalized;
}

function matchesOption(
  group: keyof typeof VALUE_ALIASES,
  value: string | null | undefined,
  expected?: string,
) {
  if (!expected) return true;
  return canonicalOption(group, value) === expected;
}

export function matchesRadar(query: RadarQuery, listing: NormalizedListing) {
  if (query.make && canonicalMake(listing.make) !== canonicalMake(query.make)) return false;
  if (!includesVehicleValue(listing.model || listing.title, query.model)) return false;
  if (!matchesOption("fuel", listing.fuel, query.fuel)) return false;
  if (!matchesOption("transmission", listing.transmission, query.transmission)) return false;
  if (!matchesOption("bodyType", listing.bodyType, query.bodyType)) return false;
  if (!matchesOption("drivetrain", listing.drivetrain, query.drivetrain)) return false;
  if (!matchesOption("location", listing.location, query.location)) return false;
  if (query.priceMin != null && (listing.priceEur == null || listing.priceEur < query.priceMin)) return false;
  if (query.priceMax != null && (listing.priceEur == null || listing.priceEur > query.priceMax)) return false;
  if (query.yearMin != null && (listing.year == null || listing.year < query.yearMin)) return false;
  if (query.yearMax != null && (listing.year == null || listing.year > query.yearMax)) return false;
  if (query.mileageMin != null && (listing.mileageKm == null || listing.mileageKm < query.mileageMin)) return false;
  if (query.mileageMax != null && (listing.mileageKm == null || listing.mileageKm > query.mileageMax)) return false;
  if (query.powerMin != null && (listing.powerKw == null || listing.powerKw < query.powerMin)) return false;
  if (query.powerMax != null && (listing.powerKw == null || listing.powerKw > query.powerMax)) return false;
  return true;
}
