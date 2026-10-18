"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { trackEvent, trackPage } from "@/lib/analytics";

/**
 * Sends the Matomo page view for every route change, including query-only changes such as the
 * list/board switch or an opened ticket (trackPage() drops unchanged normalised URLs, so filter
 * typing or React's double effects in development never count twice). Also reports clicks on
 * marketing links marked with `data-cta="<position>"`. Rendered once, in the root layout, inside
 * <Suspense> (useSearchParams).
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    trackPage(pathname, search ? `?${search}` : "");
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const cta = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-cta]") : null;
      if (cta?.dataset.cta) trackEvent("Marketing", "CTA Click", cta.dataset.cta);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
