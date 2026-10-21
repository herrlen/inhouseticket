"use client";

import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { useT } from "@/lib/i18n/client";
import { useProjectInfo } from "./context";
import { priorityKey } from "./list-model";
import { PriorityIcon, StatusDot } from "./pickers";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";
import deProject from "@/lib/i18n/de/project";

const MESSAGES = { list: deList, priority: dePriority, project: deProject };

type Patch = { statusId?: string; priority?: number; assigneeId?: string | null };

export function BulkBar({ count, onApply, onClear }: { count: number; onApply: (patch: Patch) => void; onClear: () => void }) {
  const t = useT(MESSAGES);
  const { statuses, members } = useProjectInfo();
  if (count === 0) return null;
  return (
    <div role="region" aria-label={t.list.bulkRegion} className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2 shadow-float">
      <span className="text-[13px] font-medium" aria-live="polite">{t.list.selected(count)}</span>
      <Dropdown trigger={`${t.project.colStatus} ▾`} items={statuses.map((s) => ({ label: s.name, icon: <StatusDot color={s.color} />, onSelect: () => onApply({ statusId: s.id }) }))} />
      <Dropdown trigger={`${t.project.colPriority} ▾`} items={[4, 3, 2, 1, 0].map((p) => ({ label: t.priority[priorityKey(p)], icon: <PriorityIcon priority={p} />, onSelect: () => onApply({ priority: p }) }))} />
      <Dropdown
        trigger={`${t.list.colAssignee} ▾`}
        items={[...members.map((m) => ({ label: m.name, onSelect: () => onApply({ assigneeId: m.id }) })), { label: t.list.unassigned, onSelect: () => onApply({ assigneeId: null }) }]}
      />
      <Button variant="ghost" size="sm" onClick={onClear}>{t.list.clearSelection}</Button>
    </div>
  );
}
