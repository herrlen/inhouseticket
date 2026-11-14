"use client";

import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { ChevronDown } from "@/components/ui/icons";
import { useT } from "@/lib/i18n/client";
import { useProjectInfo } from "./context";
import { priorityKey } from "./list-model";
import { PriorityIcon, StatusSwatch } from "./pickers";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";
import deProject from "@/lib/i18n/de/project";

const MESSAGES = { list: deList, priority: dePriority, project: deProject };

const trigger = "inline-flex h-8 items-center gap-1 rounded-[var(--radius-badge)] px-2.5 text-[13px] text-secondary hover:bg-hover hover:text-text aria-expanded:bg-hover";
const caret = <ChevronDown size={14} />;

type Patch = { statusId?: string; priority?: number; assigneeId?: string | null };

export function BulkBar({ count, onApply, onClear }: { count: number; onApply: (patch: Patch) => void; onClear: () => void }) {
  const t = useT(MESSAGES);
  const { statuses, members } = useProjectInfo();
  if (count === 0) return null;
  return (
    <div role="region" aria-label={t.list.bulkRegion} className="sticky bottom-4 z-20 mx-auto mt-4 flex w-fit flex-wrap items-center gap-1 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-1.5 shadow-float">
      <span className="mr-2 text-[13px] font-semibold" aria-live="polite">{t.list.selected(count)}</span>
      <Dropdown triggerClassName={trigger} trigger={<>{t.project.colStatus}{caret}</>} items={statuses.map((s) => ({ label: s.name, icon: <StatusSwatch status={s} />, onSelect: () => onApply({ statusId: s.id }) }))} />
      <Dropdown triggerClassName={trigger} trigger={<>{t.project.colPriority}{caret}</>} items={[4, 3, 2, 1, 0].map((p) => ({ label: t.priority[priorityKey(p)], icon: <PriorityIcon priority={p} />, onSelect: () => onApply({ priority: p }) }))} />
      <Dropdown
        triggerClassName={trigger}
        trigger={<>{t.list.colAssignee}{caret}</>}
        items={[...members.map((m) => ({ label: m.name, onSelect: () => onApply({ assigneeId: m.id }) })), { label: t.list.unassigned, onSelect: () => onApply({ assigneeId: null }) }]}
      />
      <Button variant="ghost" size="sm" onClick={onClear}>{t.list.clearSelection}</Button>
    </div>
  );
}
