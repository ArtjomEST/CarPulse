export type NormalizedListing = {
  externalId: string;
  source: string;
  url: string;
  title: string;
  make: string | null;
  model: string | null;
  priceEur: number | null;
  year: number | null;
  mileageKm: number | null;
  fuel: string | null;
  transmission: string | null;
  bodyType?: string | null;
  drivetrain?: string | null;
  powerKw?: number | null;
  location: string | null;
  imageUrl: string | null;
  raw: unknown;
};

export type RadarQuery = {
  catalogMakeId?: string;
  catalogModelId?: string;
  make?: string;
  model?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMin?: number;
  mileageMax?: number;
  powerMin?: number;
  powerMax?: number;
  fuel?: string;
  transmission?: string;
  bodyType?: string;
  drivetrain?: string;
  location?: string;
};

export type SourceConnectionMode = "scheduled_fetch" | "authorized_feed" | "official_notifications" | "not_connected";

export interface MarketplaceAdapter {
  id: string;
  label: string;
  country: string;
  connectionMode: SourceConnectionMode;
  status: "scheduled" | "ready_for_authorized_data" | "not_connected";
  minimumIntervalMinutes: number;
}
