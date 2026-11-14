// ClickUp CSV export (workspace export under Settings → Import/Export, or "Export view" of a
// table view), checked against a real 17,806-row workspace export (2026-11-14). Every row becomes
// the same ExternalTask the API connector produces, so the import writes through the sync writer
// (src/db/queries/integration-sync.ts) – one mapping for both ways in.
//
// Shape of the export: dates as epoch ms ("Date Created") plus "… Text" columns
// ("10/15/2025, 9:30:00 AM GMT+2"), the text "null" for empty, Assignees/Tags as "[a, b]",
// Folder Name/Path as a JSON array, Checklists as {"<name>": ["item", …]}, Comments as
// [{text, by, date, resolved, assigned}], Attachments as [{title, url}]. Names come
// HTML-escaped (&quot;). No Space ID, no e-mails, no "date closed".

import { MAX_CLICKUP_CSV_ROWS } from "../limits";
import type { ExternalChecklist, ExternalComment, ExternalPerson, ExternalTask } from "../integrations/types";
import { csvRows } from "./csv-parse";
import { mapPriority, parseDate, type SourceError } from "./source";

const COLUMNS = {
  id: ["task id", "id"],
  customId: ["task custom id", "custom task id"],
  link: ["task link", "url"],
  type: ["task type"],
  name: ["task name", "name"],
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
  folder: ["folder name/path", "folder name", "folder"],
  space: ["space name", "space"],
  comments: ["comments"],
  checklists: ["checklists"],
  attachments: ["attachments"],
} as const;

type Field = keyof typeof COLUMNS;

const SOURCE = "ClickUp";

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

/** ClickUp escapes names and checklist items as HTML ("&quot;"). */
export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/**
 * Epoch ms/s, or a text date ("10/15/2025, 9:30:00 AM GMT+2" – the offset is honoured,
 * without one the time counts as UTC). "null" and "" → null.
 */
export function parseClickUpDate(value: string): Date | null {
  const v = value.trim();
  if (!v || v === "null") return null;
  if (/^\d{12,13}$/.test(v)) return new Date(Number(v));
  if (/^\d{9,10}$/.test(v)) return new Date(Number(v) * 1000);
  const date = parseDate(v);
  if (!date) return null;
  const tz = /(?:GMT|UTC)\s*([+-])(\d{1,2})(?::?(\d{2}))?\b/i.exec(v);
  if (!tz) return date;
  const minutes = (Number(tz[2]) * 60 + Number(tz[3] ?? 0)) * (tz[1] === "-" ? -1 : 1);
  return new Date(date.getTime() - minutes * 60_000);
}

