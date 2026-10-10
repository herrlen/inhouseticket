import Link from "next/link";

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Rechtliches" className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li><Link href="/impressum" className="hover:text-text hover:underline">Impressum</Link></li>
        <li><Link href="/datenschutz" className="hover:text-text hover:underline">Datenschutz</Link></li>
        <li><Link href="/agb" className="hover:text-text hover:underline">AGB</Link></li>
        <li><Link href="/avv" className="hover:text-text hover:underline">AVV</Link></li>
      </ul>
    </nav>
  );
}
