"use client";

import { IconEpic, IconStory, IconSubtask, IconTask } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import type { TicketType } from "@/lib/ticket-hierarchy";
import deHierarchy from "@/lib/i18n/de/hierarchy";

const MESSAGES = { hierarchy: deHierarchy };

// The same shapes and colors as in emuchat (Redesign X2): epic violet diamond, story green stack,
// task and subtask neutral. The name is always there as text for screen readers. Colors are ink
// tokens (≥ 4.5:1 on every background, tokens.test.ts).
const ICON = { epic: IconEpic, story: IconStory, task: IconTask, subtask: IconSubtask } as const;
const COLOR = { epic: "text-status-review-ink", story: "text-status-done-ink", task: "text-muted", subtask: "text-muted" } as const;

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
