import type { Metadata } from "next";
import Link from "next/link";
import { dueBucket, formatDue, todayInBerlin, type DueBucket } from "@/components/tickets/list-model";
import { PriorityIcon } from "@/components/tickets/pickers";
import { listAssignableMembers, listMyTasks, type MyTask } from "@/db/queries/tickets";
import { requireMember } from "@/lib/authz";
import { cn } from "@/lib/cn";
import { getLocale, getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).me.title };
}

type Props = { params: Promise<{ workspace: string }>; searchParams: Promise<{ user?: string; project?: string }> };

const ORDER: DueBucket[] = ["overdue", "today", "week", "later", "none"];
const PRIORITY_KEYS = ["none", "low", "medium", "high", "urgent"] as const;

export default async function MyTasksPage({ params, searchParams }: Props) {
  const t = await getT();
  const { workspace: slug } = await params;
  const { user: userParam, project: projectKey } = await searchParams;
  const ctx = await requireMember({ slug });
  // ?user= shows someone else's open tickets (from the dashboard); only members of this workspace.
  const members = userParam && userParam !== ctx.user.id ? await listAssignableMembers(ctx.workspace.id) : [];
  const other = members.find((m) => m.id === userParam) ?? null;
  const all = await listMyTasks(ctx.workspace.id, other?.id ?? ctx.user.id);
  const tasks = projectKey ? all.filter((t) => t.projectKey === projectKey) : all;
  const today = todayInBerlin();
  const groups = ORDER.map((bucket) => ({ bucket, tasks: tasks.filter((t) => dueBucket(t.dueDate, today) === bucket) })).filter((g) => g.tasks.length > 0);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="mb-1 text-xl font-semibold">{other ? t.me.titleOf(other.name) : t.me.title}</h1>
      <p className="mb-6 text-muted">{tasks.length === 0 ? (other ? t.me.emptyOther : t.me.empty) : t.me.count(tasks.length)}</p>
      {groups.map((g) => (
        <section key={g.bucket} aria-labelledby={`me-${g.bucket}`} className="mb-6">
          <h2 id={`me-${g.bucket}`} className={cn("mb-2 text-[13px] font-semibold", g.bucket === "overdue" && "text-prio-urgent-ink")}>
            {t.list.due[g.bucket]} <span className="font-normal text-muted">{g.tasks.length}</span>
          </h2>
          <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} slug={slug} overdue={g.bucket === "overdue"} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function TaskRow({ task, slug, overdue }: { task: MyTask; slug: string; overdue: boolean }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const prio = t.priority[PRIORITY_KEYS[task.priority] ?? "none"];
  return (
    <li className="border-b border-border last:border-0">
      <Link href={`/${slug}/p/${task.projectKey}?t=${task.key}`} className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-bg">
        <span title={prio}>
          <PriorityIcon priority={task.priority} />
          <span className="sr-only">{prio}</span>
        </span>
        <span className="w-20 shrink-0 font-mono text-xs text-muted">{task.key}</span>
        <span className="min-w-0 flex-1 truncate">{task.title}</span>
        <span className="hidden items-center gap-1.5 text-xs text-muted sm:inline-flex">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: task.projectColor }} />
          {task.projectName}
        </span>
        <span className="w-24 shrink-0 text-xs text-muted">{task.statusName}</span>
        <span className={cn("w-14 shrink-0 text-right text-xs tabular-nums", overdue ? "font-medium text-prio-urgent-ink" : "text-muted")}>
          {formatDue(task.dueDate, locale)}
        </span>
      </Link>
    </li>
  );
}
