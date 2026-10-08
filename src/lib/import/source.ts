// Tool-neutral shape of an import file and the value mappings every source shares
// (priority words, status categories, date formats). Source readers (jira.ts, …) produce
// a SourceFile; plan.ts turns it into what gets written.

export type SourceId = "jira";

export const SOURCE_NAMES: Record<SourceId, string> = { jira: "Jira" };

export type Category = "open" | "active" | "done";

export type SourceComment = { body: string; createdAt: Date | null };

export type SourceSubtask = { title: string; done: boolean };

export type SourceTicket = {
  /** Key or id in the old tool, e.g. "ABC-12"; shown in the activity log. */
  ref: string;
  title: string;
  description: string;
  statusName: string;
  category: Category;
  priority: number;
  /** Name or e-mail as the old tool exports it. */
  assignee: string;
  /** YYYY-MM-DD */
  dueDate: string | null;
  labels: string[];
  subtasks: SourceSubtask[];
  comments: SourceComment[];
  createdAt: Date | null;
  completedAt: Date | null;
};

export type SourceFile = {
  projectName: string;
  projectKey: string;
  /** Distinct projects in the file – more than one is imported into one project for now. */
  projectCount: number;
  tickets: SourceTicket[];
};

export type SourceError = "empty" | "too_many_rows" | "not_this_tool" | "too_many_tickets";

// ---------------------------------------------------------------------------
// Value mappings
// ---------------------------------------------------------------------------

const PRIORITY_WORDS: Array<[RegExp, number]> = [
  [/^(highest|blocker|critical|urgent|höchste|hoechste|kritisch|dringend|sehr hoch)$/, 4],
  [/^(high|major|hoch)$/, 3],
  [/^(medium|normal|mittel)$/, 2],
  [/^(low|lowest|minor|trivial|niedrig|niedrigste|gering)$/, 1],
];

/** Priority word of another tool → 0 (none) … 4 (urgent). Unknown words → none. */
export function mapPriority(value: string): number {
  const v = value.trim().toLowerCase();
  if (!v) return 0;
  return PRIORITY_WORDS.find(([re]) => re.test(v))?.[1] ?? 0;
}

/** Status category from an explicit category column ("To Do", "In Progress", "Done"). */
export function mapCategoryWord(value: string): Category | null {
  const v = value.trim().toLowerCase();
  if (/^(to do|todo|new|offen|zu erledigen|aufgaben|backlog)$/.test(v)) return "open";
  if (/^(in progress|indeterminate|in arbeit|in bearbeitung)$/.test(v)) return "active";
  if (/^(done|complete|completed|closed|fertig|erledigt|abgeschlossen)$/.test(v)) return "done";
  return null;
}

/** Best guess from a status name when the file has no category column. */
export function guessCategory(statusName: string): Category {
  const v = statusName.trim().toLowerCase();
  if (/(done|closed|resolved|complete|fertig|erledigt|geschlossen|gelöst|abgeschlossen|won't|wont|cancel|abgebrochen|verworfen)/.test(v)) return "done";
  if (/(progress|doing|review|test|qa|arbeit|bearbeitung|prüf|pruef|freigabe|blocked|blockiert|warte)/.test(v)) return "active";
  return "open";
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mär: 3, mrz: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
};

function year(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/**
 * Parses the date formats the supported tools export, as UTC:
 * ISO "2026-10-08[ 12:33]", Jira "08/Oct/26 12:33 PM", German "08.10.2026[ 12:33]",
 * US "10/08/2026" (ClickUp). Returns null for anything else.
 */
export function parseDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  let y: number, mo: number, d: number;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[/ -]([A-Za-zäÄ]{3})[a-zä]*\.?[/ -](\d{2}|\d{4})\b/.exec(v))) {
    const month = MONTHS[m[2]!.toLowerCase()];
    if (!month) return null;
    [y, mo, d] = [year(m[3]!), month, Number(m[1])];
  } else if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/.exec(v))) [y, mo, d] = [year(m[3]!), Number(m[2]), Number(m[1])];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(v))) [y, mo, d] = [Number(m[3]), Number(m[1]), Number(m[2])];
  else return null;

  let h = 0;
  let min = 0;
  const t = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(v.slice(m[0].length));
  if (t) {
    h = Number(t[1]);
    min = Number(t[2]);
    const ampm = t[3]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
  }
  const date = new Date(Date.UTC(y, mo - 1, d, h, min));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1990 || y > 2100) return null;
  return date;
}

export function toDueDate(value: string): string | null {
  return parseDate(value)?.toISOString().slice(0, 10) ?? null;
}
