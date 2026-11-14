import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectView } from "@/components/tickets/project-view";
import { findProjectByKey, listStatuses } from "@/db/queries/projects";
import { listAssignableMembers, listLabels, listTickets } from "@/db/queries/tickets";
import { listSavedViews } from "@/db/queries/views";
import { requireMember } from "@/lib/authz";

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
    // Header (name, counts, settings, "Neues Ticket") lives in ProjectView: the counts follow the live list.
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <Suspense>
        <ProjectView
          info={{ workspaceId: wsId, slug: ctx.workspace.slug, project: { id: project.id, key: project.key, name: project.name, color: project.color, icon: project.icon }, currentUserId: ctx.user.id }}
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
