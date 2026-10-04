import { listAttachments, listComments, listSubtasks } from "@/db/queries/ticket-parts";
import { json, jsonError, requireApiMember } from "@/lib/api";

type Ctx = { params: Promise<{ workspaceId: string; ticketId: string }> };

/** Subtasks, attachments (metadata only) and comments of one ticket. */
export async function GET(_: Request, { params }: Ctx) {
  const { workspaceId, ticketId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return jsonError(404, "not_found", "Nicht gefunden.");
  const ws = r.ctx.workspace.id;
  const [subtasks, attachments, comments] = await Promise.all([listSubtasks(ws, ticketId), listAttachments(ws, ticketId), listComments(ws, ticketId)]);
  return json({ subtasks, attachments, comments });
}
