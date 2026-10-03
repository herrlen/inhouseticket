import type { Metadata } from "next";
import { listProjectsWithTickets } from "@/db/queries/projects";
import { requireMember } from "@/lib/authz";
import { de } from "@/lib/i18n/de";

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
  const projects = await listProjectsWithTickets(ctx.workspace.id);

  return (
    <>
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
    </>
  );
}
