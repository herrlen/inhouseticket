"use client";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { useProjectInfo } from "./context";
import { priorityKey } from "./list-model";
import deList from "@/lib/i18n/de/list";
import deMembers from "@/lib/i18n/de/members";
import dePriority from "@/lib/i18n/de/priority";
import deTicket from "@/lib/i18n/de/ticket";

const MESSAGES = { list: deList, members: deMembers, priority: dePriority, ticket: deTicket };

const pickerTrigger =
  "inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--radius-badge)] px-1.5 text-[13px] hover:bg-bg aria-expanded:bg-bg";

const prioText = ["text-prio-none-ink", "text-prio-low-ink", "text-prio-medium-ink", "text-prio-high-ink", "text-prio-urgent-ink"] as const;

/** ▲▲ filled / ▲▲ / ▲ / ▼ / – (KONZEPT §5.2) – icon plus text, never color alone. */
export function PriorityIcon({ priority }: { priority: number }) {
  const glyph = ["–", "▼", "▲", "▲▲", "▲▲"][priority] ?? "–";
  return (
    <span aria-hidden className={cn("inline-block w-5 text-center text-[11px] leading-none", prioText[priority] ?? prioText[0], priority === 4 && "font-black")}>
      {glyph}
    </span>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color }} />;
}

export function StatusPicker({ value, onChange, ticketLabel }: { value: string; onChange: (statusId: string) => void; ticketLabel: string }) {
  const t = useT(MESSAGES);
  const { statuses } = useProjectInfo();
  const current = statuses.find((s) => s.id === value);
  return (
    <Dropdown
      trigger={
        <>
          {current ? <StatusDot color={current.color} /> : null}
          <span className="truncate">{current?.name ?? "–"}</span>
        </>
      }
      triggerLabel={t.ticket.statusOf(ticketLabel, current?.name ?? "–")}
      triggerClassName={pickerTrigger}
      items={statuses.map((s) => ({ label: s.name, icon: <StatusDot color={s.color} />, onSelect: () => s.id !== value && onChange(s.id) }))}
    />
  );
}

export function PriorityPicker({ value, onChange, ticketLabel, compact }: { value: number; onChange: (p: number) => void; ticketLabel: string; compact?: boolean }) {
  const t = useT(MESSAGES);
  const label = t.priority[priorityKey(value)];
  return (
    <Dropdown
      trigger={
        <>
          <PriorityIcon priority={value} />
          {compact ? null : <span className={cn("truncate", value === 0 && "text-muted")}>{label}</span>}
        </>
      }
      triggerLabel={t.ticket.priorityOf(ticketLabel, label)}
      triggerClassName={pickerTrigger}
      items={[4, 3, 2, 1, 0].map((p) => ({ label: t.priority[priorityKey(p)], icon: <PriorityIcon priority={p} />, onSelect: () => p !== value && onChange(p) }))}
    />
  );
}

export function AssigneePicker({ value, onChange, ticketLabel, compact }: { value: string | null; onChange: (userId: string | null) => void; ticketLabel: string; compact?: boolean }) {
  const t = useT(MESSAGES);
  const { members, currentUserId } = useProjectInfo();
  const current = members.find((m) => m.id === value) ?? null;
  const ordered = [...members].sort((a, b) => (a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0));
  return (
    // data-assignee-picker: target of the "A" shortcut in the ticket detail (not the localized label).
    <span data-assignee-picker className="contents">
    <Dropdown
      trigger={
        <>
          <Avatar user={current} size="sm" />
          {compact ? null : <span className={cn("truncate", !current && "text-muted")}>{current?.name ?? t.list.unassigned}</span>}
        </>
      }
      triggerLabel={t.ticket.assigneeOf(ticketLabel, current?.name ?? t.list.unassigned)}
      triggerClassName={pickerTrigger}
      items={[
        ...ordered.map((m) => ({
          label: m.id === currentUserId ? `${m.name} (${t.members.you})` : m.name,
          icon: <Avatar user={m} size="sm" />,
          onSelect: () => m.id !== value && onChange(m.id),
        })),
        { label: t.list.unassigned, icon: <Avatar user={null} size="sm" />, onSelect: () => value !== null && onChange(null) },
      ]}
    />
    </span>
  );
}


/** Native date input (keyboard + screen reader friendly), styled to match. */
export function DueDateInput({ value, onChange, ticketLabel, overdue }: { value: string | null; onChange: (d: string | null) => void; ticketLabel: string; overdue?: boolean }) {
  const t = useT(MESSAGES);
  return (
    <span className="relative inline-flex items-center">
      <input
        type="date"
        value={value ?? ""}
        aria-label={t.ticket.dueOf(ticketLabel)}
        onChange={(e) => {
          const next = e.target.value || null;
          if (next !== value) onChange(next);
        }}
        className={cn(
          "h-7 w-[8.5rem] rounded-[var(--radius-badge)] bg-transparent px-1.5 text-[13px] hover:bg-bg",
          !value && "text-muted",
          overdue && "font-medium text-prio-urgent-ink",
        )}
      />
      {value && overdue ? <span className="sr-only">{t.list.due.overdue}</span> : null}
    </span>
  );
}

export { formatDue } from "./list-model";
