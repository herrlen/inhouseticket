import { z } from "zod";
import { projectKeyTaken } from "@/db/queries/projects";
import { ImportError, listImportMembers, runImport } from "@/db/queries/import";
import { json, jsonError, requireApiMember, requireSameOrigin, tooManyRequests } from "@/lib/api";
import { hasRole } from "@/lib/authz";
import { readBodyLimited } from "@/lib/body";
import { getT } from "@/lib/i18n/server";
import { buildPlan, MAX_IMPORT_BYTES } from "@/lib/import/plan";
import { readImportFile } from "@/lib/import/read";
import { SOURCE_IDS, SOURCE_NAMES } from "@/lib/import/source";
import { PALETTE } from "@/lib/palette";
import { suggestProjectKey } from "@/lib/project-key";
import { rateLimit } from "@/lib/rate-limit";
import { projectColorSchema, projectKeySchema, projectNameSchema } from "@/lib/validation/project";

const PREVIEWS_PER_HOUR = 60;
const IMPORTS_PER_HOUR = 10;

type Ctx = { params: Promise<{ workspaceId: string }> };

const fields = z.object({
  source: z.enum(SOURCE_IDS),
  mode: z.enum(["preview", "import"]),
});
const target = z.object({ name: projectNameSchema, key: projectKeySchema, color: projectColorSchema });

/** Project key from the file if valid and free, else one derived from the name, numbered until free. */
async function freeKey(workspaceId: string, fromFile: string, name: string): Promise<string> {
  const file = projectKeySchema.safeParse(fromFile);
  if (file.success && !(await projectKeyTaken(workspaceId, file.data))) return file.data;
  const base = (file.success ? file.data : suggestProjectKey(name || "Import")).slice(0, 8);
  if (!file.success && !(await projectKeyTaken(workspaceId, base))) return base;
  for (let n = 2; n < 100; n++) {
    const key = `${base}${n}`;
    if (!(await projectKeyTaken(workspaceId, key))) return key;
  }
  return base;
}

/**
 * Import of another tool's export file (multipart: file, source, mode, and for mode=import
 * name/key/color of the new project). Admins only. The file is read again on import, so
 * nothing is stored between preview and import.
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

  const body = await readBodyLimited(request, MAX_IMPORT_BYTES + 16 * 1024);
  if (body === "too_large") return jsonError(413, "too_large", t.import.errors.too_large);
  const form = await new Response(body, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData().catch(() => null);
  const file = form?.get("file");
  const parsed = fields.safeParse({ source: form?.get("source"), mode: form?.get("mode") });
  if (!(file instanceof File) || !parsed.success) return jsonError(400, "invalid_input", t.common.invalidInput);
  if (file.size > MAX_IMPORT_BYTES) return jsonError(413, "too_large", t.import.errors.too_large);
  const { source, mode } = parsed.data;

  const limited = tooManyRequests(
    mode === "import" ? rateLimit(`import:${ws}`, IMPORTS_PER_HOUR, 3_600_000) : rateLimit(`import-preview:${ws}`, PREVIEWS_PER_HOUR, 3_600_000),
  );
  if (limited) return limited;

  const read = readImportFile(source, new Uint8Array(await file.arrayBuffer()));
  if (!read.ok) return jsonError(422, read.error, t.import.errors[read.error](SOURCE_NAMES[source]));
  const plan = buildPlan(read.file, await listImportMembers(ws), SOURCE_NAMES[source]);

  if (mode === "preview") {
    // Notion names files "Tasks 1a2b…(32 hex)[_all].csv".
    const fromFile = file.name.replace(/\.[^.]+$/, "").replace(/(\s[0-9a-f]{32})?(_all)?$/i, "");
    const name = (read.file.projectName || fromFile).slice(0, 100).trim() || "Import";
    return json({ preview: plan.preview, suggestion: { name, key: await freeKey(ws, read.file.projectKey, name), color: PALETTE.indigo } });
  }

  const tgt = target.safeParse({ name: form?.get("name"), key: form?.get("key"), color: form?.get("color") ?? PALETTE.indigo });
  if (!tgt.success) return jsonError(400, "invalid_input", t.validation(tgt.error.issues[0]!.message));
  try {
    const result = await runImport({ workspaceId: ws, userId: r.ctx.user.id }, { ...tgt.data, source: SOURCE_NAMES[source] }, plan);
    console.info("import done", { workspaceId: ws, source, tickets: result.tickets });
    return json({ ...result, url: `/${r.ctx.workspace.slug}/p/${result.projectKey}` });
  } catch (e) {
    if (e instanceof ImportError) return jsonError(409, e.code, t.explorer.keyTaken(tgt.data.key));
    throw e;
  }
}
