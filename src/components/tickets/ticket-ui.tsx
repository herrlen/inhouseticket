"use client";

// Building blocks of the redesigned ticket views (Redesign X2, the same as emuchat's
// apps/app/src/components/ticket-ui.tsx): status labels in fixed meaning colors, priority flags,
// relative due dates and people. Text always carries the meaning; color is an extra cue.
import { Avatar } from "@/components/ui/avatar";
import { Person, Priority } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "@/lib/i18n/client";
import { intlLocale, type Locale } from "@/lib/i18n/locale";
import { paletteColorFromHex, type PaletteColor } from "@/lib/palette";
import { priorityKey, type StatusOption } from "./list-model";
import deList from "@/lib/i18n/de/list";
import dePriority from "@/lib/i18n/de/priority";

const MESSAGES = { list: deList, priority: dePriority };

// Literal class names (Tailwind only generates what it finds in the source).
const TONE = {
  open: "bg-status-open-bg text-status-open-fg",
  active: "bg-status-progress text-status-fg",
  review: "bg-status-review text-status-fg",
  done: "bg-status-done text-status-fg",
} as const;

// A status in one of the other palette colors keeps it: palette fill with its readable text color.
const PALETTE_TONE: Record<PaletteColor, string> = {
  coral: "bg-p-coral text-p-coral-on",
  orange: "bg-p-orange text-p-orange-on",
  sun: "bg-p-sun text-p-sun-on",
  lime: "bg-p-lime text-p-lime-on",
  mint: "bg-p-mint text-p-mint-on",
  turquoise: "bg-p-turquoise text-p-turquoise-on",
  blue: "bg-p-blue text-p-blue-on",
  indigo: "bg-p-indigo text-p-indigo-on",
  violet: "bg-status-review text-status-fg",
  pink: "bg-p-pink text-p-pink-on",
  berry: "bg-p-berry text-p-berry-on",
  slate: "bg-p-slate text-p-slate-on",
};

// The four default status colors (project-templates.ts) map onto the meaning colors.
const DEFAULT_COLOR_TONE: Record<string, keyof typeof TONE> = { "#78716C": "open", "#3B82F6": "active", "#9B5DE5": "review", "#22C55E": "done" };

/**
 * Label colors of a status: the default colors become the fixed meaning colors (Offen beige,
 * In Arbeit blue, Review violet, Erledigt green); other palette colors stay. Unknown colors
 * (e.g. imported) follow the kind, a status named like a review is violet.
 */
export function statusTone(status: Pick<StatusOption, "name" | "color" | "category">): string {
  const hex = status.color.toUpperCase();
  const known = DEFAULT_COLOR_TONE[hex];
  if (known) return TONE[known];
  const palette = paletteColorFromHex(hex);
  if (palette) return PALETTE_TONE[palette];
  if (status.category === "active" && /review|prüf|abnahme/i.test(status.name)) return TONE.review;
  return TONE[status.category];
}

/** A status as a small uppercase label (IN ARBEIT, OFFEN …). */
export function StatusLabel({ status, className }: { status: Pick<StatusOption, "name" | "color" | "category">; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 max-w-full items-center truncate rounded px-1.5 text-[11px] font-bold tracking-wide whitespace-nowrap uppercase", statusTone(status), className)}>
      {status.name}
    </span>
  );
}

const PRIORITY_TONE = ["text-muted", "text-prio-low-ink", "text-prio-medium-ink", "text-prio-high-ink", "text-prio-urgent-ink"] as const;

/** Flag in the priority color (decorative; the word or an sr-only text carries the meaning). */
export function PriorityFlag({ value, className }: { value: number; className?: string }) {
  if (!value) return <span aria-hidden className={cn("inline-block w-3.5 text-center text-muted", className)}>–</span>;
  return <Priority size={14} className={cn("shrink-0", PRIORITY_TONE[value], className)} />;
}

/** Flag and word (Dringend, Hoch, Mittel, Niedrig); "–" for none unless `showNone`. */
export function PriorityValue({ value, showNone = false }: { value: number; showNone?: boolean }) {
  const t = useT(MESSAGES);
  if (!value && !showNone) {
    return (
      <span className="text-muted">
        <span aria-hidden>–</span>
        <span className="sr-only">{t.priority.none}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", PRIORITY_TONE[value] ?? "text-muted")}>
      <PriorityFlag value={value} />
      <span className="truncate">{t.priority[priorityKey(value)]}</span>
    </span>
  );
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const FORMATS = new Map<string, Intl.DateTimeFormat>();
function format(locale: Locale, withYear: boolean) {
  const key = `${locale}-${withYear}`;
  let f = FORMATS.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
    FORMATS.set(key, f);
  }
  return f;
}

/** "Heute", "Morgen", "Gestern", else "18. Nov." (with the year when not this year). */
export function relativeDue(date: string, today: string, locale: Locale, words: { today: string; tomorrow: string; yesterday: string }): string {
  if (date === today) return words.today;
  if (date === addDays(today, 1)) return words.tomorrow;
  if (date === addDays(today, -1)) return words.yesterday;
  return format(locale, date.slice(0, 4) !== today.slice(0, 4)).format(new Date(`${date}T00:00:00Z`));
}

/** A due date; due today or overdue (and not done) in the danger color. */
export function DueValue({ date, today, done }: { date: string | null; today: string; done: boolean }) {
  const t = useT(MESSAGES);
  const locale = useLocale();
  if (!date) return <span className="text-muted">–</span>;
  const urgent = !done && date <= today;
  return (
    <span className={urgent ? "font-medium text-prio-urgent-ink" : "text-secondary"}>
      {date < today && !done ? <span className="sr-only">{t.list.due.overdue}: </span> : null}
      {relativeDue(date, today, locale, t.list.dueRelative)}
    </span>
  );
}

/** A person with avatar and name, or the person icon with "Nicht zugewiesen". */
export function PersonValue({ person, compact = false }: { person: { id: string; name: string; image?: string | null } | null; compact?: boolean }) {
  const t = useT(MESSAGES);
  if (!person) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
        <Person size={14} className="shrink-0" />
        {compact ? <span className="sr-only">{t.list.unassigned}</span> : <span className="truncate">{t.list.unassigned}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-secondary">
      <Avatar user={person} size="sm" />
      {compact ? null : <span className="truncate">{person.name}</span>}
    </span>
  );
}
