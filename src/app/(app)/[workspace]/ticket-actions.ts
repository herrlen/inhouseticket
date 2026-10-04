"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createLabel, createTicket, TicketError, updateTicket, type LabelRow, type TicketRow } from "@/db/queries/tickets";
import { requireMember } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { bulkPatchSchema, createTicketSchema, labelSchema, ticketPatchSchema } from "@/lib/validation/ticket";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_BULK = 200;

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof TicketError) return { ok: false, error: de.tickets.errors[e.code] };
  throw e;
}

function issue(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? de.common.invalidInput };
}

export async function createTicketAction(input: z.input<typeof createTicketSchema>): Promise<ActionResult<TicketRow>> {
  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) return issue(parsed.error);
  const { workspaceId, ...data } = parsed.data;
  const ctx = await requireMember({ workspaceId });
  try {
    const row = await createTicket({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, data);
    revalidatePath(`/${ctx.workspace.slug}`, "layout"); // explorer counts
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTicketAction(input: { workspaceId: string; ticketId: string; patch: unknown }): Promise<ActionResult<TicketRow>> {
  const ids = z.object({ workspaceId: z.uuid(), ticketId: z.uuid() }).safeParse(input);
  if (!ids.success) return issue(ids.error);
  const patch = ticketPatchSchema.safeParse(input.patch);
  if (!patch.success) return issue(patch.error);
  const ctx = await requireMember({ workspaceId: ids.data.workspaceId });
  try {
    const row = await updateTicket({ userId: ctx.user.id, workspaceId: ctx.workspace.id }, ids.data.ticketId, patch.data);
    if (patch.data.statusId) revalidatePath(`/${ctx.workspace.slug}`, "layout");
    return { ok: true, data: row };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkUpdateTicketsAction(input: { workspaceId: string; ticketIds: string[]; patch: unknown }): Promise<ActionResult<TicketRow[]>> {
  const ids = z.object({ workspaceId: z.uuid(), ticketIds: z.array(z.uuid()).min(1).max(MAX_BULK) }).safeParse(input);
  if (!ids.success) return issue(ids.error);
  const patch = bulkPatchSchema.safeParse(input.patch);
  if (!patch.success) return issue(patch.error);
  const ctx = await requireMember({ workspaceId: ids.data.workspaceId });
  const actor = { userId: ctx.user.id, workspaceId: ctx.workspace.id };
  try {
    const rows: TicketRow[] = [];
    for (const id of new Set(ids.data.ticketIds)) rows.push(await updateTicket(actor, id, patch.data));
    if (patch.data.statusId) revalidatePath(`/${ctx.workspace.slug}`, "layout");
    return { ok: true, data: rows };
  } catch (e) {
    return fail(e);
  }
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
