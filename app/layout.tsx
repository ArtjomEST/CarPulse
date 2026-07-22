import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CarPulse",
    template: "%s — CarPulse",
  },
  description:
    "Следите за свежими объявлениями Auto24, SS.lv, Mobile.de и других площадок в одном месте.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "CarPulse — свежие автомобили раньше других",
    description:
      "Настройте радары и получайте подходящие объявления в одном кабинете и Telegram.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={sourceSans.variable}>{children}</body>
    </html>
  );
}
