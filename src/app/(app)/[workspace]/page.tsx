import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { listArchivedProjects, listProjectsWithTickets } from "@/db/queries/projects";
import { hasRole, requireMember } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { setProjectArchivedAction } from "./actions";

type Props = { params: Promise<{ workspace: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace } = await params;
  const ctx = await requireMember({ slug: workspace });
  return { title: ctx.workspace.name };
}

// Placeholder overview until lists and boards arrive (Sprints 2–4).
export default async function WorkspacePage({ params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  const isAdmin = hasRole(ctx, "admin");
  const [projects, archived] = await Promise.all([
    listProjectsWithTickets(ctx.workspace.id),
    isAdmin ? listArchivedProjects(ctx.workspace.id) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6">
      <h1 className="mb-6 text-xl font-semibold">{de.workspace.welcome(ctx.workspace.name)}</h1>
      {projects.map((p) => (
        <section key={p.id} className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface">
          <h2 className="flex items-center gap-2 border-b border-border px-4 py-2 font-semibold">
            <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.icon ? <span aria-hidden>{p.icon}</span> : null}
            {p.name}
          </h2>
          <ul>
            {p.tickets.map((t) => (
                <li key={t.id} className="flex gap-3 border-b border-border px-4 py-2 last:border-0">
                  <span className="font-mono text-[13px] text-muted">
                    {p.key}-{t.number}
                  </span>
                  {t.title}
                </li>
            ))}
          </ul>
        </section>
      ))}
      {archived.length > 0 ? (
        <section aria-labelledby="archived-heading" className="mt-10">
          <h2 id="archived-heading" className="mb-2 font-semibold">{de.workspace.archived}</h2>
          <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-0">
                <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="flex-1">{p.name}</span>
                <span className="font-mono text-[13px] text-muted">{p.key}</span>
                <form action={setProjectArchivedAction}>
                  <input type="hidden" name="workspaceId" value={ctx.workspace.id} />
                  <input type="hidden" name="projectId" value={p.id} />
                  <input type="hidden" name="archived" value="false" />
                  <Button type="submit" size="sm" aria-label={de.workspace.restoreLabel(p.name)}>{de.workspace.restore}</Button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
