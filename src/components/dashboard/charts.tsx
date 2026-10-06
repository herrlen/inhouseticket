import Link from "next/link";
import type { ReactNode } from "react";
import type { DueDayRow, LoadLevel, OverdueTicket, ProjectHealthRow, ThroughputRow, WorkloadRow } from "@/db/queries/dashboard";
import { Avatar } from "@/components/ui/avatar";
import { formatDue } from "@/components/tickets/list-model";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";

// Dashboard charts without a chart library: thin marks, one hue per magnitude, text in text tokens,
// hover/focus tooltips on every mark and a table view for each figure (dataviz guidance).

/** Mark tooltip: shows on hover and keyboard focus of its parent (.group). */
function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-[var(--radius-badge)] bg-text px-2 py-1 text-xs whitespace-nowrap text-bg shadow-float group-hover:visible group-focus-visible:visible"
    >
      {children}
    </span>
  );
}

export function ChartCard({ title, href, linkLabel, children, table, className }: { title: string; href?: string; linkLabel?: string; children: ReactNode; table?: ReactNode; className?: string }) {
  return (
    <figure className={cn("flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4", className)}>
      <figcaption className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {href ? (
          <Link href={href} className="text-xs text-muted hover:text-text hover:underline">
            {linkLabel ?? de.dashboard.open}
          </Link>
        ) : null}
      </figcaption>
      {children}
      {table ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted hover:text-text">{de.dashboard.asTable}</summary>
          <div className="mt-2 overflow-x-auto">{table}</div>
        </details>
      ) : null}
    </figure>
  );
}

export function StatTile({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "critical" }) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("text-2xl font-semibold tabular-nums", tone === "critical" && value > 0 && "text-prio-urgent-ink")}>{value}</span>
    </>
  );
  const cls = "flex flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-4";
  return href ? <Link href={href} className={cn(cls, "hover:border-accent")}>{body}</Link> : <div className={cls}>{body}</div>;
}

const LEVEL: Record<LoadLevel, { icon: string; cls: string }> = {
  ok: { icon: "✓", cls: "text-status-done-ink" },
  high: { icon: "!", cls: "text-prio-high-ink" },
  over: { icon: "‼", cls: "text-prio-urgent-ink" },
};

/** Status pill: icon + label, never color alone. */
export function LoadPill({ level }: { level: LoadLevel }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-border px-1.5 text-[11px] font-medium", LEVEL[level].cls)}>
      <span aria-hidden>{LEVEL[level].icon}</span>
      {de.dashboard.level[level]}
    </span>
  );
}

