"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createStatusAction } from "@/app/(app)/[workspace]/actions";
import { Plus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { ghostRow } from "./list-extras";
import { useParts } from "./use-parts";

// Loaded on demand (next/dynamic) to keep the project page within the JS budget: the new-status
// form for admins and the unfolded subtasks of the list (docs/ONBOARDING.md §4).

/** "+ Neuer Status" under the list (admins only); goes before the done statuses. */
export function NewStatusRow({ workspaceId, projectKey }: { workspaceId: string; projectKey: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createStatusAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(ghostRow, "px-3")}>
        <Plus size={12} />
        {t.list.newStatus}
      </button>
    );
  }
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectKey" value={projectKey} />
      <input type="hidden" name="color" value="#3B82F6" />
      <input type="hidden" name="category" value="active" />
      <input
        autoFocus
        name="name"
        required
        maxLength={50}
        aria-label={t.list.newStatusName}
        aria-describedby="new-status-hint"
        placeholder={t.list.newStatusName}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="h-7 w-56 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px]"
      />
      <button type="submit" disabled={pending} className="h-7 rounded-[var(--radius-badge)] bg-accent px-2.5 text-[13px] font-medium text-accent-contrast disabled:opacity-50">
        {t.common.create}
      </button>
      <span id="new-status-hint" className="w-full text-xs text-muted">
        {state.fieldErrors?.name ?? state.error ?? t.list.newStatusHint}
      </span>
    </form>
  );
}

/** Subtasks of one ticket, read-only, under its row (loaded when the switch is on). */
export function SubtaskRows({ workspaceId, ticketId, ticketKey, colSpan }: { workspaceId: string; ticketId: string; ticketKey: string; colSpan: number }) {
  const t = useT();
  const { data } = useParts(workspaceId, ticketId);
  return (
    <tr className="border-b border-border bg-bg/40">
      <td />
      <td colSpan={colSpan} className="py-1.5 pl-6">
        {data ? (
          <ul aria-label={t.list.subtasksOf(ticketKey)} className="flex flex-col gap-0.5 text-[13px]">
            {data.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span aria-hidden className={cn("flex size-3.5 items-center justify-center rounded-sm border text-[9px]", s.done ? "border-status-done bg-status-done text-surface" : "border-border")}>
                  {s.done ? "✓" : ""}
                </span>
                <span className={cn(s.done && "text-muted line-through")}>{s.title}</span>
                <span className="sr-only">({t.list.subtaskState(s.done)})</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-muted">{t.list.subtasksLoading}</span>
        )}
      </td>
    </tr>
  );
}

