import { setLocale } from "@/app/actions/locale";
import { cn } from "@/lib/cn";
import { LOCALES, type Locale } from "@/lib/i18n/locale";

const NAMES: Record<Locale, string> = { de: "Deutsch", en: "English" };

/** DE | EN switch. A plain form with a Server Action: works with keyboard, without JS and in server and client trees. */
export function LanguageToggle({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
  return (
    <form action={setLocale} className={cn("flex items-center text-[12px] font-medium", className)}>
      <div role="group" aria-label={label} className="flex items-center gap-0.5">
        {LOCALES.map((l, i) => (
          <span key={l} className="flex items-center gap-0.5">
            {i > 0 ? (
              <span aria-hidden className="text-muted">
                |
              </span>
            ) : null}
            <button
              type="submit"
              name="locale"
              value={l}
              lang={l}
              aria-pressed={l === locale}
              className={cn(
                "rounded-[var(--radius-badge)] px-1.5 py-1 hover:text-text hover:underline",
                l === locale ? "text-text underline underline-offset-4" : "text-muted",
              )}
            >
              {l.toUpperCase()}
              <span className="sr-only"> – {NAMES[l]}</span>
            </button>
          </span>
        ))}
      </div>
    </form>
  );
}
