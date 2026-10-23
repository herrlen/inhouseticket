import type { Metadata } from "next";
import Link from "next/link";
import { intlLocale } from "@/lib/i18n/locale";
import { getLocale, getT } from "@/lib/i18n/server";
import { MAX_IMPORT_BYTES, MAX_IMPORT_TICKETS } from "@/lib/import/plan";
import { SOURCE_IDS } from "@/lib/import/source";
import { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "@/lib/limits";

// Public help page for moving from another tool. Lives in the (legal) group for its
// plain page layout; the export steps are the same texts the import page shows.

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getT()).migrate;
  return { title: t.metaTitle, description: t.metaDescription, alternates: { canonical: "/umziehen" } };
}

export default async function MigratePage() {
  const [all, locale] = await Promise.all([getT(), getLocale()]);
  const t = all.migrate;
  const num = (n: number) => n.toLocaleString(intlLocale(locale));
  return (
    <>
      <h1>{t.title}</h1>
      <p>{t.intro}</p>

      <h2>{t.stepsTitle}</h2>
      <ol className="mb-3 flex flex-col gap-2">
        {t.steps.map((step, i) => (
          <li key={step} className="ml-0! flex list-none! gap-3 leading-relaxed">
            <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      {SOURCE_IDS.map((id) => (
        <section key={id} id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-8">
          <h2 id={`${id}-heading`}>{t.toolTitle(all.import.sources[id])}</h2>
          <p>{all.import.howTo[id]}</p>
        </section>
      ))}

      <h2>{t.carriedTitle}</h2>
      <ul>
        {t.carried.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>{t.notCarriedTitle}</h2>
      <ul>
        {t.notCarried.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>{t.limitsTitle}</h2>
      <ul>
        {t.limits(MAX_IMPORT_BYTES / 1024 / 1024, num(MAX_IMPORT_TICKETS), num(MAX_TITLE), num(MAX_DESCRIPTION), MAX_SUBTASKS).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <p className="mt-8">{t.outro}</p>
      <p>
        <Link href="/register" data-cta="umziehen" className="inline-flex h-10 items-center rounded-[var(--radius-badge)] bg-accent px-4 font-medium text-accent-contrast hover:bg-accent-hover">
          {t.cta}
        </Link>
      </p>
    </>
  );
}
