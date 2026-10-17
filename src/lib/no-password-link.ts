// A person whose account has no password yet tries to sign in with one (Len, 2026-10-17): the
// login page shows the same neutral answer as for a wrong password or an unknown address, and the
// server quietly mails a sign-in link – after it, the forced set-password page follows.
// Pure (no DB, no mail), so the decision is unit-tested; the wiring sits in src/lib/auth.ts.
import { NO_PASSWORD_LINK_WINDOW_MS, NO_PASSWORD_LINKS_PER_EMAIL } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";

/** What the database knows about an address: no account, an account without or with a password. */
export type PasswordState = "noAccount" | "noPassword" | "hasPassword";

/**
 * The address worth looking at after a password sign-in, or null. Only Better Auth's
 * "email or password is wrong" answer (401) counts – not rate limits, bad input or server errors.
 */
export function failedSignInEmail(status: number | undefined, email: unknown): string | null {
  if (status !== 401 || typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return normalized.includes("@") ? normalized : null;
}

/**
 * Send the link only to an existing account without a password, at most once per address and
 * window. Unknown addresses and accounts with a password never get mail (and never use up the
 * limit). Accounts are never created here – the magic link goes to an existing person.
 */
export function shouldSendNoPasswordLink(email: string, state: PasswordState, now = Date.now()): boolean {
  if (state !== "noPassword") return false;
  return rateLimit(`no-password-link:${email}`, NO_PASSWORD_LINKS_PER_EMAIL, NO_PASSWORD_LINK_WINDOW_MS, now).ok;
}