export function WorkloadChart({ rows, threshold, level, href }: { rows: WorkloadRow[]; threshold: number; level: (score: number) => LoadLevel; href: (userId: string) => string }) {
  const max = Math.max(threshold * 1.25, ...rows.map((r) => r.score), 1);
  const thresholdPct = (threshold / max) * 100;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const lvl = level(r.score);
        return (
          <li key={r.userId}>
            <Link href={href(r.userId)} aria-label={de.dashboard.workloadLabel(r.name, r.score, r.open, r.overdue, de.dashboard.level[lvl])} className="group grid grid-cols-[8rem_1fr_auto] items-center gap-3 rounded-[var(--radius-badge)] px-1 py-0.5 hover:bg-bg">
              <span className="flex min-w-0 items-center gap-2 text-[13px]">
                <Avatar user={{ id: r.userId, name: r.name, image: r.image }} size="sm" />
                <span className="truncate">{r.name}</span>
              </span>
              <span className="relative h-3">
                <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-viz-bar" style={{ width: `${(r.score / max) * 100}%`, minWidth: r.score ? 3 : 0 }} />
                <span aria-hidden className="absolute -inset-y-1 w-px bg-text/40" style={{ left: `${thresholdPct}%` }} />
                <Tip>{de.dashboard.workloadTip(r.score, r.open, r.overdue)}</Tip>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
                {r.score} <LoadPill level={lvl} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function WorkloadTable({ rows }: { rows: WorkloadRow[] }) {
  return (
    <table className="w-full text-left">
      <thead className="text-muted">
        <tr><th scope="col">{de.dashboard.person}</th><th scope="col">{de.dashboard.points}</th><th scope="col">{de.dashboard.openCol}</th><th scope="col">{de.dashboard.overdueCol}</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.userId}><td>{r.name}</td><td>{r.score}</td><td>{r.open}</td><td>{r.overdue}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

const SEGMENTS = [
  { key: "open", cls: "bg-viz-open" },
  { key: "active", cls: "bg-viz-active" },
  { key: "done", cls: "bg-viz-done" },
] as const;

export function HealthChart({ rows, href }: { rows: ProjectHealthRow[]; href: (key: string) => string }) {
  return (
    <div className="flex flex-col gap-3">
      <ul aria-hidden className="flex gap-3 text-xs text-muted">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", s.cls)} />{de.dashboard.segments[s.key]}</li>
        ))}
      </ul>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const total = r.open + r.active + r.done;
          const notDone = r.open + r.active;
          const share = notDone ? Math.round((r.overdue / notDone) * 100) : 0;
          return (
            <li key={r.projectId}>
              <Link href={href(r.key)} aria-label={de.dashboard.healthLabel(r.name, r.open, r.active, r.done, r.overdue)} className="flex flex-col gap-1 rounded-[var(--radius-badge)] px-1 py-0.5 hover:bg-bg">
                <span className="flex items-center gap-2 text-[13px]">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className={cn("text-xs tabular-nums", r.overdue ? "text-prio-urgent-ink" : "text-muted")}>
                    {r.overdue ? de.dashboard.overdueShare(r.overdue, share) : de.dashboard.tickets(total)}
                  </span>
                </span>
                <span className="flex h-2.5 gap-[2px]">
                  {total === 0 ? <span className="h-full w-full rounded-[4px] bg-border" /> : null}
                  {SEGMENTS.map((s) => {
                    const v = r[s.key];
                    return v ? (
                      <span key={s.key} className={cn("group relative h-full first:rounded-l-[4px] last:rounded-r-[4px]", s.cls)} style={{ flexGrow: v }}>
                        <Tip>{de.dashboard.segmentTip(de.dashboard.segments[s.key], v)}</Tip>
                      </span>
                    ) : null;
                  })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function HealthTable({ rows }: { rows: ProjectHealthRow[] }) {
  return (
    <table className="w-full text-left">
      <thead className="text-muted">
        <tr><th scope="col">{de.dashboard.project}</th><th scope="col">{de.dashboard.segments.open}</th><th scope="col">{de.dashboard.segments.active}</th><th scope="col">{de.dashboard.segments.done}</th><th scope="col">{de.dashboard.overdueCol}</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.projectId}><td>{r.name}</td><td>{r.open}</td><td>{r.active}</td><td>{r.done}</td><td>{r.overdue}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/** ISO calendar week number. */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function ThroughputChart({ rows }: { rows: ThroughputRow[] }) {
  const max = Math.max(...rows.map((r) => r.done), 1);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-28 items-end gap-2 border-b border-border">
        {rows.map((r) => (
          <span key={r.week} role="img" tabIndex={0} aria-label={de.dashboard.throughputLabel(isoWeek(r.week), r.done)} className="group relative flex h-full flex-1 items-end focus-visible:outline-offset-2">
            <span className="w-full rounded-t-[4px] bg-viz-bar" style={{ height: `${(r.done / max) * 100}%`, minHeight: r.done ? 3 : 0 }} />
            <Tip>{de.dashboard.throughputLabel(isoWeek(r.week), r.done)}</Tip>
          </span>
        ))}
      </div>
      <div aria-hidden className="flex gap-2 text-center text-[11px] text-muted">
        {rows.map((r) => (
          <span key={r.week} className="flex-1">KW {isoWeek(r.week)}</span>
        ))}
      </div>
    </div>
  );
}

export function ThroughputTable({ rows }: { rows: ThroughputRow[] }) {
  return (
    <table className="w-full text-left">
      <thead className="text-muted"><tr><th scope="col">{de.dashboard.week}</th><th scope="col">{de.dashboard.doneCol}</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.week}><td>KW {isoWeek(r.week)}</td><td>{r.done}</td></tr>)}</tbody>
    </table>
  );
}

const HEAT = ["bg-heat-1 text-heat-ink-1", "bg-heat-2 text-heat-ink-2", "bg-heat-3 text-heat-ink-3", "bg-heat-4 text-heat-ink-4", "bg-heat-5 text-heat-ink-5"] as const;
const weekdayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });

export function DueHeatmap({ rows }: { rows: DueDayRow[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  const bin = (n: number) => HEAT[Math.min(HEAT.length - 1, Math.ceil((n / max) * HEAT.length) - 1)]!;
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {rows.map((r) => {
        const d = new Date(`${r.day}T00:00:00Z`);
        const label = `${weekdayFmt.format(d)} ${formatDue(r.day)}`;
        return (
          <span
            key={r.day}
            role="img"
            tabIndex={0}
            aria-label={de.dashboard.dueLabel(label, r.count)}
            className={cn(
              "group relative flex h-12 flex-col items-center justify-center rounded-[4px] text-[11px]",
              r.count ? bin(r.count) : "border border-border text-muted",
            )}
          >
            <span aria-hidden>{weekdayFmt.format(d)}</span>
            <span aria-hidden className="font-semibold tabular-nums">{r.count || "–"}</span>
            <Tip>{de.dashboard.dueLabel(label, r.count)}</Tip>
          </span>
        );
      })}
    </div>
  );
}

export function DueTable({ rows }: { rows: DueDayRow[] }) {
  return (
    <table className="w-full text-left">
      <thead className="text-muted"><tr><th scope="col">{de.dashboard.day}</th><th scope="col">{de.dashboard.dueCol}</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.day}><td>{formatDue(r.day)}</td><td>{r.count}</td></tr>)}</tbody>
    </table>
  );
}

export function OverdueList({ rows, href }: { rows: OverdueTicket[]; href: (t: OverdueTicket) => string }) {
  if (rows.length === 0) return <p className="text-[13px] text-muted">{de.dashboard.noOverdue}</p>;
  return (
    <ul className="flex flex-col">
      {rows.map((t) => (
        <li key={t.id}>
          <Link href={href(t)} className="flex items-center gap-3 rounded-[var(--radius-badge)] px-1 py-1.5 text-[13px] hover:bg-bg">
            <span className="w-16 shrink-0 font-mono text-xs text-muted">{t.key}</span>
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            <span className="text-xs text-muted">{t.assigneeName ?? de.list.unassigned}</span>
            <span className="w-12 text-right text-xs font-medium text-prio-urgent-ink tabular-nums">{formatDue(t.dueDate)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
