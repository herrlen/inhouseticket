import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { LEGAL_LINKS } from "@/lib/site";

// Hosted: our four legal pages. Company instance: its own legal notice and privacy policy (src/lib/instance.ts).
export async function LegalLinks({ className }: { className?: string }) {
  const t = (await getT()).legal;
  const cls = "hover:text-text hover:underline";
  return (
    <nav aria-label={t.nav} className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {LEGAL_LINKS.map((l) => (
          <li key={l.key}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className={cls}>
                {t[l.key]}
              </a>
            ) : (
              <Link href={l.href} className={cls}>
                {t[l.key]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
