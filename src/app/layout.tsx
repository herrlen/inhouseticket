import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { connection } from "next/server";
import { MatomoTracker } from "@/components/matomo-tracker";
import { env } from "@/lib/env";
import { SITE_URL } from "@/lib/site";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { getLocale, getT } from "@/lib/i18n/server";
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
export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return {
    // Canonicals and the Open Graph image point at the site host (inhouseticket.com); app pages are noindex anyway.
    metadataBase: new URL(SITE_URL),
    title: { default: "inhouseticket", template: "%s · inhouseticket" },
    description: t.landing.subtitle,
    robots: env.SITE_INDEXABLE ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type: "website", siteName: "inhouseticket", locale: locale === "en" ? "en_GB" : "de_DE", title: t.landing.title, description: t.landing.subtitle },
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
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        <MatomoTracker />
      </body>
    </html>
  );
}
