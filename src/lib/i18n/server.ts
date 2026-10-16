import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { de, type Messages } from "./de";
import { en } from "./en";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./locale";

const MESSAGES: Record<Locale, Messages> = { de, en };

/** UI language of the current request: the toggle's cookie, otherwise German. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** Messages for the current request (Server Components, Server Actions, Route Handlers). */
export async function getT(): Promise<Messages> {
  return MESSAGES[await getLocale()];
}

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale];
}

/**
 * Like getT(), but usable where a request scope may be missing (auth hooks, mails sent from jobs):
 * outside a request there is no cookie to read, so German applies.
 */
export async function getTOrDefault(): Promise<Messages> {
  try {
    return await getT();
  } catch {
    // cookies() throws outside a request scope – fall back to the default locale.
    return de;
  }
}
