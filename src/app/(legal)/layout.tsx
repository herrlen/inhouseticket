import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { getLocale, getT } from "@/lib/i18n/server";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-12 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-[15px] font-semibold">
            inhouse<span className="text-accent">ticket</span>
          </Link>
          <LanguageToggle locale={locale} label={t.common.language} />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 [&_h1]:mb-6 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3">
        {children}
      </main>
    </div>
  );
}
