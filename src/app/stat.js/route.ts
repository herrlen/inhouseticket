import { matomoJs } from "@/lib/matomo";

export const dynamic = "force-dynamic";

/** The Matomo tracker, served from our domain (see src/lib/matomo.ts). */
export async function GET() {
  const js = await matomoJs();
  if (!js) return new Response(null, { status: 404 });
  return new Response(js, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
