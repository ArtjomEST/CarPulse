import type { Metadata } from "next";
import { CarPulseApp } from "./CarPulseApp";

export const metadata: Metadata = {
  title: "CarPulse — свежие автомобили раньше других",
  description:
    "Единый кабинет для мониторинга автомобильных площадок и быстрых уведомлений в Telegram.",
};

export default function Home() {
  return <CarPulseApp />;
}
