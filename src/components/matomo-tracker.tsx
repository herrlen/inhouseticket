import { headers } from "next/headers";
import { Suspense } from "react";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { initMatomo } from "@/lib/analytics";
import { matomoEnabled, matomoSiteId } from "@/lib/matomo";

/**
 * Matomo for the whole site – public pages, sign-in and workspaces – rendered once in the root
 * layout. Cookieless, Do-Not-Track respected. The inline bootstrap carries the CSP nonce and loads
 * /stat.js ('strict-dynamic'); page views come from <AnalyticsTracker> with normalised URLs and
 * generic titles (src/lib/analytics-url.ts).
 */
export async function MatomoTracker() {
  if (!matomoEnabled()) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: initMatomo(matomoSiteId()) }} />
      <Suspense fallback={null}>
        <AnalyticsTracker />
      </Suspense>
    </>
  );
}
