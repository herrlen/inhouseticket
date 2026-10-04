"use client";

import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { de } from "@/lib/i18n/de";
import { useProjectInfo } from "./context";
import { priorityKey } from "./list-model";
import { PriorityIcon, StatusDot } from "./pickers";

type Patch = { statusId?: string; priority?: number; assigneeId?: string | null };

export function BulkBar({ count, onApply, onClear }: { count: number; onApply: (patch: Patch) => void; onClear: () => void }) {
  const { statuses, members } = useProjectInfo();
  if (count === 0) return null;
  return (
    <div role="region" aria-label={de.list.bulkRegion} className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2 shadow-float">
      <span className="text-[13px] font-medium" aria-live="polite">{de.list.selected(count)}</span>
      <Dropdown trigger={`${de.project.colStatus} ▾`} items={statuses.map((s) => ({ label: s.name, icon: <StatusDot color={s.color} />, onSelect: () => onApply({ statusId: s.id }) }))} />
      <Dropdown trigger={`${de.project.colPriority} ▾`} items={[4, 3, 2, 1, 0].map((p) => ({ label: de.priority[priorityKey(p)], icon: <PriorityIcon priority={p} />, onSelect: () => onApply({ priority: p }) }))} />
      <Dropdown
        trigger={`${de.list.colAssignee} ▾`}
        items={[...members.map((m) => ({ label: m.name, onSelect: () => onApply({ assigneeId: m.id }) })), { label: de.list.unassigned, onSelect: () => onApply({ assigneeId: null }) }]}
      />
      <Button variant="ghost" size="sm" onClick={onClear}>{de.list.clearSelection}</Button>
    </div>
  );
}
