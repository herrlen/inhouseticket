import { after } from "next/server";
import { z } from "zod";
import { startClickUpCsvRun } from "@/db/queries/clickup-import";
import { json, jsonError, readJson, requireApiMember, requireSameOrigin, tooManyRequests } from "@/lib/api";
import { hasRole } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { runCsvImport } from "@/lib/integrations/csv-import";
import { STATUS_TARGETS, suggestStatus, targetCategory } from "@/lib/integrations/mapping";
import { rateLimit } from "@/lib/rate-limit";

const STARTS_PER_HOUR = 10;
/** The real export had 62 statuses; room for more, but bounded. */
const MAX_STATUSES = 500;

type Ctx = { params: Promise<{ workspaceId: string; uploadId: string }> };

const body = z.object({
  statuses: z.array(z.object({ name: z.string().trim().min(1).max(200), target: z.enum(STATUS_TARGETS) })).max(MAX_STATUSES),
});

/** Starts the background import of an upload with the status choices of the preview. Admins only. */
export async function POST(request: Request, { params }: Ctx) {
  const blocked = await requireSameOrigin();
  if (blocked) return blocked;
  const { workspaceId, uploadId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!hasRole(r.ctx, "admin")) return jsonError(404, "not_found", "Nicht gefunden.");
  const ws = r.ctx.workspace.id;
  const t = await getT();
  if (!z.uuid().safeParse(uploadId).success) return jsonError(404, "not_found", t.import.clickup.errors.not_found);
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(400, "invalid_input", t.common.invalidInput);
  const limited = tooManyRequests(rateLimit(`import-clickup-start:${ws}`, STARTS_PER_HOUR, 3_600_000));
  if (limited) return limited;

  const statuses = parsed.data.statuses.map((s) => ({
    name: s.name,
    target: s.target,
    category: s.target === "own" ? suggestStatus({ name: s.name, type: "" }).category : targetCategory(s.target, "open"),
  }));
  const started = await startClickUpCsvRun({ workspaceId: ws, userId: r.ctx.user.id }, uploadId, statuses);
  if (!started.ok) return jsonError(started.error === "busy" ? 409 : 404, started.error, t.import.clickup.errors[started.error]);
  console.info("clickup csv: import started", { workspaceId: ws, runId: started.runId });
  // Runs after the response; the integration's lease keeps it single (the poller resumes it after a restart).
  after(() => runCsvImport(started.integrationId).catch((e: unknown) => console.error("csv import: background run failed", e instanceof Error ? e.message.slice(0, 80) : "unknown")));
  return json({ runId: started.runId });
}
