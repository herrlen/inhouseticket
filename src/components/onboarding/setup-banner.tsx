import Link from "next/link";
import { getT } from "@/lib/i18n/server";

/** Owner postponed the wizard ("Später fertigstellen"): a calm reminder above every workspace page. */
export async function SetupBanner() {
  const t = (await getT()).onboardingBanner;
  return (
    <section aria-labelledby="setup-banner-title" className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:mx-6">
      <div className="min-w-60 flex-1">
        <h2 id="setup-banner-title" className="font-semibold">{t.title}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{t.text}</p>
      </div>
      <Link
        href="/onboarding"
        className="inline-flex h-9 items-center rounded-[var(--radius-badge)] bg-accent px-3.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
      >
        {t.button}
      </Link>
    </section>
  );
}
