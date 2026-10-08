// Notion database export ("Export → Markdown & CSV"): the CSV inside the ZIP, one row per page.
// Column names are whatever the database uses; the first column is always the title. Page
// content is not in the CSV. Sub-items reference their parent by title ("Parent item").

import { categoryOf, createdFromCell, describeColumns, detectColumns, dueFromCell, splitValues, stripLinks } from "./columns";
import { mapPriority, type SourceError, type SourceFile, type SourceTicket } from "./source";

const REF = ["id", "task id", "ticket id"];

export function readNotion(rows: string[][]): { ok: true; file: SourceFile } | { ok: false; error: SourceError } {
  const header = rows[0]!;
  const cols = detectColumns(header);
  // Notion puts the title property first; use it when its name is unusual.
  cols.title ??= 0;
  if (header.length < 2) return { ok: false, error: "not_this_tool" };
  const refCol = header.findIndex((h) => REF.includes(h.trim().toLowerCase()));
  const get = (row: string[], i: number | undefined) => (i === undefined || i < 0 ? "" : (row[i] ?? "").trim());

  type Parsed = SourceTicket & { parents: string[]; children: string[] };
  const parsed: Parsed[] = rows.slice(1).map((row) => {
    const statusName = get(row, cols.status);
    const category = categoryOf(statusName, cols.done === undefined ? undefined : get(row, cols.done));
    const createdAt = createdFromCell(get(row, cols.created));
    return {
      ref: get(row, refCol),
      title: get(row, cols.title),
      description: get(row, cols.description),
      statusName: statusName || (category === "done" ? "Erledigt" : ""),
      category,
      priority: mapPriority(get(row, cols.priority)),
      assignee: splitValues(get(row, cols.assignee))[0] ?? "",
      dueDate: dueFromCell(get(row, cols.due)),
      labels: splitValues(get(row, cols.labels)),
      subtasks: [],
      comments: [],
      createdAt,
      completedAt: category === "done" ? createdAt : null,
      parents: stripLinks(get(row, cols.parent)),
      children: stripLinks(get(row, cols.subtasks)),
    };
  });

  // Parent by "Parent item" or by being listed in another row's "Sub-items" (titles, first match).
  const byTitle = new Map<string, Parsed>();
  for (const t of parsed) if (!byTitle.has(t.title)) byTitle.set(t.title, t);
  const parentOf = new Map<Parsed, Parsed>();
  for (const t of parsed) {
    const p = t.parents.map((n) => byTitle.get(n)).find((x) => x && x !== t);
    if (p) parentOf.set(t, p);
    for (const c of t.children) {
      const child = byTitle.get(c);
      if (child && child !== t && !parentOf.has(child)) parentOf.set(child, t);
    }
  }
  const top = (t: Parsed) => {
    let cur = t;
    for (let i = 0; parentOf.has(cur) && i < 20; i++) cur = parentOf.get(cur)!;
    return cur;
  };
  const tickets: Parsed[] = [];
  for (const t of parsed) {
    const root = parentOf.has(t) ? top(t) : t;
    if (root !== t) root.subtasks.push({ title: t.title, done: t.category === "done" });
    else tickets.push(t);
  }

  return { ok: true, file: { projectName: "", projectKey: "", projectCount: 1, tickets, columns: describeColumns(header, cols) } };
}
