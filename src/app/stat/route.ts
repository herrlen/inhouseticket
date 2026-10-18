import { after } from "next/server";
import { readBodyLimited } from "@/lib/body";
import { forwardHit, matomoEnabled } from "@/lib/matomo";
import { measurementRefused } from "@/lib/optout";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** A tracking hit is a few hundred bytes; 16 KB leaves room for long URLs and events. */
const MAX_BODY = 16 * 1024;
/** Hits per client address and minute – page views and events of a busy tab fit easily. */
const HITS_PER_MINUTE = 120;

/** Matomo tracking endpoint on our own domain (see src/lib/matomo.ts). Answers at once, forwards afterwards. */
async function handle(request: Request) {
  if (!matomoEnabled()) return new Response(null, { status: 404 });
  // Opt-out cookie, Do Not Track or Global Privacy Control: accepted and dropped, nothing forwarded.
  if (measurementRefused(request.headers)) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  // The address is only used for this in-memory counter and, truncated, for Matomo (privacy policy).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!rateLimit(`stat:${ip || "unknown"}`, HITS_PER_MINUTE, 60_000).ok) return new Response(null, { status: 429 });
  const params = new URL(request.url).searchParams;
  if (request.method === "POST") {
    // Counted while reading, so an oversized (or chunked) body never sits in memory.
    const body = await readBodyLimited(request, MAX_BODY);
    if (body === "too_large") return new Response(null, { status: 413 });
    for (const [k, v] of new URLSearchParams(new TextDecoder().decode(body))) params.append(k, v);
  }
  const ua = request.headers.get("user-agent") ?? "";
  const lang = request.headers.get("accept-language") ?? "";
  after(() => forwardHit(params, ip, ua, lang));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export { handle as GET, handle as POST };
