import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { user, userPref, workspace } from "@/db/schema";
import type { Tx } from "@/db/queries/workspaces";
import type { Locale } from "@/lib/i18n/locale";

/**
 * End of the owner wizard, inside the caller's transaction: locks the workspace row, so a double
 * submit waits and then finds it done. Returns where the person continues.
 * TODO(phase C): create the project from the team area's template here.
 */
export async function completeOnboarding(
  tx: Tx,
  input: { workspaceId: string; userId: string; locale: Locale; invited: boolean },
): Promise<{ target: string; created: boolean }> {
  const [ws] = await tx
    .select({ slug: workspace.slug, completedAt: workspace.onboardingCompletedAt })
    .from(workspace)
    .where(eq(workspace.id, input.workspaceId))
    .for("update")
    .limit(1);
  if (!ws) throw new Error("workspace_not_found");
  const target = `/${ws.slug}`;
  if (ws.completedAt) return { target, created: false };

  const now = new Date();
  await tx.update(workspace).set({ onboardingCompletedAt: now }).where(eq(workspace.id, input.workspaceId));
  await tx.update(user).set({ onboardedAt: now }).where(and(eq(user.id, input.userId), isNull(user.onboardedAt)));
  await tx.update(userPref).set({ onboardingStep: null }).where(and(eq(userPref.workspaceId, input.workspaceId), eq(userPref.userId, input.userId)));
  return { target, created: true };
}
