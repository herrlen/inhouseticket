import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { project, savedView } from "@/db/schema";
import { cleanViewQuery } from "@/lib/view-query";

// Saved views ("Ansichten", KONZEPT §2.7): per user, per project, stored as the view's query string.

export type SavedViewRow = { id: string; name: string; query: string };

export async function listSavedViews(workspaceId: string, userId: string, projectId: string): Promise<SavedViewRow[]> {
  const rows = await db
    .select({ id: savedView.id, name: savedView.name, filters: savedView.filters })
    .from(savedView)
    .where(and(eq(savedView.workspaceId, workspaceId), eq(savedView.userId, userId), eq(savedView.projectId, projectId)))
    .orderBy(asc(savedView.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, query: String((r.filters as { query?: string })?.query ?? "") }));
}

export async function createSavedView(workspaceId: string, userId: string, projectId: string, name: string, query: string): Promise<SavedViewRow | null> {
  const [p] = await db.select({ id: project.id }).from(project).where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId))).limit(1);
  if (!p) return null;
  const clean = cleanViewQuery(query);
  const [row] = await db.insert(savedView).values({ workspaceId, userId, projectId, name, filters: { query: clean } }).returning({ id: savedView.id });
  return { id: row!.id, name, query: clean };
}

export async function deleteSavedView(workspaceId: string, userId: string, viewId: string) {
  await db.delete(savedView).where(and(eq(savedView.id, viewId), eq(savedView.workspaceId, workspaceId), eq(savedView.userId, userId)));
}
