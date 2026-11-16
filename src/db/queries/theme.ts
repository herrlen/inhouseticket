import "server-only";
// Colors of the app (Redesign X3, like emuchat): a workspace default and a personal choice over it.
// Stored as JSON and only trusted after parseTheme (src/lib/theme/engine.ts).
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { userPref, workspace } from "@/db/schema";
import { DEFAULT_PREFS } from "@/db/queries/explorer";

export async function getThemes(workspaceId: string, userId: string): Promise<{ personal: unknown; workspace: unknown }> {
  const [ws] = await db.select({ theme: workspace.theme }).from(workspace).where(eq(workspace.id, workspaceId)).limit(1);
  const [pref] = await db
    .select({ colors: userPref.colors })
    .from(userPref)
    .where(and(eq(userPref.workspaceId, workspaceId), eq(userPref.userId, userId)))
    .limit(1);
  return { personal: pref?.colors ?? null, workspace: ws?.theme ?? null };
}

/** null: back to the workspace default. */
export async function setPersonalTheme(workspaceId: string, userId: string, colors: unknown) {
  await db
    .insert(userPref)
    .values({ workspaceId, userId, ...DEFAULT_PREFS, colors })
    .onConflictDoUpdate({ target: [userPref.userId, userPref.workspaceId], set: { colors } });
}

/** null: back to the default (Emu). */
export async function setWorkspaceTheme(workspaceId: string, theme: unknown) {
  await db.update(workspace).set({ theme }).where(eq(workspace.id, workspaceId));
}
