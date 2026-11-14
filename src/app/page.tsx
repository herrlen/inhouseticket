import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LegalLinks } from "@/components/legal-links";
import { OPERATOR } from "@/lib/legal";
import { LanguageToggle } from "@/components/language-toggle";
import { getLocale, getT } from "@/lib/i18n/server";
import { SOURCE_IDS, SOURCE_NAMES } from "@/lib/import/source";
import { getSession } from "@/lib/session";
import { appHref, INSTANCE, isAppHost } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getT()).landing;
  return { title: { absolute: t.metaTitle }, description: t.subtitle, alternates: { canonical: "/" } };
}

// Screenshots come from e2e/landing-screenshots.spec.ts (demo workspace, light and dark).
const SHOT = { width: 1360, height: 860 } as const;
const DOTS = ["bg-p-coral", "bg-p-blue", "bg-p-mint", "bg-p-violet", "bg-p-sun", "bg-p-lime"];

function Screenshot({ name, alt, priority = false }: { name: string; alt: string; priority?: boolean }) {
  return (
    <picture>
      <source srcSet={`/landing/${name}-dark.jpg`} media="(prefers-color-scheme: dark)" />
      <img
        src={`/landing/${name}-light.jpg`}
        alt={alt}
        width={SHOT.width}
        height={SHOT.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="h-auto w-full rounded-[var(--radius-card)] border border-border"
      />
    </picture>
  );
}

export default async function Home() {
  // Signed in (the session cookie is shared with the site host): straight into the app. On the app
  // host the address belongs to the app, so a signed-out visitor lands on the sign-in page there.
  if (await getSession()) redirect(appHref("/start"));
  // A company instance (SELF_HOSTED) has no landing page: "/" is its sign-in.
  if (INSTANCE.selfHosted || isAppHost((await headers()).get("host"))) redirect("/login");
  const [all, locale] = await Promise.all([getT(), getLocale()]);
  const t = all.landing;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <span className="text-[15px] font-semibold">
          inhouse<span className="text-accent">ticket</span>
        </span>
        <div className="flex items-center gap-4">
          <LanguageToggle locale={locale} label={all.common.language} />
          <Link href={appHref("/login")} data-cta="header" className="text-[13px] font-medium hover:underline">
            {t.login}
          </Link>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pt-12 pb-10 text-center md:pt-20">
          <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-balance md:text-5xl">{t.title}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted md:text-lg">{t.subtitle}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={appHref("/register")} data-cta="hero" className="inline-flex h-10 items-center rounded-[var(--radius-badge)] bg-accent px-4 font-medium text-accent-contrast hover:bg-accent-hover">
              {t.start}
            </Link>
            <a href="#claude" className="inline-flex h-10 items-center rounded-[var(--radius-badge)] border border-border bg-surface px-4 font-medium hover:bg-bg">
              {t.claudeLink}
            </a>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            {t.devNote}{" "}
            <a href={`mailto:${OPERATOR.email}`} className="text-accent underline">
              {OPERATOR.email}
            </a>
          </p>
          <div className="mt-12">
            <Screenshot name="list" alt={t.heroAlt} priority />
          </div>
        </section>

        <section aria-labelledby="features-heading" className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="features-heading" className="mx-auto max-w-2xl text-center text-2xl font-semibold tracking-tight md:text-3xl">
            {t.featuresTitle}
          </h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.map((f, i) => (
              <li key={f.title} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <h3 className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className={`size-2 rounded-full ${DOTS[i % DOTS.length]}`} />
                  {f.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-2">
          {[
            { name: "board", title: t.boardTitle, text: t.boardText, alt: t.boardAlt },
            { name: "dashboard", title: t.dashboardTitle, text: t.dashboardText, alt: t.dashboardAlt },
          ].map((s) => (
            <figure key={s.name}>
              <Screenshot name={s.name} alt={s.alt} />
              <figcaption className="mt-4">
                <span className="block font-semibold">{s.title}</span>
                <span className="mt-1 block text-[14px] text-muted">{s.text}</span>
              </figcaption>
            </figure>
          ))}
        </section>

        <section aria-labelledby="migrate-heading" className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 id="migrate-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
                {t.migrateTitle}
              </h2>
              <p className="mt-3 leading-relaxed text-muted">{t.migrateText}</p>
              <ul aria-label={t.migrateTools} className="mt-5 flex flex-wrap gap-2">
                {SOURCE_IDS.map((id) => (
                  <li key={id}>
                    <Link href={`/umziehen#${id}`} className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-[13px] font-medium hover:bg-bg">
                      {SOURCE_NAMES[id]}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/umziehen" className="mt-6 inline-flex h-10 items-center rounded-[var(--radius-badge)] border border-border bg-surface px-4 font-medium hover:bg-bg">
                {t.migrateLink} →
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {t.migrateItems.map((item) => (
                <li key={item} className="flex gap-2 rounded-[var(--radius-badge)] border border-border bg-surface px-4 py-3 text-[14px]">
                  <span aria-hidden className="text-accent">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="claude" aria-labelledby="claude-heading" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16">
          <div className="grid gap-8 rounded-[var(--radius-card)] border border-border bg-surface p-6 md:grid-cols-2 md:p-10">
            <div>
              <h2 id="claude-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
                {t.claudeTitle}
              </h2>
              <p className="mt-3 leading-relaxed text-muted">{t.claudeText}</p>
            </div>
            <ul className="flex flex-col gap-2">
              {t.claudeExamples.map((e) => (
                <li key={e} className="rounded-[var(--radius-badge)] border border-border bg-bg px-4 py-3 text-[14px]">
                  {all.common.quote(e)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="price-heading" className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="price-heading" className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
            {t.priceTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">{t.priceText}</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.included.map((g, i) => (
              <section key={g.title} aria-labelledby={`included-${i}`} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <h3 id={`included-${i}`} className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className={`size-2 rounded-full ${DOTS[i % DOTS.length]}`} />
                  {g.title}
                </h3>
                <ul className="mt-3 flex flex-col gap-2 text-[14px] leading-snug">
                  {g.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="text-accent">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href={appHref("/register")} data-cta="bottom" className="inline-flex h-10 items-center rounded-[var(--radius-badge)] bg-accent px-4 font-medium text-accent-contrast hover:bg-accent-hover">
              {t.start}
            </Link>
            <p className="mt-4 text-[13px] text-muted">
              {t.devNote}{" "}
              <a href={`mailto:${OPERATOR.email}`} className="text-accent underline">
                {OPERATOR.email}
              </a>
            </p>
          </div>
        </section>
        <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-16">
          <h2 id="faq-heading" className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
            {t.faqTitle}
          </h2>
          <div className="mt-8 flex flex-col gap-2">
            {t.faq.map((f) => (
              <details key={f.q} className="group rounded-[var(--radius-card)] border border-border bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[var(--radius-card)] px-5 py-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="px-5 pb-4 text-[14px] leading-relaxed text-muted">
                  <p>{f.a}</p>
                  {"link" in f && f.link ? (
                    <Link href={f.link.href} className="mt-2 inline-block text-accent underline">
                      {f.link.text}
                    </Link>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-8 text-xs text-muted">
        <span>© 2026 {OPERATOR.name}</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
