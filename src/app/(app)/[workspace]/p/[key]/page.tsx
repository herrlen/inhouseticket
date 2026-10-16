import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectView } from "@/components/tickets/project-view";
import { findProjectByKey, listStatuses } from "@/db/queries/projects";
import { listAssignableMembers, listLabels, listTickets } from "@/db/queries/tickets";
import { listSavedViews } from "@/db/queries/views";
import { requireMember } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";

type Props = { params: Promise<{ workspace: string; key: string }> };

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

export default async function ProjectPage({ params }: Props) {
  const t = await getT();
  const { ctx, project } = await load(params);
  const wsId = ctx.workspace.id;
  const [tickets, statuses, members, labels, savedViews] = await Promise.all([
    listTickets(wsId, project.id),
    listStatuses(wsId, project.id),
    listAssignableMembers(wsId),
    listLabels(wsId, project.id),
    listSavedViews(wsId, ctx.user.id, project.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex items-center gap-3">
        <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: project.color }} />
        {project.icon ? <span aria-hidden className="text-xl">{project.icon}</span> : null}
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <span className="font-mono text-[13px] text-muted">{project.key}</span>
        <Link href={`/${ctx.workspace.slug}/p/${project.key}/settings`} className="ml-auto text-[13px] text-muted hover:text-text">
          {t.explorer.settings}
        </Link>
      </header>
      <Suspense>
        <ProjectView
          info={{ workspaceId: wsId, slug: ctx.workspace.slug, project: { id: project.id, key: project.key, name: project.name, color: project.color }, currentUserId: ctx.user.id }}
          statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color, category: s.category, sort: s.sort, wipLimit: s.wipLimit }))}
          members={members}
          labels={labels}
          initialTickets={tickets}
          savedViews={savedViews}
        />
      </Suspense>
    </div>
  );
}
