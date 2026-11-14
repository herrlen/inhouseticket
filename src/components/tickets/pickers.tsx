"use client";

import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "@/lib/i18n/client";
import { useProjectInfo } from "./context";
import { priorityKey, type StatusOption } from "./list-model";
import { PersonValue, PriorityFlag, PriorityValue, relativeDue, StatusLabel, statusTone } from "./ticket-ui";
import deList from "@/lib/i18n/de/list";
import deMembers from "@/lib/i18n/de/members";
import dePriority from "@/lib/i18n/de/priority";
import deTicket from "@/lib/i18n/de/ticket";

const MESSAGES = { list: deList, members: deMembers, priority: dePriority, ticket: deTicket };

// Borderless chips (Redesign X2): the value itself is the button, a click opens a small menu.
const pickerTrigger =
  "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-badge)] px-1.5 text-sm hover:bg-hover aria-expanded:bg-hover";

/** Priority flag (decorative) – kept under its old name for the filter, bulk bar and board. */
export function PriorityIcon({ priority }: { priority: number }) {
  return <PriorityFlag value={priority} />;
}

export function StatusDot({ color }: { color: string }) {
  return <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color }} />;
}

/** A small square in a status's label color (menus, where the name is the item text). */
export function StatusSwatch({ status }: { status: Pick<StatusOption, "name" | "color" | "category"> }) {
  return <span aria-hidden className={cn("block size-3 shrink-0 rounded-[3px]", statusTone(status))} />;
}

export function StatusPicker({ value, onChange, ticketLabel }: { value: string; onChange: (statusId: string) => void; ticketLabel: string }) {
  const t = useT(MESSAGES);
  const { statuses } = useProjectInfo();
  const current = statuses.find((s) => s.id === value);
  return (
    <Dropdown
      trigger={current ? <StatusLabel status={current} /> : <span className="text-muted">–</span>}
      triggerLabel={t.ticket.statusOf(ticketLabel, current?.name ?? "–")}
      triggerClassName={pickerTrigger}
      items={statuses.map((s) => ({ label: s.name, icon: <StatusSwatch status={s} />, onSelect: () => s.id !== value && onChange(s.id) }))}
    />
  );
}

export function PriorityPicker({ value, onChange, ticketLabel, compact }: { value: number; onChange: (p: number) => void; ticketLabel: string; compact?: boolean }) {
  const t = useT(MESSAGES);
  const label = t.priority[priorityKey(value)];
  return (
    <Dropdown
      trigger={compact ? <PriorityFlag value={value} /> : <PriorityValue value={value} />}
      triggerLabel={t.ticket.priorityOf(ticketLabel, label)}
      triggerClassName={pickerTrigger}
      items={[4, 3, 2, 1, 0].map((p) => ({ label: t.priority[priorityKey(p)], icon: <PriorityFlag value={p} />, onSelect: () => p !== value && onChange(p) }))}
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
      trigger={<PersonValue person={current} compact={compact} />}
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

/**
 * Due date as a chip: shows "Heute", "Morgen", "18. Nov." and turns into the native date field
 * (keyboard and screen reader friendly) while it has focus.
 */
export function DueDateInput({ value, onChange, ticketLabel, overdue, today, done }: { value: string | null; onChange: (d: string | null) => void; ticketLabel: string; overdue?: boolean; today: string; done?: boolean }) {
  const t = useT(MESSAGES);
  const locale = useLocale();
  // Due today or overdue (and not done) in the danger color, like emuchat.
  const urgent = Boolean(value) && (overdue || (value === today && !done));
  return (
    <span className="relative inline-flex h-7 w-[8.5rem] items-center rounded-[var(--radius-badge)] text-sm hover:bg-hover">
      <input
        type="date"
        value={value ?? ""}
        aria-label={t.ticket.dueOf(ticketLabel)}
        onChange={(e) => {
          const next = e.target.value || null;
          if (next !== value) onChange(next);
        }}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Not allowed everywhere – the focused field works as it is.
          }
        }}
        className={cn(
          "peer absolute inset-0 h-full w-full cursor-pointer rounded-[var(--radius-badge)] bg-transparent px-1.5 text-sm opacity-0 focus:cursor-text focus:bg-surface focus:opacity-100",
          !value && "text-muted",
          urgent && "font-medium text-prio-urgent-ink",
        )}
      />
      <span aria-hidden className={cn("pointer-events-none truncate px-1.5 peer-focus:invisible", !value ? "text-muted" : urgent ? "font-medium text-prio-urgent-ink" : "text-secondary")}>
        {value ? relativeDue(value, today, locale, t.list.dueRelative) : "–"}
      </span>
      {value && overdue ? <span className="sr-only">{t.list.due.overdue}</span> : null}
    </span>
  );
}

export { formatDue } from "./list-model";
