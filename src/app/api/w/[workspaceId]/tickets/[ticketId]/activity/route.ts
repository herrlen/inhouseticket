import { listActivity } from "@/db/queries/tickets";
import { json, jsonError, requireApiMember } from "@/lib/api";

type Ctx = { params: Promise<{ workspaceId: string; ticketId: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { workspaceId, ticketId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return jsonError(404, "not_found", "Nicht gefunden.");
  return json(await listActivity(r.ctx.workspace.id, ticketId));
}
