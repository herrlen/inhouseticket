import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { findProjectByKey, listStatuses } from "@/db/queries/projects";
import { hasRole, requireMember } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { setProjectArchivedAction } from "../../../actions";
import { NewStatusForm, ProjectForm, StatusRow } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.command.projectSettings };
}

type Props = { params: Promise<{ workspace: string; key: string }> };

export default async function ProjectSettingsPage({ params }: Props) {
  const t = await getT();
  const { workspace, key } = await params;
  const ctx = await requireMember({ slug: workspace });
  const project = await findProjectByKey(ctx.workspace.id, decodeURIComponent(key));
  if (!project || project.archivedAt) notFound();
  const statuses = await listStatuses(ctx.workspace.id, project.id);
  const ref = { workspaceId: ctx.workspace.id, projectKey: project.key };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4 md:p-6">
      <h1 className="text-xl font-semibold">{t.projectSettings.title(project.name)}</h1>

      <section aria-labelledby="general" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="general" className="mb-4 font-semibold">{t.projectSettings.general}</h2>
        <ProjectForm workspaceId={ctx.workspace.id} project={{ id: project.id, name: project.name, key: project.key, color: project.color, icon: project.icon }} />
      </section>

      <section aria-labelledby="statuses" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="statuses" className="mb-1 font-semibold">{t.projectSettings.statuses}</h2>
        <p className="mb-4 text-[13px] text-muted">{t.projectSettings.statusesHint}</p>
        <ol className="flex flex-col gap-2">
          {statuses.map((s, i) => (
            <StatusRow
              key={s.id}
              {...ref}
              status={s}
              isFirst={i === 0}
              isLast={i === statuses.length - 1}
              others={statuses.filter((o) => o.id !== s.id).map((o) => ({ id: o.id, name: o.name }))}
            />
          ))}
        </ol>
        <NewStatusForm {...ref} />
      </section>

      {hasRole(ctx, "admin") ? (
        <section aria-labelledby="archive" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <h2 id="archive" className="mb-1 font-semibold">{t.projectSettings.archiveTitle}</h2>
          <p className="mb-3 text-[13px] text-muted">{t.projectSettings.archiveText}</p>
          <form action={setProjectArchivedAction}>
            <input type="hidden" name="workspaceId" value={ctx.workspace.id} />
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="archived" value="true" />
            <input type="hidden" name="redirect" value="true" />
            <Button type="submit" variant="danger">{t.explorer.archive}</Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
