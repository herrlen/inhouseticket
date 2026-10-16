import { getLocale, getT } from "@/lib/i18n/server";

/** Legal texts exist in German only. In English, a short note says so; the text itself is marked lang="de". */
export async function GermanOnly({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getT()]);
  return (
    <>
      {locale === "de" ? null : (
        <p role="note" className="mb-6! rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-[13px] text-muted">
          {t.legal.germanOnly}
        </p>
      )}
      <div lang="de">{children}</div>
    </>
  );
}
