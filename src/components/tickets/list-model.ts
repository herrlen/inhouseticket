import { compareKeys } from "@/lib/fractional";
import type { Messages } from "@/lib/i18n/de";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";
import { intlLocale, type Locale } from "@/lib/i18n/locale";

// Pure list logic (unit-tested): grouping, sorting, due-date buckets.

export type StatusOption = { id: string; name: string; color: string; category: "open" | "active" | "done"; sort: string; wipLimit?: number | null };
export type ListTicket = {
  id: string;
  number: number;
  title: string;
  statusId: string;
  priority: number;
  assigneeId: string | null;
  dueDate: string | null;
  sort: string;
  createdAt: string;
};
export type GroupBy = "status" | "priority" | "assignee" | "due" | "none";
export type SortBy = "manual" | "priority" | "due" | "created" | "number";
export type Group<T> = { key: string; label: string; color?: string; tickets: T[] };

export const PRIORITY_KEYS = ["none", "low", "medium", "high", "urgent"] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];
export const priorityKey = (p: number): PriorityKey => PRIORITY_KEYS[p] ?? "none";

/** Today's date in Europe/Berlin as "YYYY-MM-DD". */
export function todayInBerlin(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

/** "Diese Woche" = until Sunday of the current ISO week. */
export function dueBucket(due: string | null, today: string, done = false): DueBucket {
  if (!due) return "none";
  if (due < today) return done ? "later" : "overdue";
  if (due === today) return "today";
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return due <= addDays(today, 6 - weekday) ? "week" : "later";
}

export function sortTickets<T extends ListTicket>(tickets: readonly T[], sortBy: SortBy): T[] {
  const list = [...tickets];
  const byManual = (a: T, b: T) => compareKeys(a.sort, b.sort);
  switch (sortBy) {
    case "manual":
      return list.sort(byManual);
    case "priority":
      return list.sort((a, b) => b.priority - a.priority || byManual(a, b));
    case "due":
      // Tickets without a due date go last.
      return list.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byManual(a, b));
    case "created":
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "number":
      return list.sort((a, b) => b.number - a.number);
  }
}

export function groupTickets<T extends ListTicket>(
  tickets: readonly T[],
  opts: { groupBy: GroupBy; sortBy: SortBy; statuses: StatusOption[]; members: Array<{ id: string; name: string }>; today: string; t?: Pick<Messages, "list" | "priority"> },
): Group<T>[] {
  const t = opts.t ?? { list: deList, priority: dePriority };
  const sorted = sortTickets(tickets, opts.sortBy);
  const doneIds = new Set(opts.statuses.filter((s) => s.category === "done").map((s) => s.id));

  const make = (defs: Array<{ key: string; label: string; color?: string; match: (t: T) => boolean }>, keepEmpty: boolean) =>
    defs
      .map((d) => ({ key: d.key, label: d.label, color: d.color, tickets: sorted.filter(d.match) }))
      .filter((g) => keepEmpty || g.tickets.length > 0);

  switch (opts.groupBy) {
    case "none":
      return [{ key: "all", label: t.list.all, tickets: sorted }];
    case "status":
      // All statuses stay visible (they are the workflow), even when empty.
      return make(
        [...opts.statuses].sort((a, b) => compareKeys(a.sort, b.sort)).map((s) => ({ key: s.id, label: s.name, color: s.color, match: (t: T) => t.statusId === s.id })),
        true,
      );
    case "priority":
      return make(
        [4, 3, 2, 1, 0].map((p) => ({ key: `p${p}`, label: t.priority[priorityKey(p)], match: (t: T) => t.priority === p })),
        false,
      );
    case "assignee":
      return make(
        [
          ...opts.members.map((m) => ({ key: m.id, label: m.name, match: (t: T) => t.assigneeId === m.id })),
          { key: "none", label: t.list.unassigned, match: (t: T) => !t.assigneeId || !opts.members.some((m) => m.id === t.assigneeId) },
        ],
        false,
      );
    case "due":
      return make(
        (["overdue", "today", "week", "later", "none"] as const).map((b) => ({
          key: b,
          label: t.list.due[b],
          match: (t: T) => dueBucket(t.dueDate, opts.today, doneIds.has(t.statusId)) === b,
        })),
        false,
      );
  }
}

const dueFmt: Record<Locale, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat(intlLocale("de"), { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat(intlLocale("en"), { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
};

/** "2026-10-09" → "09.10." (en: "09/10"; date-only, no timezone shift). Usable on server and client. */
export function formatDue(date: string | null, locale: Locale = "de"): string {
  return date ? dueFmt[locale].format(new Date(`${date}T00:00:00Z`)) : "";
}
