import type { Metadata } from "next";
import { CarPulseRoot } from "./CarPulseRoot";

export const metadata: Metadata = {
  title: "CarPulse — свежие автомобили раньше других",
  description:
    "Единый кабинет для мониторинга автомобильных площадок и быстрых уведомлений в Telegram.",
};

export default function Home() {
  return <CarPulseRoot />;
}
