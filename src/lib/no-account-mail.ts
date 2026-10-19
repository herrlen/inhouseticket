// A sign-in link requested for an address without an account (Len, 2026-10-19): the magic link
// never creates accounts. The sign-in page answers as always ("check your inbox"); the address
// gets a hint with a link to the registration page instead of a sign-in link.
// Pure (no DB, no mail), so the decision and the link are unit-tested; the wiring sits in
// src/lib/auth.ts.
import { NO_ACCOUNT_MAIL_WINDOW_MS, NO_ACCOUNT_MAILS_PER_EMAIL } from "@/lib/limits";
import { addressKey, rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";

/** At most one "no account yet" mail per address and window; the rest are skipped silently. */
export function takeNoAccountMail(email: string, now = Date.now()): boolean {
  return rateLimit(addressKey("no-account", email), NO_ACCOUNT_MAILS_PER_EMAIL, NO_ACCOUNT_MAIL_WINDOW_MS, now).ok;
}

/**
 * Registration link for the mail: the address (prefilled on the page, validated there again) and
 * where the person wanted to go – taken from the verify URL's `callbackURL`, so an invitation or a
 * connector login continues after the registration. Only same-origin paths survive (`safeNext`).
 */
export function noAccountRegisterUrl(appUrl: string, email: string, verifyUrl: string): string {
  const next = safeNext(new URL(verifyUrl).searchParams.get("callbackURL") ?? undefined);
  const url = new URL("/register", appUrl);
  url.searchParams.set("email", email.trim().toLowerCase());
  if (next !== "/start" && next !== "/") url.searchParams.set("next", next);
  return url.toString();
}