/** "[Ina Example, Tom]", '["a","b"]' or "Ina Example, Tom" → ["Ina Example", "Tom"]. */
export function parseList(value: string): string[] {
  const v = value.trim();
  if (v.startsWith("[")) {
    const json = tryJson(v);
    if (Array.isArray(json)) return json.map((s) => decodeEntities(String(s)).trim()).filter(Boolean);
  }
  return v
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => decodeEntities(s.trim().replace(/^["']|["']$/g, "")).trim())
    .filter(Boolean);
}

/** ClickUp priority: 1 = urgent … 4 = low, or words ("urgent", "normal"); "null" → none. */
export function mapClickUpPriority(value: string): number {
  const v = value.trim();
  const n = { "1": 4, "2": 3, "3": 2, "4": 1 }[v];
  return n ?? mapPriority(v === "null" ? "" : v);
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

/** FNV-1a, hex – stable ids for comments, which have none in the export. */
function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Person known only by name (the export has no ids and no e-mails). */
export function personByName(name: string): ExternalPerson {
  return { id: `name:${name.trim().toLowerCase()}`.slice(0, 100), name: name.trim(), email: null };
}

/**
 * Comments of one task. The ids are derived from task, position and content, so importing the
 * same file again finds them again. Plain text (other export paths) becomes one comment.
 */
export function parseClickUpComments(value: string, taskId: string): ExternalComment[] {
  const v = value.trim();
  if (!v || v === "[]" || v === "null") return [];
  const json = tryJson(v);
  const items: unknown[] = Array.isArray(json) ? json : [v];
  return items.flatMap((c, i): ExternalComment[] => {
    let body = "";
    let by = "";
    let date: unknown;
    if (typeof c === "string") body = c.trim();
    else if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      body = text(o, "text", "comment_text", "comment", "body");
      by = typeof o.by === "string" ? o.by : text((o.user ?? {}) as Record<string, unknown>, "username", "name");
      date = o.date ?? o.date_created ?? o.created;
    }
    body = decodeEntities(body).trim();
    if (!body) return [];
    const createdAt = date === undefined || date === null ? null : parseClickUpDate(String(date));
    const author = by.trim() ? personByName(decodeEntities(by)) : null;
    return [{ id: `csv:${taskId}:${i}:${hash(`${String(date ?? "")}|${by}|${body}`)}`.slice(0, 100), body, author, createdAt }];
  });
}

/** {"Checklist": ["a", "b"]} (workspace export) or [{name, items: [{name, resolved}]}] (API shape). */
export function parseClickUpChecklists(value: string): ExternalChecklist[] {
  const v = value.trim();
  if (!v || v === "[]" || v === "{}" || v === "null") return [];
  const json = tryJson(v);
  if (Array.isArray(json)) {
    return json.flatMap((list): ExternalChecklist[] => {
      if (!list || typeof list !== "object") return [];
      const o = list as Record<string, unknown>;
      const items = (Array.isArray(o.items) ? o.items : []).flatMap((it) => {
        if (typeof it === "string") return it.trim() ? [{ name: decodeEntities(it.trim()), done: false }] : [];
        if (!it || typeof it !== "object") return [];
        const i = it as Record<string, unknown>;
        const name = decodeEntities(text(i, "name", "text"));
        return name ? [{ name, done: i.resolved === true || i.checked === true }] : [];
      });
      return items.length ? [{ name: decodeEntities(text(o, "name", "title")), items }] : [];
    });
  }
  if (json && typeof json === "object") {
    return Object.entries(json as Record<string, unknown>).flatMap(([name, items]): ExternalChecklist[] => {
      const list = (Array.isArray(items) ? items : [])
        .map((s) => decodeEntities(String(s)).trim())
        .filter(Boolean)
        .map((n) => ({ name: n, done: false }));
      return list.length ? [{ name: decodeEntities(name), items: list }] : [];
    });
  }
  return [];
}

/** Attachments as Markdown links (http/https only); files are not downloaded. */
export function attachmentLinks(value: string): string[] {
  const v = value.trim();
  if (!v || v === "[]" || v === "null") return [];
  const json = tryJson(v);
  if (!Array.isArray(json)) return [];
  return json.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const o = a as Record<string, unknown>;
    const url = text(o, "url");
    if (!/^https?:\/\/\S+$/i.test(url)) return [];
    const title = decodeEntities(text(o, "title", "name")).replace(/[[\]]/g, "").replace(/\s+/g, " ").trim() || url;
    return [`- [${title}](${url.replace(/\)/g, "%29")})`];
  });
}

/** Folder path: '["Marketing"]' or '["A","B"]' → "Marketing" / "A / B"; empty for folderless lists. */
export function folderName(value: string): string | null {
  const v = value.trim();
  if (!v || v === "[]" || v === "null") return null;
  const json = tryJson(v);
  const parts = Array.isArray(json) ? json.map((s) => decodeEntities(String(s)).trim()).filter(Boolean) : [decodeEntities(v)];
  return parts.join(" / ") || null;
}

/** Project key of a space: the CSV has only the name (the API connector uses the space id). */
export function csvSpaceId(spaceName: string): string {
  return `csv:${spaceName.replace(/\s+/g, " ").trim().toLowerCase()}`.slice(0, 100);
}

export type ClickUpCsvTask = {
  task: ExternalTask;
  /** Space name for the project (the task only carries csvSpaceId()). */
  spaceName: string;
  comments: ExternalComment[];
  attachments: number;
};

export type ClickUpCsvSkip = "no_id" | "no_title";

export type ClickUpCsvStats = { rows: number; duplicates: number; skipped: Record<ClickUpCsvSkip, number> };

/** Thrown while iterating when the file has more rows than MAX_CLICKUP_CSV_ROWS. */
export class CsvRowLimitError extends Error {
  constructor() {
    super("too_many_rows");
  }
}

export type ClickUpCsv = { ok: true; tasks: Generator<ClickUpCsvTask>; stats: ClickUpCsvStats } | { ok: false; error: SourceError };

/**
 * Opens a ClickUp export. `tasks` yields one task per unique Task ID (identical duplicate rows of
 * the workspace export are dropped), lazily – `stats` is complete once the generator is through.
 */
export function readClickUpCsv(input: string, maxRows = MAX_CLICKUP_CSV_ROWS): ClickUpCsv {
  const rows = csvRows(input);
  const first = rows.next();
  if (first.done) return { ok: false, error: "empty" };
  const header = first.value.map((h) => h.trim().toLowerCase());
  const col = {} as Record<Field, number | undefined>;
  for (const field of Object.keys(COLUMNS) as Field[]) {
    const names: readonly string[] = COLUMNS[field];
    const name = names.find((n) => header.includes(n));
    col[field] = name === undefined ? undefined : header.indexOf(name);
  }
  if (col.id === undefined || col.name === undefined || col.status === undefined) return { ok: false, error: "not_this_tool" };

  const stats: ClickUpCsvStats = { rows: 0, duplicates: 0, skipped: { no_id: 0, no_title: 0 } };

  function* tasks(): Generator<ClickUpCsvTask> {
    const seen = new Set<string>();
    for (const row of rows) {
      if (++stats.rows > maxRows) throw new CsvRowLimitError();
      const get = (f: Field) => {
        const v = col[f] === undefined ? "" : (row[col[f]!] ?? "").trim();
        return v === "null" ? "" : v;
      };
      const id = get("id");
      if (!id) {
        stats.skipped.no_id++;
        continue;
      }
      if (seen.has(id)) {
        stats.duplicates++;
        continue;
      }
      seen.add(id);
      const title = decodeEntities(get("name")).replace(/\s+/g, " ").trim();
      if (!title) {
        stats.skipped.no_title++;
        continue;
      }
      const links = attachmentLinks(get("attachments"));
      const content = decodeEntities(get("content")).trim();
      const description = [content, links.length ? `**Anhänge (aus ${SOURCE}):**\n${links.join("\n")}` : ""].filter(Boolean).join("\n\n");
      const createdAt = parseClickUpDate(get("created"));
      const spaceName = decodeEntities(get("space") || get("list") || SOURCE).replace(/\s+/g, " ").trim();
      const listName = decodeEntities(get("list")).trim() || null;
      yield {
        spaceName,
        attachments: links.length,
        comments: parseClickUpComments(get("comments"), id),
        task: {
          id,
          ref: get("customId") || id,
          url: /^https:\/\/\S+$/.test(get("link")) ? get("link") : null,
          title,
          description,
          status: { name: decodeEntities(get("status")), type: "", color: null },
          priority: mapClickUpPriority(get("priority")),
          // inhouseticket has one assignee per ticket: the first one wins.
          assignees: parseList(get("assignees")).slice(0, 1).map(personByName),
          tags: parseList(get("tags")),
          parentId: get("parent") || null,
          spaceId: csvSpaceId(spaceName),
          listId: null,
          listName,
          folderName: folderName(get("folder")),
          milestone: get("type").toLowerCase() === "milestone",
          checklists: parseClickUpChecklists(get("checklists")),
          createdAt,
          updatedAt: null,
          doneAt: parseClickUpDate(get("closed")) ?? createdAt,
          dueAt: parseClickUpDate(get("due")),
        },
      };
    }
  }

  return { ok: true, tasks: tasks(), stats };
}
