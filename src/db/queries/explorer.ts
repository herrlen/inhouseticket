import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { folder, project, status, ticket, userPref } from "@/db/schema";

export type ExplorerFolder = { id: string; name: string; sort: string };
export type ExplorerProject = {
  id: string;
  name: string;
  key: string;
  color: string;
  icon: string | null;
  folderId: string | null;
  sort: string;
  openCount: number;
};
export type Prefs = { sidebarCollapsed: boolean; expandedFolders: string[]; favorites: string[]; theme: "system" | "light" | "dark" };

export const DEFAULT_PREFS: Prefs = { sidebarCollapsed: false, expandedFolders: [], favorites: [], theme: "system" };

export async function getExplorer(workspaceId: string, userId: string) {
  const [folders, projects, prefs] = await Promise.all([
    db
      .select({ id: folder.id, name: folder.name, sort: folder.sort })
      .from(folder)
      .where(eq(folder.workspaceId, workspaceId))
      .orderBy(asc(folder.sort)),
    db
      .select({
        id: project.id,
        name: project.name,
        key: project.key,
        color: project.color,
        icon: project.icon,
        folderId: project.folderId,
        sort: project.sort,
        // Open = not in a "done" status.
        openCount: sql<number>`(
          select count(*) from ${ticket}
          inner join ${status} on ${status.id} = ${ticket.statusId}
          where ${ticket.projectId} = ${project.id} and ${ticket.workspaceId} = ${workspaceId} and ${status.category} <> 'done'
        )`.mapWith(Number),
      })
      .from(project)
      .where(and(eq(project.workspaceId, workspaceId), isNull(project.archivedAt)))
      .orderBy(asc(project.sort)),
    getPrefs(workspaceId, userId),
  ]);
  return { folders, projects, prefs };
}

export async function getPrefs(workspaceId: string, userId: string): Promise<Prefs> {
  const [row] = await db
    .select({
      sidebarCollapsed: userPref.sidebarCollapsed,
      expandedFolders: userPref.expandedFolders,
      favorites: userPref.favorites,
      theme: userPref.theme,
    })
    .from(userPref)
    .where(and(eq(userPref.workspaceId, workspaceId), eq(userPref.userId, userId)))
    .limit(1);
  return row ?? DEFAULT_PREFS;
}

export async function updatePrefs(workspaceId: string, userId: string, patch: Partial<Prefs>) {
  await db
    .insert(userPref)
    .values({ workspaceId, userId, ...DEFAULT_PREFS, ...patch })
    .onConflictDoUpdate({ target: [userPref.userId, userPref.workspaceId], set: patch });
}

/** Last sort key among siblings (root or folder) – new items go to the end. */
export async function lastProjectSort(workspaceId: string, folderId: string | null) {
  const [row] = await db
    .select({ sort: project.sort })
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), folderId ? eq(project.folderId, folderId) : isNull(project.folderId)))
    .orderBy(sql`${project.sort} desc`)
    .limit(1);
  return row?.sort ?? null;
}

export async function lastFolderSort(workspaceId: string) {
  const [row] = await db
    .select({ sort: folder.sort })
    .from(folder)
    .where(eq(folder.workspaceId, workspaceId))
    .orderBy(sql`${folder.sort} desc`)
    .limit(1);
  return row?.sort ?? null;
}

