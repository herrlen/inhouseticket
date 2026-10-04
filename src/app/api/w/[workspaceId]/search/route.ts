import { searchTickets } from "@/db/queries/search";
import { json, requireApiMember } from "@/lib/api";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { workspaceId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return json(await searchTickets(r.ctx.workspace.id, q));
}
