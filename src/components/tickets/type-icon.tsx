"use client";

import { Bolt, Bookmark, CheckSquare, SubtaskArrow } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import type { TicketType } from "@/lib/ticket-hierarchy";
import deHierarchy from "@/lib/i18n/de/hierarchy";

const MESSAGES = { hierarchy: deHierarchy };

// Shape and color both differ per type; the name is always there as text for screen readers.
// Colors reuse the status ink tokens (≥ 4.5:1 on --bg/--surface in light and dark, tokens.test.ts).
const ICON = { epic: Bolt, story: Bookmark, task: CheckSquare, subtask: SubtaskArrow } as const;
const COLOR = { epic: "text-status-review-ink", story: "text-status-done-ink", task: "text-status-active-ink", subtask: "text-muted" } as const;

/**
 * Ticket type symbol. `id` lets a surrounding button or card point at the text via
 * aria-describedby; `withLabel` shows the name next to the symbol.
 */
export function TypeIcon({ type, id, withLabel, className }: { type: TicketType; id?: string; withLabel?: boolean; className?: string }) {
  const t = useT(MESSAGES);
  const Icon = ICON[type];
  const name = t.hierarchy.types[type];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", COLOR[type], className)} title={withLabel ? undefined : name}>
      <Icon size={14} />
      {withLabel ? <span aria-hidden className="text-text">{name}</span> : null}
      <span id={id} className="sr-only">{t.hierarchy.typeOf(name)}</span>
    </span>
  );
}
