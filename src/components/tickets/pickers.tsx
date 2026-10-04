"use client";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { useProjectInfo } from "./context";
import { priorityKey } from "./list-model";

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
      triggerLabel={de.ticket.statusOf(ticketLabel, current?.name ?? "–")}
      triggerClassName={pickerTrigger}
      items={statuses.map((s) => ({ label: s.name, icon: <StatusDot color={s.color} />, onSelect: () => s.id !== value && onChange(s.id) }))}
    />
  );
}

export function PriorityPicker({ value, onChange, ticketLabel, compact }: { value: number; onChange: (p: number) => void; ticketLabel: string; compact?: boolean }) {
  const label = de.priority[priorityKey(value)];
  return (
    <Dropdown
      trigger={
        <>
          <PriorityIcon priority={value} />
          {compact ? null : <span className={cn("truncate", value === 0 && "text-muted")}>{label}</span>}
        </>
      }
      triggerLabel={de.ticket.priorityOf(ticketLabel, label)}
      triggerClassName={pickerTrigger}
      items={[4, 3, 2, 1, 0].map((p) => ({ label: de.priority[priorityKey(p)], icon: <PriorityIcon priority={p} />, onSelect: () => p !== value && onChange(p) }))}
    />
  );
}

export function AssigneePicker({ value, onChange, ticketLabel, compact }: { value: string | null; onChange: (userId: string | null) => void; ticketLabel: string; compact?: boolean }) {
  const { members, currentUserId } = useProjectInfo();
  const current = members.find((m) => m.id === value) ?? null;
  const ordered = [...members].sort((a, b) => (a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : 0));
  return (
    <Dropdown
      trigger={
        <>
          <Avatar user={current} size="sm" />
          {compact ? null : <span className={cn("truncate", !current && "text-muted")}>{current?.name ?? de.list.unassigned}</span>}
        </>
      }
      triggerLabel={de.ticket.assigneeOf(ticketLabel, current?.name ?? de.list.unassigned)}
      triggerClassName={pickerTrigger}
      items={[
        ...ordered.map((m) => ({
          label: m.id === currentUserId ? `${m.name} (${de.members.you})` : m.name,
          icon: <Avatar user={m} size="sm" />,
          onSelect: () => m.id !== value && onChange(m.id),
        })),
        { label: de.list.unassigned, icon: <Avatar user={null} size="sm" />, onSelect: () => value !== null && onChange(null) },
      ]}
    />
  );
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

/** Native date input (keyboard + screen reader friendly), styled to match. */
export function DueDateInput({ value, onChange, ticketLabel, overdue }: { value: string | null; onChange: (d: string | null) => void; ticketLabel: string; overdue?: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      <input
        type="date"
        value={value ?? ""}
        aria-label={de.ticket.dueOf(ticketLabel)}
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
      {value && overdue ? <span className="sr-only">{de.list.due.overdue}</span> : null}
    </span>
  );
}

export function formatDue(date: string | null): string {
  return date ? dateFmt.format(new Date(`${date}T00:00:00Z`)) : "";
}
