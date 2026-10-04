import { jsonError, readJson, requireApiMember, requireSameOrigin } from "@/lib/api";
import { handleUpdate } from "@/lib/ticket-api-handlers";

type Ctx = { params: Promise<{ workspaceId: string; ticketId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const blocked = await requireSameOrigin();
  if (blocked) return blocked;
  const { workspaceId, ticketId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(ticketId)) return jsonError(404, "not_found", "Nicht gefunden.");
  return handleUpdate(r.ctx, ticketId, await readJson(request));
}
