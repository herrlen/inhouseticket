/** Shown on legal texts that have not been reviewed by a lawyer yet (decided with Len 2026-10-06). */
export function DraftNotice() {
  return (
    <p role="note" className="mb-6 rounded-[var(--radius-badge)] border border-prio-high-ink p-3 text-[13px] text-prio-high-ink">
      Entwurf – noch nicht rechtlich geprüft und noch nicht verbindlich. Fragen an hello@inhouseticket.com.
    </p>
  );
}
