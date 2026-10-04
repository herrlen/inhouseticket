import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { folder } from "@/db/schema";

export async function createFolder(workspaceId: string, name: string, sort: string) {
  const [row] = await db.insert(folder).values({ workspaceId, name, sort }).returning({ id: folder.id });
  return row!;
}

export async function renameFolder(workspaceId: string, folderId: string, name: string) {
  await db.update(folder).set({ name }).where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)));
}

export async function moveFolder(workspaceId: string, folderId: string, sort: string) {
  await db.update(folder).set({ sort }).where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)));
}

/** Projects inside fall back to the root (FK ON DELETE SET NULL (folder_id)). */
export async function deleteFolder(workspaceId: string, folderId: string) {
  await db.delete(folder).where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)));
}

export async function folderExists(workspaceId: string, folderId: string) {
  const [row] = await db
    .select({ id: folder.id })
    .from(folder)
    .where(and(eq(folder.id, folderId), eq(folder.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(row);
}
