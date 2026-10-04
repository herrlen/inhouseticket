import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, type Priority } from "@/components/ui/badge";
import { findProjectByKey, listProjectTickets } from "@/db/queries/projects";
import { requireMember } from "@/lib/authz";
import { de } from "@/lib/i18n/de";

type Props = { params: Promise<{ workspace: string; key: string }> };

const PRIORITIES: Priority[] = ["none", "low", "medium", "high", "urgent"];

async function load(params: Props["params"]) {
  const { workspace, key } = await params;
  const ctx = await requireMember({ slug: workspace });
  const project = await findProjectByKey(ctx.workspace.id, decodeURIComponent(key));
  if (!project || project.archivedAt) notFound();
  return { ctx, project };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project } = await load(params);
  return { title: project.name };
}

// Read-only list until the real list view with inline editing (Sprint 3).
export default async function ProjectPage({ params }: Props) {
  const { ctx, project } = await load(params);
  const tickets = await listProjectTickets(ctx.workspace.id, project.id);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-6 flex items-center gap-3">
        <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: project.color }} />
        {project.icon ? <span aria-hidden className="text-xl">{project.icon}</span> : null}
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <span className="font-mono text-[13px] text-muted">{project.key}</span>
        <Link href={`/${ctx.workspace.slug}/p/${project.key}/settings`} className="ml-auto text-[13px] text-muted hover:text-text">
          {de.explorer.settings}
        </Link>
      </header>

      {tickets.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center text-muted">{de.project.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{de.project.tableCaption(project.name)}</caption>
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th scope="col" className="w-24 px-4 py-2 font-medium">{de.project.colKey}</th>
                <th scope="col" className="px-4 py-2 font-medium">{de.project.colTitle}</th>
                <th scope="col" className="w-32 px-4 py-2 font-medium">{de.project.colStatus}</th>
                <th scope="col" className="w-32 px-4 py-2 font-medium">{de.project.colPriority}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const prio = PRIORITIES[t.priority] ?? "none";
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-muted">{project.key}-{t.number}</td>
                    <td className="px-4 py-2">{t.title}</td>
                    <td className="px-4 py-2">{t.statusName}</td>
                    <td className="px-4 py-2">
                      <Badge tone={{ kind: "priority", value: prio }}>{de.priority[prio]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
