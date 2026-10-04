import type { Metadata } from "next";
import Link from "next/link";
import {
  ChartCard,
  DueHeatmap,
  DueTable,
  HealthChart,
  HealthTable,
  OverdueList,
  StatTile,
  ThroughputChart,
  ThroughputTable,
  WorkloadChart,
  WorkloadTable,
} from "@/components/dashboard/charts";
import { todayInBerlin } from "@/components/tickets/list-model";
import { Button } from "@/components/ui/button";
import { getDashboard, loadLevel } from "@/db/queries/dashboard";
import { findProjectByKey } from "@/db/queries/projects";
import { hasRole, requireMember } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { de } from "@/lib/i18n/de";
import { setWorkloadThresholdAction } from "../actions";
import { listProjectsWithTickets } from "@/db/queries/projects";

export const metadata: Metadata = { title: "Dashboard" };

type Props = { params: Promise<{ workspace: string }>; searchParams: Promise<{ project?: string }> };

export default async function DashboardPage({ params, searchParams }: Props) {
  const { workspace: slug } = await params;
  const { project: projectKey } = await searchParams;
  const ctx = await requireMember({ slug });
  const project = projectKey ? await findProjectByKey(ctx.workspace.id, projectKey) : null;
  const today = todayInBerlin();
  const [d, projects] = await Promise.all([
    getDashboard(ctx.workspace.id, { projectId: project && !project.archivedAt ? project.id : undefined, today }),
    listProjectsWithTickets(ctx.workspace.id),
  ]);

  const base = `/${slug}`;
  const scope = project ? `?project=${project.key}` : "";
  const openTotal = d.health.reduce((n, h) => n + h.open + h.active, 0);
  const overdueTotal = d.health.reduce((n, h) => n + h.overdue, 0);
  const doneThisWeek = d.throughput.at(-1)?.done ?? 0;
  const dueSoon = d.dueDays.slice(0, 7).reduce((n, x) => n + x.count, 0);
  const tasksHref = (userId: string, extra = "") => `${base}/me?user=${userId}${project ? `&project=${project.key}` : ""}${extra}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{project ? de.dashboard.titleProject(project.name) : de.dashboard.title}</h1>
        <nav aria-label={de.dashboard.scope} className="ml-auto flex flex-wrap gap-1.5">
          <Link href={`${base}/dashboard`} aria-current={!project ? "page" : undefined} className={cn("rounded-full border px-2.5 py-0.5 text-[13px]", !project ? "border-accent bg-accent/10" : "border-border text-muted hover:text-text")}>
            {de.dashboard.allProjects}
          </Link>
          {projects.map((p) => (
            <Link key={p.id} href={`${base}/dashboard?project=${p.key}`} aria-current={project?.id === p.id ? "page" : undefined} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px]", project?.id === p.id ? "border-accent bg-accent/10" : "border-border text-muted hover:text-text")}>
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={de.dashboard.statOpen} value={openTotal} href={project ? `${base}/p/${project.key}` : undefined} />
        <StatTile label={de.dashboard.statOverdue} value={overdueTotal} tone="critical" href={project ? `${base}/p/${project.key}?due=overdue` : undefined} />
        <StatTile label={de.dashboard.statDoneWeek} value={doneThisWeek} />
        <StatTile label={de.dashboard.statDueSoon} value={dueSoon} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title={de.dashboard.workload} table={<WorkloadTable rows={d.workload} />}>
          <p className="-mt-2 text-xs text-muted">{de.dashboard.workloadHint(d.threshold)}</p>
          <WorkloadChart rows={d.workload} threshold={d.threshold} level={(s) => loadLevel(s, d.threshold)} href={(userId) => tasksHref(userId)} />
          {hasRole(ctx, "admin") ? (
            <form action={setWorkloadThresholdAction} className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted">
              <input type="hidden" name="workspaceId" value={ctx.workspace.id} />
              <input type="hidden" name="redirectTo" value={`${base}/dashboard${scope}`} />
              <label htmlFor="threshold">{de.dashboard.thresholdLabel}</label>
              <input id="threshold" name="threshold" type="number" min={1} max={999} defaultValue={d.threshold} className="h-7 w-16 rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px] text-text" />
              <Button type="submit" size="sm">{de.common.save}</Button>
            </form>
          ) : null}
        </ChartCard>

        <ChartCard title={de.dashboard.health} table={<HealthTable rows={d.health} />}>
          <HealthChart rows={d.health} href={(key) => `${base}/p/${key}`} />
        </ChartCard>

        <ChartCard title={de.dashboard.throughput} table={<ThroughputTable rows={d.throughput} />}>
          <ThroughputChart rows={d.throughput} />
        </ChartCard>

        <ChartCard title={de.dashboard.dueNext} table={<DueTable rows={d.dueDays} />}>
          <DueHeatmap rows={d.dueDays} />
        </ChartCard>

        <ChartCard title={de.dashboard.overdue} className="lg:col-span-2">
          <OverdueList rows={d.overdue} href={(t) => `${base}/p/${t.projectKey}?t=${t.key}`} />
        </ChartCard>
      </div>
    </div>
  );
}
