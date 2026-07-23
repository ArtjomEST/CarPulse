import type { NormalizedListing, RadarQuery } from "./types";

function includesFolded(value: string | null, expected?: string) {
  if (!expected?.trim()) return true;
  return (value ?? "").localeCompare(expected.trim(), undefined, { sensitivity: "base" }) === 0 ||
    (value ?? "").toLocaleLowerCase().includes(expected.trim().toLocaleLowerCase());
}

export function matchesRadar(query: RadarQuery, listing: NormalizedListing) {
  if (!includesFolded(listing.make, query.make)) return false;
  if (!includesFolded(listing.model, query.model)) return false;
  if (!includesFolded(listing.fuel, query.fuel)) return false;
  if (!includesFolded(listing.transmission, query.transmission)) return false;
  if (!includesFolded(listing.location, query.location)) return false;
  if (query.priceMin != null && (listing.priceEur == null || listing.priceEur < query.priceMin)) return false;
  if (query.priceMax != null && (listing.priceEur == null || listing.priceEur > query.priceMax)) return false;
  if (query.yearMin != null && (listing.year == null || listing.year < query.yearMin)) return false;
  if (query.yearMax != null && (listing.year == null || listing.year > query.yearMax)) return false;
  if (query.mileageMax != null && (listing.mileageKm == null || listing.mileageKm > query.mileageMax)) return false;
  return true;
}
