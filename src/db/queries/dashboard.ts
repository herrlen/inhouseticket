import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// Dashboard figures (KONZEPT §2.6). Plain SQL with explicit aliases – every query is scoped by
// workspace_id and, for the project dashboard, by project_id. Archived projects are excluded.

export type WorkloadRow = { userId: string; name: string; image: string | null; open: number; score: number; overdue: number };
export type ProjectHealthRow = { projectId: string; key: string; name: string; color: string; open: number; active: number; done: number; overdue: number };
export type ThroughputRow = { week: string; done: number };
export type DueDayRow = { day: string; count: number };
export type OverdueTicket = { id: string; key: string; title: string; projectKey: string; dueDate: string; assigneeName: string | null };

export type Dashboard = {
  workload: WorkloadRow[];
  health: ProjectHealthRow[];
  throughput: ThroughputRow[];
  dueDays: DueDayRow[];
  overdue: OverdueTicket[];
  threshold: number;
};

/** Priority weights: Dringend 4, Hoch 3, Mittel 2, Niedrig 1, Keine counts as Niedrig. */
const WEIGHT = sql.raw(`case t.priority when 4 then 4 when 3 then 3 when 2 then 2 else 1 end`);

export async function getDashboard(workspaceId: string, opts: { projectId?: string; today: string }): Promise<Dashboard> {
  const projectFilter = opts.projectId ? sql`and t.project_id = ${opts.projectId}` : sql``;
  const projectFilterP = opts.projectId ? sql`and p.id = ${opts.projectId}` : sql``;
  const today = opts.today;

  const [workload, health, throughput, dueDays, overdue, ws] = await Promise.all([
    db.execute<{ user_id: string; name: string; image: string | null; open: string; score: string; overdue: string }>(sql`
      select u.id as user_id, u.name, u.image,
        count(t.id) as open,
        coalesce(sum(${WEIGHT}), 0) as score,
        count(t.id) filter (where t.due_at < ${today}::date) as overdue
      from membership m
      join "user" u on u.id = m.user_id
      left join ticket t on t.assignee_id = u.id and t.workspace_id = m.workspace_id ${projectFilter}
        and exists (select 1 from status s where s.id = t.status_id and s.category <> 'done')
        and exists (select 1 from project p where p.id = t.project_id and p.archived_at is null)
      where m.workspace_id = ${workspaceId} and m.status = 'active'
      group by u.id, u.name, u.image
      order by score desc, u.name asc`),
    db.execute<{ project_id: string; key: string; name: string; color: string; open: string; active: string; done: string; overdue: string }>(sql`
      select p.id as project_id, p.key, p.name, p.color,
        count(t.id) filter (where s.category = 'open') as open,
        count(t.id) filter (where s.category = 'active') as active,
        count(t.id) filter (where s.category = 'done') as done,
        count(t.id) filter (where s.category <> 'done' and t.due_at < ${today}::date) as overdue
      from project p
      left join ticket t on t.project_id = p.id and t.workspace_id = p.workspace_id
      left join status s on s.id = t.status_id
      where p.workspace_id = ${workspaceId} and p.archived_at is null ${projectFilterP}
      group by p.id, p.key, p.name, p.color, p.sort
      order by p.sort collate "C"`),
    db.execute<{ week: string; done: string }>(sql`
      with weeks as (
        select generate_series(date_trunc('week', ${today}::date) - interval '7 weeks', date_trunc('week', ${today}::date), interval '1 week')::date as week
      )
      select to_char(w.week, 'YYYY-MM-DD') as week, count(t.id) as done
      from weeks w
      left join ticket t on t.workspace_id = ${workspaceId} ${projectFilter}
        and t.completed_at is not null
        and date_trunc('week', t.completed_at at time zone 'Europe/Berlin')::date = w.week
        and exists (select 1 from status s where s.id = t.status_id and s.category = 'done')
      group by w.week
      order by w.week`),
    db.execute<{ day: string; count: string }>(sql`
      with days as (select generate_series(${today}::date, ${today}::date + 13, interval '1 day')::date as day)
      select to_char(d.day, 'YYYY-MM-DD') as day, count(t.id) as count
      from days d
      left join ticket t on t.workspace_id = ${workspaceId} ${projectFilter}
        and (t.due_at at time zone 'UTC')::date = d.day
        and exists (select 1 from status s where s.id = t.status_id and s.category <> 'done')
        and exists (select 1 from project p where p.id = t.project_id and p.archived_at is null)
      group by d.day
      order by d.day`),
    db.execute<{ id: string; number: number; title: string; project_key: string; due: string; assignee_name: string | null }>(sql`
      select t.id, t.number, t.title, p.key as project_key, to_char(t.due_at at time zone 'UTC', 'YYYY-MM-DD') as due, u.name as assignee_name
      from ticket t
      join project p on p.id = t.project_id and p.archived_at is null
      join status s on s.id = t.status_id and s.category <> 'done'
      left join "user" u on u.id = t.assignee_id
      where t.workspace_id = ${workspaceId} ${projectFilter} and t.due_at < ${today}::date
      order by t.due_at asc, t.priority desc
      limit 10`),
    db.execute<{ workload_threshold: number }>(sql`select workload_threshold from workspace where id = ${workspaceId}`),
  ]);

  return {
    workload: workload.map((r) => ({ userId: r.user_id, name: r.name, image: r.image, open: Number(r.open), score: Number(r.score), overdue: Number(r.overdue) })),
    health: health.map((r) => ({ projectId: r.project_id, key: r.key, name: r.name, color: r.color, open: Number(r.open), active: Number(r.active), done: Number(r.done), overdue: Number(r.overdue) })),
    throughput: throughput.map((r) => ({ week: r.week, done: Number(r.done) })),
    dueDays: dueDays.map((r) => ({ day: r.day, count: Number(r.count) })),
    overdue: overdue.map((r) => ({ id: r.id, key: `${r.project_key}-${r.number}`, title: r.title, projectKey: r.project_key, dueDate: r.due, assigneeName: r.assignee_name })),
    threshold: Number(ws[0]?.workload_threshold ?? 12),
  };
}

export type LoadLevel = "ok" | "high" | "over";

/** Traffic light: from the threshold on "over", from 75 % "high". */
export function loadLevel(score: number, threshold: number): LoadLevel {
  if (score >= threshold) return "over";
  if (score >= Math.ceil(threshold * 0.75)) return "high";
  return "ok";
}
