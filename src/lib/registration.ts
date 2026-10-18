// Registration with name, address and password (Len, 2026-10-18, ADR 005). Pure decisions
// (limits, expiry, link) so they are unit-tested; the wiring sits in src/app/(auth)/register and
// src/lib/registration-plugin.ts.
import {
  ACCOUNT_EXISTS_MAILS_PER_EMAIL,
  REGISTRATION_CONFIRMS_PER_IP,
  REGISTRATION_TTL_MS,
  REGISTRATION_WINDOW_MS,
  REGISTRATIONS_PER_EMAIL,
  REGISTRATIONS_PER_IP,
} from "@/lib/limits";
import { addressKey, rateLimit } from "@/lib/rate-limit";

export const REGISTER_PATH = "/register";
export const CONFIRM_PATH = "/register/confirm";

export function registrationExpiresAt(now = Date.now()): Date {
  return new Date(now + REGISTRATION_TTL_MS);
}

/** Link in the confirmation mail. The page behind it shows a form – opening it consumes nothing. */
export function confirmRegistrationUrl(appUrl: string, token: string): string {
  const url = new URL(CONFIRM_PATH, appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

/** First address of X-Forwarded-For (set by the hosting proxy), "" when unknown. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "";
}

/**
 * One registration request: counts per IP and per address (both keyed by HMAC, never plain).
 * The address counter applies whether or not an account exists, so hitting it reveals nothing.
 */
export function takeRegistrationRequest(ip: string, email: string, now = Date.now()): boolean {
  if (!rateLimit(addressKey("register-ip", ip || "unknown"), REGISTRATIONS_PER_IP, REGISTRATION_WINDOW_MS, now).ok) return false;
  return rateLimit(addressKey("register", email), REGISTRATIONS_PER_EMAIL, REGISTRATION_WINDOW_MS, now).ok;
}

/** "You already have an account" mail: at most one per address and window, skipped silently. */
export function takeAccountExistsMail(email: string, now = Date.now()): boolean {
  return rateLimit(addressKey("register-exists", email), ACCOUNT_EXISTS_MAILS_PER_EMAIL, REGISTRATION_WINDOW_MS, now).ok;
}

/** Confirm attempts per IP – on top of the per-link counter in the database. */
export function takeConfirmAttempt(ip: string, now = Date.now()): boolean {
  return rateLimit(addressKey("register-confirm-ip", ip || "unknown"), REGISTRATION_CONFIRMS_PER_IP, REGISTRATION_WINDOW_MS, now).ok;
}
