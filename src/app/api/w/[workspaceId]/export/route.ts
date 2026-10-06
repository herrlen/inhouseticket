import { exportWorkspace, TICKET_CSV_HEADER, ticketCsvRows } from "@/db/queries/export";
import { jsonError, requireApiMember } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { todayInBerlin } from "@/components/tickets/list-model";

type Ctx = { params: Promise<{ workspaceId: string }> };

/** Workspace export for admins: ?format=json (everything) or ?format=csv (tickets for Excel). */
export async function GET(request: Request, { params }: Ctx) {
  const { workspaceId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (r.ctx.membership.role === "member") return jsonError(404, "not_found", "Nicht gefunden.");

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const data = await exportWorkspace(r.ctx.workspace.id);
  const base = `inhouseticket-${r.ctx.workspace.slug}-${todayInBerlin()}`;
  console.info("export", { workspaceId: r.ctx.workspace.id, by: r.ctx.user.id, format });

  const body = format === "csv" ? toCsv(TICKET_CSV_HEADER, ticketCsvRows(data)) : JSON.stringify(data, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
