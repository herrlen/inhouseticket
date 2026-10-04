import Link from "next/link";

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Rechtliches" className={className}>
      <ul className="flex gap-4 text-xs text-muted">
        <li><Link href="/impressum" className="hover:text-text hover:underline">Impressum</Link></li>
        <li><Link href="/datenschutz" className="hover:text-text hover:underline">Datenschutz</Link></li>
      </ul>
    </nav>
  );
}
