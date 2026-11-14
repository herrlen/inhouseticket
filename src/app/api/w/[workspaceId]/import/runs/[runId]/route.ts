import { after } from "next/server";
import { z } from "zod";
import { findCsvRun } from "@/db/queries/clickup-import";
import { json, jsonError, requireApiMember } from "@/lib/api";
import { hasRole } from "@/lib/authz";
import { runCsvImport } from "@/lib/integrations/csv-import";

type Ctx = { params: Promise<{ workspaceId: string; runId: string }> };

/**
 * Progress of a CSV import (polled by the import page). A run nobody works on – the server
 * restarted, the poller has not come by yet – is picked up again here. Admins only.
 */
export async function GET(_: Request, { params }: Ctx) {
  const { workspaceId, runId } = await params;
  const r = await requireApiMember(workspaceId);
  if ("error" in r) return r.error;
  if (!hasRole(r.ctx, "admin") || !z.uuid().safeParse(runId).success) return jsonError(404, "not_found", "Nicht gefunden.");
  const run = await findCsvRun(r.ctx.workspace.id, runId);
  if (!run) return jsonError(404, "not_found", "Nicht gefunden.");
  if (!run.finishedAt && !run.running) {
    after(() => runCsvImport(run.integrationId).catch((e: unknown) => console.error("csv import: resume failed", e instanceof Error ? e.message.slice(0, 80) : "unknown")));
  }
  return json({ run: { ...run, integrationId: undefined } });
}
