import type { MarketplaceAdapter } from "./types";

const notConnected = (label: string) => async () => {
  throw new Error(`${label}: источник ещё не подключён к закрытому MVP`);
};

export const marketplaceAdapters: MarketplaceAdapter[] = [
  { id: "auto24", label: "Auto24", country: "Эстония", minimumIntervalMinutes: 5, search: notConnected("Auto24") },
  { id: "sslv", label: "SS.lv", country: "Латвия", minimumIntervalMinutes: 5, search: notConnected("SS.lv") },
  { id: "nettiauto", label: "Nettiauto", country: "Финляндия", minimumIntervalMinutes: 5, search: notConnected("Nettiauto") },
  { id: "mobilede", label: "mobile.de", country: "Германия", minimumIntervalMinutes: 5, search: notConnected("mobile.de") },
];

export function sourceById(id: string) {
  return marketplaceAdapters.find((adapter) => adapter.id === id);
}
