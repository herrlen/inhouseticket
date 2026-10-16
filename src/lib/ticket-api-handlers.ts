import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createTicket, TicketError, updateTicket, type TicketRow } from "@/db/queries/tickets";
import { json, jsonError } from "@/lib/api";
import { getT } from "@/lib/i18n/server";
import { bulkPatchSchema, createTicketSchema, ticketPatchSchema } from "@/lib/validation/ticket";

// Shared by the ticket route handlers. Route handlers instead of server actions on purpose:
// Next.js runs server actions one at a time per page, so quick successive edits queued up and
// could be lost on navigation. fetch() requests run in parallel; row locks keep them consistent.

type Ctx = { user: { id: string }; workspace: { id: string; slug: string } };

const MAX_BULK = 200;

async function ticketError(e: unknown) {
  if (e instanceof TicketError) return jsonError(e.code === "not_found" ? 404 : 422, e.code, (await getT()).tickets.errors[e.code]);
  throw e;
}

const actor = (ctx: Ctx) => ({ userId: ctx.user.id, workspaceId: ctx.workspace.id });

export async function handleCreate(ctx: Ctx, projectId: string, body: unknown) {
  const t = await getT();
  const parsed = createTicketSchema.safeParse({ ...(body as object), workspaceId: ctx.workspace.id, projectId });
  if (!parsed.success) return jsonError(400, "invalid_input", t.validation(parsed.error.issues[0]?.message ?? t.common.invalidInput));
  const { projectId: pid, title, statusId, priority, assigneeId, dueDate } = parsed.data;
  try {
    const row = await createTicket(actor(ctx), { projectId: pid, title, statusId, priority, assigneeId, dueDate });
    revalidatePath(`/${ctx.workspace.slug}`, "layout");
    return json<TicketRow>(row);
  } catch (e) {
    return ticketError(e);
  }
}

export async function handleUpdate(ctx: Ctx, ticketId: string, body: unknown) {
  const t = await getT();
  const patch = ticketPatchSchema.safeParse(body);
  if (!patch.success) return jsonError(400, "invalid_input", t.validation(patch.error.issues[0]?.message ?? t.common.invalidInput));
  try {
    const row = await updateTicket(actor(ctx), ticketId, patch.data);
    if (patch.data.statusId) revalidatePath(`/${ctx.workspace.slug}`, "layout");
    return json<TicketRow>(row);
  } catch (e) {
    return ticketError(e);
  }
}

export async function handleBulk(ctx: Ctx, body: unknown) {
  const t = await getT();
  const input = z.object({ ticketIds: z.array(z.uuid()).min(1).max(MAX_BULK), patch: z.unknown() }).safeParse(body);
  if (!input.success) return jsonError(400, "invalid_input", t.common.invalidInput);
  const patch = bulkPatchSchema.safeParse(input.data.patch);
  if (!patch.success) return jsonError(400, "invalid_input", t.validation(patch.error.issues[0]?.message ?? t.common.invalidInput));
  try {
    const rows: TicketRow[] = [];
    for (const id of new Set(input.data.ticketIds)) rows.push(await updateTicket(actor(ctx), id, patch.data));
    if (patch.data.statusId) revalidatePath(`/${ctx.workspace.slug}`, "layout");
    return json(rows);
  } catch (e) {
    return ticketError(e);
  }
}
