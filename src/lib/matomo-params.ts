import { isIP } from "node:net";

// Pure helpers for the Matomo proxy (src/app/stat/route.ts) – kept free of env/server-only for tests.

/**
 * Tracking API parameters the browser may send (allowlist, Matomo tracking HTTP API). Everything
 * else is dropped – above all what only an authenticated request may set (token_auth, cip, cdt,
 * country/region/city/lat/long, ua, uid, cid, idsite, rec, new_visit) and the tracker's
 * visitor/cookie values (_id, _idn …): without them Matomo derives the visit from a server-side
 * hash that changes daily.
 */
const ALLOWED = new Set([
  // page view and request basics
  "action_name", "url", "urlref", "rand", "apiv", "h", "m", "s", "res", "cookie", "pv_id", "ca", "send_image", "ping",
  // performance timings
  "pf_net", "pf_srv", "pf_tfr", "pf_dm1", "pf_dm2", "pf_onl", "gt_ms",
  // browser features (client hints, legacy plugin flags)
  "uadata", "pdf", "qt", "realp", "wma", "fla", "java", "ag",
  // events, site search, outlinks/downloads, content tracking, goals
  "e_c", "e_a", "e_n", "e_v", "search", "search_cat", "search_count", "link", "download", "c_n", "c_p", "c_t", "c_i", "idgoal", "revenue",
]);
/** Custom dimensions (dimension1 … dimension999). */
const DIMENSION = /^dimension\d{1,3}$/;
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

/** Keeps only allowlisted tracking parameters from the browser (bounded in count and length). */
export function trackingParams(input: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of input) {
    if (out.size >= MAX_PARAMS) break;
    if (!(ALLOWED.has(key) || DIMENSION.test(key)) || value.length > MAX_VALUE) continue;
    out.append(key, value);
  }
  return out;
}
