import type { Metadata } from "next";
import { IBM_Plex_Mono, Mukta, Rozha_One } from "next/font/google";
import { Nav } from "@/components/nav";
import { LangProvider } from "@/components/i18n/lang-provider";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

// Body: humanist sans with Devanagari (Hindi UI and Hindi/Marathi content).
const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
});

// Display: classical high-contrast face for headings and the wordmark (Latin + Devanagari).
const rozha = Rozha_One({
  variable: "--font-rozha",
  subsets: ["latin", "devanagari"],
  weight: "400",
});

// Data: ids, timestamps, figures.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${mukta.variable} ${rozha.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col font-sans text-foreground">
        <LangProvider lang={lang}>
          <Nav />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          <div aria-hidden className="band-print band-print--thin shrink-0" />
        </LangProvider>
      </body>
    </html>
  );
}
