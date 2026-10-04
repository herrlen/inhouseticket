// Fixed-window rate limiter in memory (one container; KONZEPT §4 "Rate-Limit pro Token").

type Window = { start: number; count: number };
const windows = new Map<string, Window>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    }
    return { ok: true };
  }
  if (w.count >= limit) return { ok: false, retryAfterSec: Math.ceil((w.start + windowMs - now) / 1000) };
  w.count++;
  return { ok: true };
}
