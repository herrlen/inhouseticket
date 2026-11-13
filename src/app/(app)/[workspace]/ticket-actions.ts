"use server";

import { z } from "zod";
import { convertChecklistItem, createLabel, TicketError, type LabelRow, type TicketRow } from "@/db/queries/tickets";
import {
  createComment,
  createSubtask,
  deleteAttachment,
  deleteComment,
  deleteSubtask,
  PartError,
  updateComment,
  updateSubtask,
  type CommentRow,
  type SubtaskRow,
} from "@/db/queries/ticket-parts";
import { hasRole, requireMember } from "@/lib/authz";
import { MAX_COMMENT } from "@/lib/limits";
import { getT } from "@/lib/i18n/server";
import { labelSchema, ticketTitleSchema } from "@/lib/validation/ticket";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function fail(e: unknown): Promise<{ ok: false; error: string }> {
  const t = await getT();
  if (e instanceof TicketError) return { ok: false, error: t.tickets.errors[e.code] };
  if (e instanceof PartError) return { ok: false, error: t.parts.errors[e.code] };
  throw e;
}

async function issue(error: z.ZodError): Promise<{ ok: false; error: string }> {
  const t = await getT();
  return { ok: false, error: t.validation(error.issues[0]?.message ?? t.common.invalidInput) };
}

export async function createLabelAction(input: { workspaceId: string; projectId: string; name: string; color: string }): Promise<ActionResult<LabelRow>> {
  const ids = z.object({ workspaceId: z.uuid(), projectId: z.uuid() }).safeParse(input);
  if (!ids.success) return issue(ids.error);
  const data = labelSchema.safeParse(input);
  if (!data.success) return issue(data.error);
  const ctx = await requireMember({ workspaceId: ids.data.workspaceId });
  try {
    return { ok: true, data: await createLabel(ctx.workspace.id, ids.data.projectId, data.data) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------



export async function createSubtaskAction(input: { workspaceId: string; ticketId: string; title: string }): Promise<ActionResult<SubtaskRow>> {
  const parsed = z.object({ workspaceId: z.uuid(), ticketId: z.uuid(), title: ticketTitleSchema }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  try {
    return { ok: true, data: await createSubtask({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.ticketId, parsed.data.title) };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSubtaskAction(input: { workspaceId: string; subtaskId: string; title?: string; done?: boolean }): Promise<ActionResult<SubtaskRow>> {
  const parsed = z.object({ workspaceId: z.uuid(), subtaskId: z.uuid(), title: ticketTitleSchema.optional(), done: z.boolean().optional() }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  const { title, done } = parsed.data;
  try {
    return { ok: true, data: await updateSubtask({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.subtaskId, { ...(title !== undefined ? { title } : {}), ...(done !== undefined ? { done } : {}) }) };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSubtaskAction(input: { workspaceId: string; subtaskId: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ workspaceId: z.uuid(), subtaskId: z.uuid() }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  try {
    await deleteSubtask({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.subtaskId);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/** "In Unteraufgabe umwandeln": checklist item → ticket of type subtask under the same ticket. */
export async function convertChecklistItemAction(input: { workspaceId: string; subtaskId: string }): Promise<ActionResult<TicketRow>> {
  const parsed = z.object({ workspaceId: z.uuid(), subtaskId: z.uuid() }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  try {
    return { ok: true, data: await convertChecklistItem({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.subtaskId) };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Attachments (upload goes through the route handler – it needs the raw file)
// ---------------------------------------------------------------------------

export async function deleteAttachmentAction(input: { workspaceId: string; attachmentId: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ workspaceId: z.uuid(), attachmentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  try {
    await deleteAttachment({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.attachmentId, hasRole(ctx, "admin"));
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const commentBody = z.string().trim().min(1, "Bitte einen Kommentar eingeben.").max(MAX_COMMENT, `Höchstens ${MAX_COMMENT} Zeichen.`);

export async function createCommentAction(input: { workspaceId: string; ticketId: string; body: string }): Promise<ActionResult<CommentRow>> {
  const parsed = z.object({ workspaceId: z.uuid(), ticketId: z.uuid(), body: commentBody }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  try {
    return { ok: true, data: await createComment({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.ticketId, parsed.data.body) };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCommentAction(input: { workspaceId: string; commentId: string; body: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ workspaceId: z.uuid(), commentId: z.uuid(), body: commentBody }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  try {
    await updateComment({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.commentId, parsed.data.body);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCommentAction(input: { workspaceId: string; commentId: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ workspaceId: z.uuid(), commentId: z.uuid() }).safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const ctx = await requireMember({ workspaceId: parsed.data.workspaceId });
  try {
    await deleteComment({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, parsed.data.commentId, hasRole(ctx, "admin"));
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
