"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { getPrefs, lastFolderSort, lastProjectSort, updatePrefs } from "@/db/queries/explorer";
import { createFolder, deleteFolder, folderExists, moveFolder, renameFolder } from "@/db/queries/folders";
import {
  createProjectWithDefaults,
  createStatus,
  deleteStatus,
  findProjectByKey,
  listStatuses,
  projectKeyTaken,
  updateProject,
  updateStatus,
} from "@/db/queries/projects";
import { hasRole, requireMember, requireRole } from "@/lib/authz";
import { keyBetween } from "@/lib/fractional";
import { de } from "@/lib/i18n/de";
import { createProjectSchema, folderNameSchema, statusSchema, updateProjectSchema } from "@/lib/validation/project";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };
export type Result = { ok: true } | { ok: false; error: string };

const id = z.uuid();
const sortKey = z.string().min(1).max(200).regex(/^[0-9A-Za-z]+$/);

function refresh(slug: string) {
  revalidatePath(`/${slug}`, "layout");
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function createProjectAction(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireMember({ workspaceId: id.parse(formData.get("workspaceId")) });
  const parsed = createProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  const wsId = ctx.workspace.id;

  if (input.folderId && !(await folderExists(wsId, input.folderId))) return { error: de.explorer.folderGone };
  if (await projectKeyTaken(wsId, input.key)) return { fieldErrors: { key: de.explorer.keyTaken(input.key) } };

  const sort = keyBetween(await lastProjectSort(wsId, input.folderId), null);
  await db.transaction(async (tx) => {
    await createProjectWithDefaults(tx, {
      workspaceId: wsId,
      name: input.name,
      key: input.key,
      color: input.color,
      icon: input.icon ?? undefined,
      folderId: input.folderId,
      sort,
    });
  });
  refresh(ctx.workspace.slug);
  redirect(`/${ctx.workspace.slug}/p/${input.key}`);
}

export async function updateProjectAction(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireMember({ workspaceId: id.parse(formData.get("workspaceId")) });
  const projectId = id.parse(formData.get("projectId"));
  const parsed = updateProjectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  await updateProject(ctx.workspace.id, projectId, parsed.data);
  refresh(ctx.workspace.slug);
  return { ok: true };
}

export async function setProjectArchivedAction(formData: FormData) {
  const ctx = await requireRole({ workspaceId: id.parse(formData.get("workspaceId")) }, "admin");
  const projectId = id.parse(formData.get("projectId"));
  const archived = formData.get("archived") === "true";
  await updateProject(ctx.workspace.id, projectId, { archivedAt: archived ? new Date() : null });
  refresh(ctx.workspace.slug);
  if (archived) redirect(`/${ctx.workspace.slug}`);
}

const moveProjectInput = z.object({ workspaceId: id, projectId: id, folderId: id.nullable(), sort: sortKey });

/** Drag & drop / "move to" – called with optimistic UI, so it returns instead of throwing. */
export async function moveProjectAction(input: z.input<typeof moveProjectInput>): Promise<Result> {
  const data = moveProjectInput.safeParse(input);
  if (!data.success) return { ok: false, error: de.common.invalidInput };
  const ctx = await requireMember({ workspaceId: data.data.workspaceId });
  if (data.data.folderId && !(await folderExists(ctx.workspace.id, data.data.folderId))) return { ok: false, error: de.explorer.folderGone };
  await updateProject(ctx.workspace.id, data.data.projectId, { folderId: data.data.folderId, sort: data.data.sort });
  refresh(ctx.workspace.slug);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolderAction(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireMember({ workspaceId: id.parse(formData.get("workspaceId")) });
  const name = folderNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { fieldErrors: { name: name.error.issues[0]!.message } };
  const sort = keyBetween(await lastFolderSort(ctx.workspace.id), null);
  const folder = await createFolder(ctx.workspace.id, name.data, sort);
  const prefs = await getPrefs(ctx.workspace.id, ctx.user.id);
  await updatePrefs(ctx.workspace.id, ctx.user.id, { expandedFolders: [...prefs.expandedFolders, folder.id] });
  refresh(ctx.workspace.slug);
  return { ok: true };
}

export async function renameFolderAction(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireMember({ workspaceId: id.parse(formData.get("workspaceId")) });
  const name = folderNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { fieldErrors: { name: name.error.issues[0]!.message } };
  await renameFolder(ctx.workspace.id, id.parse(formData.get("folderId")), name.data);
  refresh(ctx.workspace.slug);
  return { ok: true };
}

export async function deleteFolderAction(input: { workspaceId: string; folderId: string }): Promise<Result> {
  const ctx = await requireMember({ workspaceId: id.parse(input.workspaceId) });
  if (!hasRole(ctx, "admin")) return { ok: false, error: de.members.noPermission };
  await deleteFolder(ctx.workspace.id, id.parse(input.folderId));
  refresh(ctx.workspace.slug);
  return { ok: true };
}

export async function moveFolderAction(input: { workspaceId: string; folderId: string; sort: string }): Promise<Result> {
  const parsed = z.object({ workspaceId: id, folderId: id, sort: sortKey }).safeParse(input);
  if (!parsed.success) return { ok: false, error: de.common.invalidInput };
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  await moveFolder(ctx.workspace.id, parsed.data.folderId, parsed.data.sort);
  refresh(ctx.workspace.slug);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Per-user preferences (no revalidation – the client already shows the new state)
// ---------------------------------------------------------------------------

const prefsInput = z.object({
  workspaceId: id,
  sidebarCollapsed: z.boolean().optional(),
  expandedFolders: z.array(id).max(500).optional(),
  favorites: z.array(id).max(500).optional(),
});

export async function savePrefsAction(input: z.input<typeof prefsInput>): Promise<Result> {
  const parsed = prefsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: de.common.invalidInput };
  const { workspaceId, ...patch } = parsed.data;
  const ctx = await requireMember({ workspaceId });
  await updatePrefs(ctx.workspace.id, ctx.user.id, patch);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Statuses (project settings)
// ---------------------------------------------------------------------------

async function projectContext(formData: FormData) {
  const ctx = await requireMember({ workspaceId: id.parse(formData.get("workspaceId")) });
  const project = await findProjectByKey(ctx.workspace.id, String(formData.get("projectKey") ?? ""));
  if (!project) throw new Error("project_not_found");
  return { ctx, project };
}

export async function createStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  const { ctx, project } = await projectContext(formData);
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const statuses = await listStatuses(ctx.workspace.id, project.id);
  // New statuses go before the first "done" status, so "Erledigt" stays last.
  const firstDone = statuses.findIndex((s) => s.category === "done");
  const before = firstDone > 0 ? statuses[firstDone - 1]!.sort : firstDone === 0 ? null : (statuses.at(-1)?.sort ?? null);
  const after = firstDone >= 0 ? statuses[firstDone]!.sort : null;
  await createStatus(ctx.workspace.id, project.id, { ...parsed.data, sort: keyBetween(before, after) });
  refresh(ctx.workspace.slug);
  return { ok: true };
}

export async function updateStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  const { ctx, project } = await projectContext(formData);
  const statusId = id.parse(formData.get("statusId"));
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const statuses = await listStatuses(ctx.workspace.id, project.id);
  if (!statuses.some((s) => s.id === statusId)) return { error: de.common.invalidInput };
  const target = statuses.find((s) => s.id === statusId)!;
  if (target.category === "done" && parsed.data.category !== "done" && statuses.filter((s) => s.category === "done").length === 1) {
    return { error: de.projectSettings.needsDone };
  }
  await updateStatus(ctx.workspace.id, statusId, parsed.data);
  refresh(ctx.workspace.slug);
  return { ok: true };
}

export async function moveStatusAction(formData: FormData) {
  const { ctx, project } = await projectContext(formData);
  const statusId = id.parse(formData.get("statusId"));
  const direction = z.enum(["up", "down"]).parse(formData.get("direction"));
  const statuses = await listStatuses(ctx.workspace.id, project.id);
  const i = statuses.findIndex((s) => s.id === statusId);
  if (i < 0) return;
  const others = statuses.filter((s) => s.id !== statusId).map((s) => s.sort);
  const target = direction === "up" ? i - 1 : i + 1;
  if (target < 0 || target > others.length) return;
  const sort = keyBetween(others[target - 1] ?? null, others[target] ?? null);
  await updateStatus(ctx.workspace.id, statusId, { sort });
  refresh(ctx.workspace.slug);
}

export async function deleteStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  const { ctx, project } = await projectContext(formData);
  const statusId = id.parse(formData.get("statusId"));
  const targetRaw = String(formData.get("targetStatusId") ?? "");
  const statuses = await listStatuses(ctx.workspace.id, project.id);
  const target = statuses.find((s) => s.id === statusId);
  if (!target) return { error: de.common.invalidInput };
  if (statuses.length <= 1) return { error: de.projectSettings.needsOne };
  if (target.category === "done" && statuses.filter((s) => s.category === "done").length === 1) return { error: de.projectSettings.needsDone };
  const moveTo = targetRaw && statuses.some((s) => s.id === targetRaw && s.id !== statusId) ? targetRaw : null;
  if (target.ticketCount > 0 && !moveTo) return { error: de.projectSettings.chooseTarget };
  await deleteStatus(ctx.workspace.id, project.id, statusId, moveTo);
  refresh(ctx.workspace.slug);
  return { ok: true };
}
