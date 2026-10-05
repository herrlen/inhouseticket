import "server-only";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { activity, attachment, comment, membership, notification, subtask, ticket, user } from "@/db/schema";
import type { Actor } from "@/db/queries/tickets";
import { asLimitError, type Tx } from "@/db/queries/workspaces";
import { keyBetween } from "@/lib/fractional";
import { sniffImage } from "@/lib/image-sniff";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TICKET, MAX_SUBTASKS } from "@/lib/limits";
import { mentionedUserIds } from "@/lib/markdown";

// Subtasks, attachments and comments – always scoped to the actor's workspace.

export class PartError extends Error {
  constructor(public readonly code: "not_found" | "max_subtasks" | "max_attachments" | "too_large" | "invalid_image" | "forbidden") {
    super(code);
  }
}

async function ticketInWorkspace(tx: Tx | typeof db, workspaceId: string, ticketId: string) {
  const [t] = await tx.select({ id: ticket.id }).from(ticket).where(and(eq(ticket.id, ticketId), eq(ticket.workspaceId, workspaceId))).limit(1);
  if (!t) throw new PartError("not_found");
}

async function log(tx: Tx, actor: Actor, ticketId: string, type: string, payload: Record<string, unknown>) {
  await tx.insert(activity).values({ workspaceId: actor.workspaceId, ticketId, actorId: actor.userId, type, payload, via: actor.via ?? "web" });
}

const touch = (tx: Tx, ticketId: string) => tx.update(ticket).set({ updatedAt: new Date() }).where(eq(ticket.id, ticketId));

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export type SubtaskRow = { id: string; title: string; done: boolean; sort: string };

export async function listSubtasks(workspaceId: string, ticketId: string): Promise<SubtaskRow[]> {
  return db
    .select({ id: subtask.id, title: subtask.title, done: subtask.done, sort: subtask.sort })
    .from(subtask)
    .where(and(eq(subtask.workspaceId, workspaceId), eq(subtask.ticketId, ticketId)))
    .orderBy(asc(subtask.sort));
}

export async function createSubtask(actor: Actor, ticketId: string, title: string): Promise<SubtaskRow> {
  try {
    return await db.transaction(async (tx) => {
      await ticketInWorkspace(tx, actor.workspaceId, ticketId);
      const existing = await tx.select({ sort: subtask.sort }).from(subtask).where(eq(subtask.ticketId, ticketId)).orderBy(asc(subtask.sort));
      if (existing.length >= MAX_SUBTASKS) throw new PartError("max_subtasks");
      const [row] = await tx
        .insert(subtask)
        .values({ workspaceId: actor.workspaceId, ticketId, title, sort: keyBetween(existing.at(-1)?.sort ?? null, null) })
        .returning({ id: subtask.id, title: subtask.title, done: subtask.done, sort: subtask.sort });
      await log(tx, actor, ticketId, "subtask_added", { title });
      await touch(tx, ticketId);
      return row!;
    });
  } catch (e) {
    if (asLimitError(e)?.code === "max_subtasks") throw new PartError("max_subtasks");
    throw e;
  }
}

export async function updateSubtask(actor: Actor, subtaskId: string, patch: { title?: string; done?: boolean }): Promise<SubtaskRow> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(subtask)
      .where(and(eq(subtask.id, subtaskId), eq(subtask.workspaceId, actor.workspaceId)))
      .for("update")
      .limit(1);
    if (!current) throw new PartError("not_found");
    const [row] = await tx
      .update(subtask)
      .set(patch)
      .where(eq(subtask.id, subtaskId))
      .returning({ id: subtask.id, title: subtask.title, done: subtask.done, sort: subtask.sort });
    if (patch.done !== undefined && patch.done !== current.done) {
      await log(tx, actor, current.ticketId, patch.done ? "subtask_done" : "subtask_reopened", { title: row!.title });
    }
    await touch(tx, current.ticketId);
    return row!;
  });
}

export async function deleteSubtask(actor: Actor, subtaskId: string) {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(subtask).where(and(eq(subtask.id, subtaskId), eq(subtask.workspaceId, actor.workspaceId))).limit(1);
    if (!current) throw new PartError("not_found");
    await tx.delete(subtask).where(eq(subtask.id, subtaskId));
    await log(tx, actor, current.ticketId, "subtask_removed", { title: current.title });
    await touch(tx, current.ticketId);
  });
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type AttachmentRow = { id: string; key: string; fileName: string; mime: string; bytes: number; width: number; height: number; createdAt: string; uploadedBy: string };

