import { auto24Adapter } from "./auto24";
import type { MarketplaceAdapter } from "./types";

export const marketplaceAdapters: MarketplaceAdapter[] = [
  auto24Adapter,
  { id: "sslv", label: "SS.lv", country: "Латвия", connectionMode: "not_connected", status: "not_connected", minimumIntervalMinutes: 5 },
  { id: "nettiauto", label: "Nettiauto", country: "Финляндия", connectionMode: "not_connected", status: "not_connected", minimumIntervalMinutes: 5 },
  { id: "mobilede", label: "mobile.de", country: "Германия", connectionMode: "not_connected", status: "not_connected", minimumIntervalMinutes: 5 },
];

export function sourceById(id: string) {
  return marketplaceAdapters.find((adapter) => adapter.id === id);
}
