import { decodeText, parseCsv } from "./csv-parse";
import { readClickUp } from "./clickup";
import { readJira } from "./jira";
import { MAX_IMPORT_TICKETS } from "./plan";
import type { SourceError, SourceFile, SourceId } from "./source";

// Generous row cap before mapping: sub-tasks also occupy rows, the ticket cap applies after.
const MAX_ROWS = MAX_IMPORT_TICKETS * 4;

/** Reads an uploaded export file of `source`. Only CSV for now (decided 2026-10-08). */
export function readImportFile(source: SourceId, bytes: Uint8Array): { ok: true; file: SourceFile } | { ok: false; error: SourceError } {
  const csv = parseCsv(decodeText(bytes), MAX_ROWS + 1);
  if (!csv.ok) return csv;
  if (csv.rows.length < 2) return { ok: false, error: "empty" };
  const result = source === "jira" ? readJira(csv.rows) : readClickUp(csv.rows);
  if (!result.ok) return result;
  if (result.file.tickets.length > MAX_IMPORT_TICKETS) return { ok: false, error: "too_many_tickets" };
  if (result.file.tickets.length === 0) return { ok: false, error: "empty" };
  return result;
}
