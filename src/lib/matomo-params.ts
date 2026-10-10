import { isIP } from "node:net";

// Pure helpers for the Matomo proxy (src/app/stat/route.ts) – kept free of env/server-only for tests.

/** Values the browser must never set: site, address, auth and timestamps are decided by the proxy. */
const BLOCKED = new Set(["token_auth", "cip", "idsite", "cdt", "cdt_utc", "rec"]);
const MAX_PARAMS = 100;
const MAX_VALUE = 2048;

/**
 * Truncates the client address before it leaves our server: IPv4 to two bytes, IPv6 to the first
 * 48 bits. Country-level location keeps working; the address no longer identifies a person.
 */
export function anonymizeIp(raw: string): string {
  let ip = raw.trim();
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".");
    return `${a}.${b}.0.0`;
  }
  if (version === 6) {
    const [head = "", tail] = ip.split("::");
    const left = head ? head.split(":") : [];
    const right = tail ? tail.split(":") : [];
    const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
    return `${groups.slice(0, 3).map((g) => g || "0").join(":")}::`;
  }
  return "";
}

/** Keeps only plain tracking parameters from the browser (bounded in count and length). */
export function trackingParams(input: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of input) {
    if (out.size >= MAX_PARAMS) break;
    // "_*" are the tracker's own visitor/cookie values (_id, _idn …); without them Matomo derives
    // the visit from a server-side hash that changes daily.
    if (!key || key.startsWith("_") || BLOCKED.has(key) || value.length > MAX_VALUE) continue;
    out.append(key, value);
  }
  return out;
}