export async function listAttachments(workspaceId: string, ticketId: string, executor: Tx | typeof db = db): Promise<AttachmentRow[]> {
  const rows = await executor
    .select({
      id: attachment.id,
      key: attachment.key,
      fileName: attachment.fileName,
      mime: attachment.mime,
      bytes: attachment.bytes,
      width: attachment.width,
      height: attachment.height,
      createdAt: attachment.createdAt,
      uploadedBy: attachment.uploadedBy,
    })
    .from(attachment)
    .where(and(eq(attachment.workspaceId, workspaceId), eq(attachment.ticketId, ticketId)))
    .orderBy(asc(attachment.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Validates by magic bytes (never by declared MIME) and stores the image. */
export async function createAttachment(actor: Actor, ticketId: string, file: { bytes: Uint8Array; fileName: string }): Promise<AttachmentRow> {
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new PartError("too_large");
  const image = sniffImage(file.bytes);
  if (!image) throw new PartError("invalid_image");
  const fileName = file.fileName.replace(/[\u0000-\u001f\u007f/\\]/g, "").slice(0, 255).trim() || "bild";
  try {
    return await db.transaction(async (tx) => {
      await ticketInWorkspace(tx, actor.workspaceId, ticketId);
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(attachment).where(eq(attachment.ticketId, ticketId));
      if (n >= MAX_ATTACHMENTS_PER_TICKET) throw new PartError("max_attachments");
      const [row] = await tx
        .insert(attachment)
        .values({
          workspaceId: actor.workspaceId,
          ticketId,
          key: randomUUID(),
          fileName,
          data: Buffer.from(file.bytes),
          mime: image.mime,
          bytes: file.bytes.byteLength,
          width: image.width,
          height: image.height,
          uploadedBy: actor.userId,
        })
        .returning({ id: attachment.id });
      await log(tx, actor, ticketId, "attachment_added", { fileName });
      await touch(tx, ticketId);
      return (await listAttachments(actor.workspaceId, ticketId, tx)).find((a) => a.id === row!.id)!;
    });
  } catch (e) {
    if (e instanceof Error && String(e.cause ?? e.message).includes("max_attachments")) throw new PartError("max_attachments");
    throw e;
  }
}

export async function getAttachmentFile(workspaceId: string, key: string) {
  const [row] = await db
    .select({ data: attachment.data, mime: attachment.mime, fileName: attachment.fileName })
    .from(attachment)
    .where(and(eq(attachment.workspaceId, workspaceId), eq(attachment.key, key)))
    .limit(1);
  return row ?? null;
}

/** Who may delete a ticket's attachments besides the uploader: the ticket's author and admins. */
export async function canManageAttachments(workspaceId: string, ticketId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const [t] = await db
    .select({ createdBy: ticket.createdBy })
    .from(ticket)
    .where(and(eq(ticket.id, ticketId), eq(ticket.workspaceId, workspaceId)))
    .limit(1);
  return t?.createdBy === userId;
}

/** Allowed for the uploader, the ticket's author and admins (Len, 2026-10-05). */
export async function deleteAttachment(actor: Actor, attachmentId: string, isAdmin: boolean) {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ ticketId: attachment.ticketId, fileName: attachment.fileName, uploadedBy: attachment.uploadedBy, ticketAuthor: ticket.createdBy })
      .from(attachment)
      .innerJoin(ticket, and(eq(ticket.id, attachment.ticketId), eq(ticket.workspaceId, attachment.workspaceId)))
      .where(and(eq(attachment.id, attachmentId), eq(attachment.workspaceId, actor.workspaceId)))
      .limit(1);
    if (!current) throw new PartError("not_found");
    if (!isAdmin && current.uploadedBy !== actor.userId && current.ticketAuthor !== actor.userId) throw new PartError("forbidden");
    await tx.delete(attachment).where(eq(attachment.id, attachmentId));
    await log(tx, actor, current.ticketId, "attachment_removed", { fileName: current.fileName });
    await touch(tx, current.ticketId);
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export type CommentRow = { id: string; body: string; authorId: string; authorName: string; authorImage: string | null; createdAt: string; editedAt: string | null };

export async function listComments(workspaceId: string, ticketId: string, executor: Tx | typeof db = db): Promise<CommentRow[]> {
  const rows = await executor
    .select({
      id: comment.id,
      body: comment.body,
      authorId: comment.authorId,
      authorName: user.name,
      authorImage: user.image,
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
    })
    .from(comment)
    .innerJoin(user, eq(user.id, comment.authorId))
    .where(and(eq(comment.workspaceId, workspaceId), eq(comment.ticketId, ticketId)))
    .orderBy(asc(comment.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), editedAt: r.editedAt ? r.editedAt.toISOString() : null }));
}

/** Active members of the workspace among `ids`, without the actor. */
async function mentionable(tx: Tx, workspaceId: string, ids: string[], actorId: string) {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ id: membership.userId })
    .from(membership)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.status, "active"), inArray(membership.userId, ids), ne(membership.userId, actorId)));
  return rows.map((r) => r.id);
}

export async function createComment(actor: Actor, ticketId: string, body: string): Promise<CommentRow> {
  return db.transaction(async (tx) => {
    await ticketInWorkspace(tx, actor.workspaceId, ticketId);
    const [row] = await tx.insert(comment).values({ workspaceId: actor.workspaceId, ticketId, authorId: actor.userId, body }).returning({ id: comment.id });
    // Mentions → in-app notifications (inbox UI arrives in Sprint 7).
    const mentioned = await mentionable(tx, actor.workspaceId, mentionedUserIds(body), actor.userId);
    if (mentioned.length > 0) {
      await tx.insert(notification).values(mentioned.map((userId) => ({ userId, workspaceId: actor.workspaceId, ticketId, actorId: actor.userId, type: "mention" })));
    }
    await touch(tx, ticketId);
    return (await listComments(actor.workspaceId, ticketId, tx)).find((c) => c.id === row!.id)!;
  });
}

/** Only the author may edit; author or admins may delete (checked by the caller via `isAdmin`). */
export async function updateComment(actor: Actor, commentId: string, body: string) {
  const [current] = await db.select({ authorId: comment.authorId }).from(comment).where(and(eq(comment.id, commentId), eq(comment.workspaceId, actor.workspaceId))).limit(1);
  if (!current) throw new PartError("not_found");
  if (current.authorId !== actor.userId) throw new PartError("forbidden");
  await db.update(comment).set({ body, editedAt: new Date() }).where(eq(comment.id, commentId));
}

export async function deleteComment(actor: Actor, commentId: string, isAdmin: boolean) {
  const [current] = await db.select({ authorId: comment.authorId }).from(comment).where(and(eq(comment.id, commentId), eq(comment.workspaceId, actor.workspaceId))).limit(1);
  if (!current) throw new PartError("not_found");
  if (current.authorId !== actor.userId && !isAdmin) throw new PartError("forbidden");
  await db.delete(comment).where(eq(comment.id, commentId));
}
