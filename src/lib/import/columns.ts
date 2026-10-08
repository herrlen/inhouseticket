// Column detection for tools with free column names (Notion, monday.com). Matches common English
// and German names; the preview lists what was used, so a wrong guess is visible before import.

import { guessCategory, mapCategoryWord, parseDate, type Category, type ColumnField } from "./source";

const ALIASES: Record<ColumnField, readonly string[]> = {
  title: ["name", "title", "titel", "task", "task name", "aufgabe", "item", "element", "ticket"],
  status: ["status", "state", "stage", "phase", "zustand"],
  priority: ["priority", "priorität", "prio", "dringlichkeit"],
  assignee: ["assignee", "assignees", "assigned to", "owner", "person", "people", "zuständig", "zuständige person", "verantwortlich", "bearbeiter", "besitzer"],
  due: ["due", "due date", "deadline", "date", "timeline", "fällig", "fälligkeit", "fälligkeitsdatum", "fällig am", "datum", "zeitleiste", "frist"],
  labels: ["tags", "tag", "labels", "label", "stichwörter", "schlagwörter", "kategorie", "category", "type", "typ"],
  description: ["description", "beschreibung", "notes", "notizen", "text", "details", "content", "inhalt"],
  created: ["created", "created time", "created at", "creation log", "erstellt", "erstellt am", "erstellungszeit"],
  parent: ["parent item", "parent", "parent task", "übergeordnetes element", "übergeordnet", "übergeordnete aufgabe"],
  subtasks: ["sub-items", "subitems", "sub-tasks", "subtasks", "unterelemente", "unteraufgaben"],
  done: ["done", "erledigt", "completed", "abgeschlossen", "fertig", "complete"],
};

export type Columns = Partial<Record<ColumnField, number>>;

/** Finds a column per field; the first alias in the list wins, each column is used once. */
export function detectColumns(header: string[]): Columns {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const used = new Set<number>();
  const cols: Columns = {};
  for (const field of Object.keys(ALIASES) as ColumnField[]) {
    for (const alias of ALIASES[field]) {
      const i = norm.findIndex((h, idx) => h === alias && !used.has(idx));
      if (i >= 0) {
        cols[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return cols;
}

export function describeColumns(header: string[], cols: Columns): Array<{ field: ColumnField; column: string }> {
  return (Object.entries(cols) as Array<[ColumnField, number]>).map(([field, i]) => ({ field, column: header[i]!.trim() }));
}

/** Notion relation cells: "Login (https://www.notion.so/…)" → "Login"; several are comma-separated. */
export function stripLinks(value: string): string[] {
  return value
    .split(/,(?![^(]*\))/)
    .map((s) => s.replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim())
    .filter(Boolean);
}

/** Date ranges ("2026-10-01 → 2026-10-08", "2026-10-01 - 2026-10-08"): the end is the due date. */
export function dueFromCell(value: string): string | null {
  const parts = value.split(/\s+(?:→|->|–|-|bis|to)\s+/);
  return parseDate(parts[parts.length - 1]!)?.toISOString().slice(0, 10) ?? null;
}

export function createdFromCell(value: string): Date | null {
  return parseDate(value.split(/\s+(?:→|->|–|-|bis|to)\s+/)[0]!);
}

const YES = /^(yes|ja|true|wahr|x|✓|✔|1|checked|__yes__)$/i;

/** Category from status (word or name) and an optional done checkbox. */
export function categoryOf(status: string, doneCell: string | undefined): Category {
  if (doneCell !== undefined && YES.test(doneCell.trim())) return "done";
  if (!status && doneCell !== undefined) return "open";
  return mapCategoryWord(status) ?? guessCategory(status);
}

/** Comma- or semicolon-separated people, tags: "Ina Example, Tom" → ["Ina Example", "Tom"]. */
export function splitValues(value: string): string[] {
  return stripLinks(value.replace(/;/g, ",")).flatMap((s) => s.split(/\s*,\s*/)).map((s) => s.trim()).filter(Boolean);
}
