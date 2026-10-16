"use client";

import { createContext, use } from "react";
import { loadEn, loadedEn } from "./load-en";
import { DEFAULT_LOCALE, type Locale } from "./locale";

// Start fetching the English chunk before hydration when the server rendered English.
if (typeof document !== "undefined" && document.documentElement.lang === "en") void loadEn();

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Provides the request's locale (from the cookie, read on the server) to client components. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Suspends until the English chunk is there; switching happens inside a transition, so the old UI stays.
  if (locale === "en" && !loadedEn()) use(loadEn());
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return use(LocaleContext);
}
