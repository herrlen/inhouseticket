import type { Metadata } from "next";
import { LanguageToggle } from "@/components/language-toggle";
import { LegalLinks } from "@/components/legal-links";
import { getLocale, getT } from "@/lib/i18n/server";
import { NOINDEX_ROBOTS } from "@/lib/indexing";

// Sign-in, registration, invitations, OAuth consent: never in search results (header: src/proxy.ts).
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="text-[15px] font-semibold">
            inhouse<span className="text-accent">ticket</span>
          </p>
          <LanguageToggle locale={locale} label={t.common.language} />
        </div>
        {children}
      </div>
      <LegalLinks />
    </main>
  );
}
