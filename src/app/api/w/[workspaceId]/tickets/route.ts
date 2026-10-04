import { readJson, requireApiMember, requireSameOrigin } from "@/lib/api";
import { handleBulk } from "@/lib/ticket-api-handlers";

type Ctx = { params: Promise<{ workspaceId: string }> };

/** Bulk change of one field for up to 200 tickets. */
export async function PATCH(request: Request, { params }: Ctx) {
  const blocked = await requireSameOrigin();
  if (blocked) return blocked;
  const { workspaceId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  return handleBulk(r.ctx, await readJson(request));
}
