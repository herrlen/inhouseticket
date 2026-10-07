import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { de } from "@/lib/i18n/de";
import "./globals.css";

// next/font self-hosts the files at build time – no requests to Google at runtime.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Indexing is switched on at launch via SITE_INDEXABLE (env read per request, not at build time).
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env.APP_URL),
    title: { default: "inhouseticket", template: "%s · inhouseticket" },
    description: de.landing.subtitle,
    robots: env.SITE_INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type: "website", siteName: "inhouseticket", locale: "de_DE", title: de.landing.title, description: de.landing.subtitle },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e11" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Every page renders per request: the CSP nonce from src/proxy.ts only reaches dynamic pages.
  await connection();
  return (
    <html lang="de" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
