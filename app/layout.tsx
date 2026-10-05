import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { Nav } from "@/components/nav";
import { LangProvider } from "@/components/i18n/lang-provider";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// Hindi UI and Hindi/Marathi content; other Indic scripts fall back to system fonts.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Bharat Pulse — India Situation Monitor",
  description:
    "Live India on one map: NDMA disaster alerts, earthquakes, fires, air quality, power demand, development projects, citizen reports and who represents every place.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${jetbrainsMono.variable} ${devanagari.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col font-mono">
        <LangProvider lang={lang}>
          <Nav />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </LangProvider>
      </body>
    </html>
  );
}
