// Fixed-window rate limiter in memory (one container; KONZEPT §4 "Rate-Limit pro Token").
import { createHmac, randomBytes } from "node:crypto";

type Window = { start: number; count: number };
const windows = new Map<string, Window>();

/** Counts `cost` units (e.g. mails, batched calls) against `limit` per window; rejects without counting. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  cost = 1,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    if (cost > limit) return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
    windows.set(key, { start: now, count: cost });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    }
    return { ok: true };
  }
  if (w.count + cost > limit) return { ok: false, retryAfterSec: Math.ceil((w.start + windowMs - now) / 1000) };
  w.count += cost;
  return { ok: true };
}

/**
 * HMAC key for per-address counters: the auth secret, or a random key per process (the counters
 * live in this process only, so a stable key is not needed). Read from process.env directly so
 * the pure callers stay unit-testable without the full env validation.
 */
const ADDRESS_KEY: string | Buffer = process.env.BETTER_AUTH_SECRET || randomBytes(32);

/**
 * Counter key for an e-mail address: prefix plus HMAC-SHA-256 of the normalized address. The
 * plain address is never held in memory (privacy policy: "pseudonymisiert (Hash der Adresse)").
 */
export function addressKey(prefix: string, email: string): string {
  return `${prefix}:${createHmac("sha256", ADDRESS_KEY).update(email.trim().toLowerCase()).digest("base64url")}`;
}
