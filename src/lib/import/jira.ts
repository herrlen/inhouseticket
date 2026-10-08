// Jira CSV export ("Export → CSV (all fields)" / "Excel CSV (all fields)"). Multi-value fields
// (Labels, Comment, Sub-tasks) repeat their column name; header names depend on the export
// language, so English and German names are both accepted.

import {
  guessCategory,
  mapCategoryWord,
  mapPriority,
  parseDate,
  toDueDate,
  type SourceComment,
  type SourceError,
  type SourceFile,
  type SourceTicket,
} from "./source";

const COLUMNS = {
  summary: ["summary", "zusammenfassung"],
  key: ["issue key", "vorgangsschlüssel", "schlüssel"],
  id: ["issue id", "vorgangs-id", "vorgangs id"],
  type: ["issue type", "vorgangstyp"],
  status: ["status"],
  statusCategory: ["status category", "statuskategorie"],
  priority: ["priority", "priorität"],
  assignee: ["assignee", "bearbeiter", "zugewiesene person"],
  created: ["created", "erstellt"],
  resolved: ["resolved", "erledigt", "gelöst"],
  due: ["due date", "due", "fälligkeitsdatum", "fällig am"],
  labels: ["labels", "stichwörter"],
  description: ["description", "beschreibung"],
  parent: ["parent id", "parent", "übergeordnet", "übergeordnete id"],
  comment: ["comment", "kommentar"],
  projectKey: ["project key", "projektschlüssel"],
  projectName: ["project name", "projektname"],
} as const;

type Field = keyof typeof COLUMNS;

const SUBTASK_TYPE = /^(sub-?task|unteraufgabe|teilaufgabe)$/i;

/** Jira comment cell: "08/Oct/26 12:33 PM;<account id>;<text>". Anything else is plain text. */
export function parseJiraComment(cell: string): SourceComment | null {
  const text = cell.trim();
  if (!text) return null;
  const parts = /^([^;]{6,30});([^;]*);([\s\S]*)$/.exec(text);
  if (parts) {
    const createdAt = parseDate(parts[1]!);
    if (createdAt) return parts[3]!.trim() ? { body: parts[3]!.trim(), createdAt } : null;
  }
  return { body: text, createdAt: null };
}

export function readJira(rows: string[][]): { ok: true; file: SourceFile } | { ok: false; error: SourceError } {
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const cols = {} as Record<Field, number[]>;
  for (const field of Object.keys(COLUMNS) as Field[]) {
    const names: readonly string[] = COLUMNS[field];
    // First matching alias wins, so "parent id" is preferred over "parent".
    const name = names.find((n) => header.includes(n));
    cols[field] = name ? header.flatMap((h, i) => (h === name ? [i] : [])) : [];
  }
  if (cols.summary.length === 0 || (cols.key.length === 0 && cols.id.length === 0)) return { ok: false, error: "not_this_tool" };

  const one = (row: string[], f: Field) => (cols[f][0] === undefined ? "" : (row[cols[f][0]!] ?? "").trim());
  const many = (row: string[], f: Field) => cols[f].map((i) => (row[i] ?? "").trim()).filter(Boolean);

  type Parsed = SourceTicket & { id: string; parent: string; isSubtask: boolean; projectKey: string; projectName: string };
  const parsed: Parsed[] = [];
  for (const row of rows.slice(1)) {
    const title = one(row, "summary");
    const statusName = one(row, "status");
    const category = mapCategoryWord(one(row, "statusCategory")) ?? guessCategory(statusName);
    const createdAt = parseDate(one(row, "created"));
    parsed.push({
      ref: one(row, "key") || one(row, "id"),
      id: one(row, "id"),
      parent: one(row, "parent"),
      isSubtask: SUBTASK_TYPE.test(one(row, "type")),
      projectKey: one(row, "projectKey"),
      projectName: one(row, "projectName"),
      title,
      description: one(row, "description"),
      statusName,
      category,
      priority: mapPriority(one(row, "priority")),
      assignee: one(row, "assignee"),
      dueDate: toDueDate(one(row, "due")),
      labels: many(row, "labels").flatMap((l) => l.split(/\s+/)),
      subtasks: [],
      comments: many(row, "comment").map(parseJiraComment).filter((c): c is SourceComment => c !== null),
      createdAt,
      completedAt: category === "done" ? (parseDate(one(row, "resolved")) ?? createdAt) : null,
    });
  }

  // Sub-tasks become subtasks of their parent (one level, like inhouseticket); without a
  // parent in the file they stay tickets.
  const byRef = new Map<string, Parsed>();
  for (const t of parsed) {
    if (t.id) byRef.set(t.id, t);
    if (t.ref) byRef.set(t.ref, t);
  }
  const tickets: Parsed[] = [];
  for (const t of parsed) {
    const parent = t.isSubtask && t.parent ? byRef.get(t.parent) : undefined;
    if (parent && !parent.isSubtask) parent.subtasks.push({ title: t.title, done: t.category === "done" });
    else tickets.push(t);
  }

  const projects = new Set(parsed.map((t) => t.projectKey).filter(Boolean));
  const first = parsed.find((t) => t.projectKey || t.projectName);
  return {
    ok: true,
    file: {
      projectName: first?.projectName ?? "",
      projectKey: first?.projectKey ?? "",
      projectCount: Math.max(projects.size, 1),
      tickets,
    },
  };
}
