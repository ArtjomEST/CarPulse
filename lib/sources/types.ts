export type NormalizedListing = {
  externalId: string;
  source: string;
  url: string;
  title: string;
  priceEur: number | null;
  year: number | null;
  mileageKm: number | null;
  fuel: string | null;
  transmission: string | null;
  location: string | null;
  imageUrl: string | null;
  firstSeenAt: string;
};

export type RadarQuery = {
  make?: string;
  model?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  fuel?: string;
  transmission?: string;
  location?: string;
};

export interface MarketplaceAdapter {
  id: string;
  label: string;
  country: string;
  minimumIntervalMinutes: number;
  search(query: RadarQuery): Promise<NormalizedListing[]>;
}
