import { clickUpNameMappings, clickUpStatusMappings, countKnownTasks, saveImportUpload } from "@/db/queries/clickup-import";
import { listImportMembers } from "@/db/queries/import";
import { json, jsonError, requireApiMember, requireSameOrigin, tooManyRequests } from "@/lib/api";
import { hasRole } from "@/lib/authz";
import { readBodyLimited } from "@/lib/body";
import { getT } from "@/lib/i18n/server";
import { previewClickUpCsv } from "@/lib/import/clickup-plan";
import { decodeText } from "@/lib/import/csv-parse";
import { MAX_CLICKUP_CSV_BYTES } from "@/lib/limits";
import { rateLimit } from "@/lib/rate-limit";

const UPLOADS_PER_HOUR = 20;

type Ctx = { params: Promise<{ workspaceId: string }> };

/**
 * Upload of a ClickUp CSV export (raw body, file name in `x-file-name`), admins only. Reads the
 * file once for the preview and keeps it in import_upload for the background run, which starts
 * with POST ./[uploadId]. A new upload replaces the workspace's earlier, never started one.
 */
export async function POST(request: Request, { params }: Ctx) {
  const blocked = await requireSameOrigin();
  if (blocked) return blocked;
  const { workspaceId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!hasRole(r.ctx, "admin")) return jsonError(404, "not_found", "Nicht gefunden.");
  const ws = r.ctx.workspace.id;
  const t = await getT();
  const limited = tooManyRequests(rateLimit(`import-clickup:${ws}`, UPLOADS_PER_HOUR, 3_600_000));
  if (limited) return limited;

  const body = await readBodyLimited(request, MAX_CLICKUP_CSV_BYTES);
  if (body === "too_large") return jsonError(413, "too_large", t.import.clickup.errors.too_large);
  if (!body.byteLength) return jsonError(422, "empty", t.import.errors.empty());
  const content = decodeText(body);

  const [members, mappings, people] = await Promise.all([listImportMembers(ws), clickUpStatusMappings(ws), clickUpNameMappings(ws)]);
  const plan = previewClickUpCsv(content, members, mappings, people);
  if (!plan.ok) {
    const message = plan.error === "too_many_rows" ? t.import.clickup.errors.too_many_rows : plan.error === "not_this_tool" ? t.import.errors.not_this_tool("ClickUp") : t.import.errors.empty();
    return jsonError(422, plan.error, message);
  }
  const preview = { ...plan.preview, known: await countKnownTasks(ws, plan.taskIds) };
  let fileName = "clickup.csv";
  try {
    fileName = decodeURIComponent(request.headers.get("x-file-name") ?? fileName).slice(0, 255) || fileName;
  } catch {
    // Malformed encoding: keep the default name, it is only shown in the log.
  }
  const uploadId = await saveImportUpload({ workspaceId: ws, userId: r.ctx.user.id, fileName, content, bytes: body.byteLength, tasks: preview.tasks });
  console.info("clickup csv: preview", { workspaceId: ws, rows: preview.rows, tasks: preview.tasks });
  // Members for the people table (names only – addresses stay on the server).
  const choices = members.map((m) => ({ id: m.id, name: m.name })).sort((x, y) => x.name.localeCompare(y.name, "de"));
  return json({ uploadId, preview, members: choices });
}
