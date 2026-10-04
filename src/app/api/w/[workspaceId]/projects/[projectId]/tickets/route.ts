import { listTickets } from "@/db/queries/tickets";
import { json, jsonError, readJson, requireApiMember, requireSameOrigin } from "@/lib/api";
import { handleCreate } from "@/lib/ticket-api-handlers";

type Ctx = { params: Promise<{ workspaceId: string; projectId: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { workspaceId, projectId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return jsonError(404, "not_found", "Nicht gefunden.");
  return json(await listTickets(r.ctx.workspace.id, projectId));
}

export async function POST(request: Request, { params }: Ctx) {
  const blocked = await requireSameOrigin();
  if (blocked) return blocked;
  const { workspaceId, projectId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return jsonError(404, "not_found", "Nicht gefunden.");
  return handleCreate(r.ctx, projectId, await readJson(request));
}
