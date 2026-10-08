// monday.com board export (Excel, saved as CSV). The sheet is not a plain table: board name in
// the first row, then per group a title row, a header row and the items; subitems follow their
// item under their own header row. Column names are the board's own.

import { categoryOf, createdFromCell, describeColumns, detectColumns, dueFromCell, splitValues, type Columns } from "./columns";
import { mapPriority, type SourceError, type SourceFile, type SourceTicket } from "./source";

const REF = ["item id", "item id (auto generated)", "id"];
const KNOWN = /^(status|person|people|owner|date|datum|priority|priorität|timeline|zeitleiste|due date|fälligkeitsdatum|subitems|unterelemente)$/i;

const filled = (row: string[]) => row.filter((c) => c.trim() !== "");

/** A header row: has a "Name" cell and at least one other typical monday column. */
function isHeader(row: string[]): boolean {
  return row.some((c) => /^(name|item|element)$/i.test(c.trim())) && row.some((c) => KNOWN.test(c.trim()));
}

export function readMonday(rows: string[][]): { ok: true; file: SourceFile } | { ok: false; error: SourceError } {
  const first = rows.findIndex(isHeader);
  if (first < 0) return { ok: false, error: "not_this_tool" };
  const header = rows[first]!;
  const cols: Columns = detectColumns(header);
  if (cols.title === undefined) return { ok: false, error: "not_this_tool" };
  const nameCol = cols.title;
  const refCol = header.findIndex((h) => REF.includes(h.trim().toLowerCase()));
  // Single-cell rows above the first header: the board name, then (if any) the first group.
  const titles = rows.slice(0, first).map(filled).filter((r) => r.length === 1).map((r) => r[0]!.trim());
  const boardName = titles[0] ?? "";

  const get = (row: string[], i: number | undefined) => (i === undefined || i < 0 ? "" : (row[i] ?? "").trim());
  const tickets: SourceTicket[] = [];
  let group = titles.length > 1 ? titles[titles.length - 1]! : "";
  let sub: { cols: Columns; nameCol: number } | null = null;

  const body = rows.slice(first + 1);
  const nextIsHeader = (i: number) => {
    const next = body.slice(i + 1).find((r) => filled(r).length > 0);
    return next !== undefined && isHeader(next);
  };
  for (const [i, row] of body.entries()) {
    const cells = filled(row);
    if (cells.length === 0) continue;
    if (isHeader(row)) {
      const c = detectColumns(row);
      const n = c.title ?? -1;
      // Same layout as the board header: next group. Shifted "Name": subitem header.
      sub = n === nameCol ? null : { cols: c, nameCol: n };
      continue;
    }
    const name = get(row, nameCol);
    if (cells.length === 1 && nextIsHeader(i)) {
      // Group title row: a single cell followed by the group's header row.
      group = cells[0]!.trim();
      continue;
    }
    if (sub && !name && get(row, sub.nameCol)) {
      const parent = tickets[tickets.length - 1];
      if (parent) {
        const status = get(row, sub.cols.status);
        parent.subtasks.push({ title: get(row, sub.nameCol), done: categoryOf(status, undefined) === "done" });
      }
      continue;
    }
    if (!name) continue;
    sub = null;

    const statusName = get(row, cols.status);
    const category = categoryOf(statusName, cols.done === undefined ? undefined : get(row, cols.done));
    const createdAt = createdFromCell(get(row, cols.created));
    tickets.push({
      ref: get(row, refCol),
      title: name,
      description: get(row, cols.description),
      statusName,
      category,
      priority: mapPriority(get(row, cols.priority)),
      assignee: splitValues(get(row, cols.assignee))[0] ?? "",
      dueDate: dueFromCell(get(row, cols.due)),
      labels: [...(group ? [group] : []), ...splitValues(get(row, cols.labels))],
      // The "Subitems" column on the item lists names only; real subitem rows replace it below.
      subtasks: splitValues(get(row, cols.subtasks)).map((title) => ({ title, done: false })),
      comments: [],
      createdAt,
      completedAt: category === "done" ? createdAt : null,
    });
  }

  // Where subitem rows exist they carry the status; drop the name-only duplicates from the column.
  for (const t of tickets) {
    const seen = new Set<string>();
    t.subtasks = t.subtasks.reverse().filter((s) => (seen.has(s.title) ? false : (seen.add(s.title), true))).reverse();
  }

  return { ok: true, file: { projectName: boardName, projectKey: "", projectCount: 1, tickets, columns: describeColumns(header, cols) } };
}
