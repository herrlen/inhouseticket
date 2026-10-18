import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { isSuperadminEmail } from "@/lib/superadmin";
import { getExplorer } from "@/db/queries/explorer";
import { unreadCount } from "@/db/queries/notifications";
import { hasRole, requireMember } from "@/lib/authz";
import { NOINDEX_ROBOTS } from "@/lib/indexing";

// Workspaces are never indexed (header: src/proxy.ts).
export const metadata: Metadata = { robots: NOINDEX_ROBOTS };

type Props = { children: React.ReactNode; params: Promise<{ workspace: string }> };

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  // Not onboarded yet (new owner, invited or auto-joined person): the wizard comes first (ADR 006).
  if (!ctx.onboardedAt) redirect("/onboarding");
  const [{ folders, projects, prefs }, unread] = await Promise.all([getExplorer(ctx.workspace.id, ctx.user.id), unreadCount(ctx.workspace.id, ctx.user.id)]);

  return (
    <AppShell
      shell={{
        workspaceId: ctx.workspace.id,
        slug: ctx.workspace.slug,
        workspaceName: ctx.workspace.name,
        workspaceColor: ctx.workspace.color,
        canAdmin: hasRole(ctx, "admin"),
        isSuperadmin: isSuperadminEmail(ctx.user.email),
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
      initialConfetti={prefs.confetti}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
