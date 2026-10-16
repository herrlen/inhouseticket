import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export async function LegalLinks({ className }: { className?: string }) {
  const t = (await getT()).legal;
  return (
    <nav aria-label={t.nav} className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li><Link href="/impressum" className="hover:text-text hover:underline">{t.imprint}</Link></li>
        <li><Link href="/datenschutz" className="hover:text-text hover:underline">{t.privacy}</Link></li>
        <li><Link href="/agb" className="hover:text-text hover:underline">{t.terms}</Link></li>
        <li><Link href="/avv" className="hover:text-text hover:underline">{t.dpa}</Link></li>
      </ul>
    </nav>
  );
}
