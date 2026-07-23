import type { MarketplaceAdapter, NormalizedListing } from "./types";

export const AUTO24_TERMS_URL = "https://www.auto24.ee/users/kasutustingimused.php";

export type AuthorizedAuto24Record = {
  id: string | number;
  url: string;
  title: string;
  make?: string | null;
  model?: string | null;
  priceEur?: number | null;
  year?: number | null;
  mileageKm?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  location?: string | null;
  imageUrl?: string | null;
};

export const auto24Adapter: MarketplaceAdapter = {
  id: "auto24",
  label: "Auto24",
  country: "Эстония",
  connectionMode: "scheduled_fetch",
  status: "scheduled",
  minimumIntervalMinutes: 30,
};

export function normalizeAuthorizedAuto24Record(record: AuthorizedAuto24Record): NormalizedListing {
  const url = new URL(record.url);
  if (url.hostname !== "www.auto24.ee" && url.hostname !== "auto24.ee") {
    throw new Error("Auto24 record URL must belong to auto24.ee");
  }
  const externalId = String(record.id).trim();
  if (!externalId || !record.title.trim()) throw new Error("Auto24 record requires id and title");

  return {
    externalId,
    source: "Auto24",
    url: url.toString(),
    title: record.title.trim(),
    make: clean(record.make),
    model: clean(record.model),
    priceEur: finiteInteger(record.priceEur),
    year: finiteInteger(record.year),
    mileageKm: finiteInteger(record.mileageKm),
    fuel: clean(record.fuel),
    transmission: clean(record.transmission),
    location: clean(record.location),
    imageUrl: clean(record.imageUrl),
    raw: record,
  };
}

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function finiteInteger(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}
