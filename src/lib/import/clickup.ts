// ClickUp CSV export (workspace export under Settings → Import/Export, or "Export view" of a
// table view). Dates come as epoch milliseconds and/or "… Text" columns, multi-value fields
// (Assignees, Tags) as "[a, b]", Comments and Checklists as JSON. Parsed leniently: the exact
// shape varies between export paths and has not been checked against a real file yet.

import {
  guessCategory,
  mapPriority,
  parseDate,
  type SourceComment,
  type SourceError,
  type SourceFile,
  type SourceTicket,
} from "./source";

const COLUMNS = {
  name: ["task name", "name"],
  id: ["task id", "id"],
  customId: ["task custom id", "custom task id"],
  content: ["task content", "content", "description"],
  status: ["status"],
  priority: ["priority"],
  assignees: ["assignees", "assignee"],
  tags: ["tags"],
  created: ["date created", "date created text"],
  closed: ["date closed", "date done", "date closed text", "date done text"],
  due: ["due date", "due date text"],
  parent: ["parent id", "parent"],
  list: ["list name", "list"],
  comments: ["comments"],
  checklists: ["checklists"],
} as const;

type Field = keyof typeof COLUMNS;

/** Epoch ms/s, or any text format parseDate knows ("10/08/2026, 9:15:00 AM"). */
export function parseClickUpDate(value: string): Date | null {
  const v = value.trim();
  if (/^\d{12,13}$/.test(v)) return new Date(Number(v));
  if (/^\d{9,10}$/.test(v)) return new Date(Number(v) * 1000);
  return parseDate(v);
}

/** "[Ina Example, Tom]" or "Ina Example, Tom" → ["Ina Example", "Tom"]. */
export function parseList(value: string): string[] {
  const v = value.trim().replace(/^\[|\]$/g, "");
  return v
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

/** ClickUp priority: words ("urgent", "normal") or 1 = urgent … 4 = low. */
export function mapClickUpPriority(value: string): number {
  const v = value.trim();
  const n = { "1": 4, "2": 3, "3": 2, "4": 1 }[v];
  return n ?? mapPriority(v);
}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const text = (o: Record<string, unknown>, ...keys: string[]) =>
  keys.map((k) => o[k]).find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim() ?? "";

/** JSON array of comment objects, or plain text as one comment. */
export function parseClickUpComments(value: string): SourceComment[] {
  const v = value.trim();
  if (!v || v === "[]") return [];
  const json = tryJson(v);
  if (!Array.isArray(json)) return [{ body: v, createdAt: null }];
  return json.flatMap((c): SourceComment[] => {
    if (typeof c === "string") return c.trim() ? [{ body: c.trim(), createdAt: null }] : [];
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const body = text(o, "text", "comment_text", "comment", "body");
    const date = o.date ?? o.date_created ?? o.created;
    return body ? [{ body, createdAt: date === undefined ? null : parseClickUpDate(String(date)) }] : [];
  });
}

/** Checklists as a Markdown checklist for the description; unknown shapes are kept as text. */
export function checklistMarkdown(value: string): string {
  const v = value.trim();
  if (!v || v === "[]") return "";
  const json = tryJson(v);
  if (!Array.isArray(json)) return v;
  return json
    .flatMap((list) => {
      if (!list || typeof list !== "object") return [];
      const o = list as Record<string, unknown>;
      const items = Array.isArray(o.items) ? o.items : [];
      const lines = items.flatMap((it) => {
        if (!it || typeof it !== "object") return [];
        const i = it as Record<string, unknown>;
        const name = text(i, "name", "text");
        return name ? [`- [${i.resolved === true || i.checked === true ? "x" : " "}] ${name}`] : [];
      });
      const title = text(o, "name", "title");
      return lines.length ? [`${title ? `**${title}:**\n` : ""}${lines.join("\n")}`] : [];
    })
    .join("\n\n");
}

export function readClickUp(rows: string[][]): { ok: true; file: SourceFile } | { ok: false; error: SourceError } {
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = {} as Record<Field, number | undefined>;
  for (const field of Object.keys(COLUMNS) as Field[]) {
    const names: readonly string[] = COLUMNS[field];
    const name = names.find((n) => header.includes(n));
    col[field] = name === undefined ? undefined : header.indexOf(name);
  }
  if (col.name === undefined || col.id === undefined || col.status === undefined) return { ok: false, error: "not_this_tool" };

  const get = (row: string[], f: Field) => (col[f] === undefined ? "" : (row[col[f]!] ?? "").trim());

  type Parsed = SourceTicket & { id: string; parent: string; list: string };
  const parsed: Parsed[] = rows.slice(1).map((row) => {
    const statusName = get(row, "status");
    const category = guessCategory(statusName);
    const createdAt = parseClickUpDate(get(row, "created"));
    const checklist = checklistMarkdown(get(row, "checklists"));
    const content = get(row, "content");
    return {
      id: get(row, "id"),
      parent: get(row, "parent"),
      list: get(row, "list"),
      ref: get(row, "customId") || get(row, "id"),
      title: get(row, "name"),
      description: [content, checklist].filter(Boolean).join("\n\n"),
      statusName,
      category,
      priority: mapClickUpPriority(get(row, "priority")),
      // inhouseticket has one assignee per ticket: the first one wins.
      assignee: parseList(get(row, "assignees"))[0] ?? "",
      dueDate: parseClickUpDate(get(row, "due"))?.toISOString().slice(0, 10) ?? null,
      labels: parseList(get(row, "tags")),
      subtasks: [],
      comments: parseClickUpComments(get(row, "comments")),
      createdAt,
      completedAt: category === "done" ? (parseClickUpDate(get(row, "closed")) ?? createdAt) : null,
    };
  });

  // Subtasks (any depth in ClickUp) hang under their top-level task.
  const byId = new Map(parsed.filter((t) => t.id).map((t) => [t.id, t]));
  const root = (t: Parsed): Parsed | undefined => {
    let cur = t;
    for (let depth = 0; cur.parent && depth < 20; depth++) {
      const up = byId.get(cur.parent);
      if (!up) break;
      cur = up;
    }
    return cur === t ? undefined : cur;
  };
  const tickets: Parsed[] = [];
  for (const t of parsed) {
    const top = t.parent ? root(t) : undefined;
    if (top) top.subtasks.push({ title: t.title, done: t.category === "done" });
    else tickets.push(t);
  }

  const lists = new Set(parsed.map((t) => t.list).filter(Boolean));
  return {
    ok: true,
    file: {
      projectName: parsed.find((t) => t.list)?.list ?? "",
      projectKey: "",
      projectCount: Math.max(lists.size, 1),
      tickets,
    },
  };
}
