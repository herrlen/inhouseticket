import { after } from "next/server";
import { forwardHit, matomoEnabled } from "@/lib/matomo";

export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;

/** Matomo tracking endpoint on our own domain (see src/lib/matomo.ts). Answers at once, forwards afterwards. */
async function handle(request: Request) {
  if (!matomoEnabled()) return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  if (request.method === "POST") {
    const body = await request.text();
    if (body.length > MAX_BODY) return new Response(null, { status: 413 });
    for (const [k, v] of new URLSearchParams(body)) params.append(k, v);
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const lang = request.headers.get("accept-language") ?? "";
  after(() => forwardHit(params, ip, ua, lang));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export { handle as GET, handle as POST };
