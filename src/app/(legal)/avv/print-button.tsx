"use client";

/** The AVV as PDF: the browser's print dialog ("Als PDF sichern"). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mb-6 inline-flex h-8 items-center rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-[13px] font-medium hover:bg-bg print:hidden"
    >
      Drucken / als PDF speichern
    </button>
  );
}
