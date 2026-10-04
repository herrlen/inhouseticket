import { AppShell } from "@/components/shell/app-shell";
import { getExplorer } from "@/db/queries/explorer";
import { hasRole, requireMember } from "@/lib/authz";

type Props = { children: React.ReactNode; params: Promise<{ workspace: string }> };

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  const { folders, projects, prefs } = await getExplorer(ctx.workspace.id, ctx.user.id);

  return (
    <AppShell
      shell={{
        workspaceId: ctx.workspace.id,
        slug: ctx.workspace.slug,
        workspaceName: ctx.workspace.name,
        workspaceColor: ctx.workspace.color,
        canAdmin: hasRole(ctx, "admin"),
      }}
      user={{ id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, image: ctx.user.image }}
      explorer={{
        folders,
        projects,
        // Drop ids of deleted/archived items so they never resurface.
        expandedFolders: prefs.expandedFolders.filter((id) => folders.some((f) => f.id === id)),
        favorites: prefs.favorites.filter((id) => projects.some((p) => p.id === id)),
      }}
      initialCollapsed={prefs.sidebarCollapsed}
    >
      {children}
    </AppShell>
  );
}
