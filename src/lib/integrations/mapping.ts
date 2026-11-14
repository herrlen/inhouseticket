// Value mappings from an external tool onto inhouseticket: status suggestions, people by e-mail,
// and the ticket fields of one task. Pure (no database, no framework) – the setup wizard shows the
// suggestions, the engine applies the confirmed mapping.

import { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "../limits";
import { guessCategory, mapCategoryWord, type Category } from "../import/source";
import { targetStatus, type DefaultStatusName } from "../import/plan";
import type { ExternalPerson, ExternalStatus, ExternalTask } from "./types";

/** Local side of a status mapping: one of the default statuses, or "own" (own status per project). */
export const STATUS_TARGETS = ["Offen", "In Arbeit", "Review", "Erledigt", "own"] as const;
export type StatusTarget = (typeof STATUS_TARGETS)[number];
export const isStatusTarget = (v: unknown): v is StatusTarget => typeof v === "string" && (STATUS_TARGETS as readonly string[]).includes(v);

export type StatusSuggestion = { target: StatusTarget; category: Category };

// Words the concept names explicitly (done/complete/closed/abgeschlossen, in progress/in
// bearbeitung, to do/open/neu/not started) plus the category words the CSV import already knows.
const SURE_DONE = /^(done|complete|completed|closed|abgeschlossen|erledigt|fertig)$/;
const SURE_ACTIVE = /^(in progress|in bearbeitung|in arbeit|doing)$/;
const SURE_OPEN = /^(to do|todo|open|neu|new|not started|offen|backlog)$/;

/**
 * Suggestion for one external status. ClickUp's status type decides where it is unambiguous
 * ("open" = first column, "closed"/"done" = finished); custom statuses map by name when the name
 * is clear, otherwise they become an own status (category guessed from the name).
 */
export function suggestStatus(status: Pick<ExternalStatus, "name" | "type">): StatusSuggestion {
  const name = status.name.trim().toLowerCase();
  const type = status.type.trim().toLowerCase();
  if (type === "closed" || type === "done" || SURE_DONE.test(name)) return { target: "Erledigt", category: "done" };
  if (type === "open" || SURE_OPEN.test(name)) return { target: "Offen", category: "open" };
  if (SURE_ACTIVE.test(name)) return { target: "In Arbeit", category: "active" };
  const word = mapCategoryWord(name);
  if (word) return { target: targetStatus(name, word), category: word };
  return { target: "own", category: guessCategory(name) };
}

/** Category of a mapped status (for "own": the suggested one). */
export function targetCategory(target: StatusTarget, ownCategory: Category): Category {
  if (target === "own") return ownCategory;
  return target === "Erledigt" ? "done" : target === "Offen" ? "open" : "active";
}

export const DEFAULT_STATUS_TARGETS: readonly DefaultStatusName[] = ["Offen", "In Arbeit", "Review", "Erledigt"];

export type LocalMember = { id: string; email: string; name: string };

/** People matched by e-mail (case-insensitive). Unmatched → null (ticket stays unassigned). */
export function matchPeople(people: ExternalPerson[], members: LocalMember[]): Map<string, string | null> {
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m.id]));
  return new Map(people.map((p) => [p.id, p.email ? (byEmail.get(p.email.toLowerCase()) ?? null) : null]));
}

const MAX_LABEL = 50;
export const MILESTONE_LABEL = "Meilenstein";

/** Labels of a task: tags, folder and list name (the place in ClickUp), "Meilenstein". Unique, ≤ 50 chars. */
export function taskLabels(task: ExternalTask): string[] {
  const out: string[] = [];
  const add = (raw: string | null) => {
    const name = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL).trim();
    if (name && !out.some((l) => l.toLowerCase() === name.toLowerCase())) out.push(name);
  };
  task.tags.forEach(add);
  add(task.folderName);
  add(task.listName);
  if (task.milestone) add(MILESTONE_LABEL);
  return out;
}

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

export type TicketFields = {
  title: string;
  description: string | null;
  priority: number;
  /** YYYY-MM-DD in Europe/Berlin (tickets store a due day, not an instant). */
  dueDate: string | null;
  /** First checklist items (≤ MAX_SUBTASKS) for the checklist table, only used when creating. */
  checklist: Array<{ title: string; done: boolean }>;
};

/**
 * Title, description, priority and due date of a task within the limits. Checklist items beyond
 * MAX_SUBTASKS go into the description as a Markdown checklist, so nothing is lost.
 */
export function ticketFields(task: ExternalTask, sourceName: string): TicketFields | null {
  const title = cut(task.title.replace(/\s+/g, " ").trim(), MAX_TITLE);
  if (!title) return null;
  const items = task.checklists.flatMap((c) => c.items).map((i) => ({ title: cut(i.name.replace(/\s+/g, " ").trim(), MAX_TITLE), done: i.done })).filter((i) => i.title);
  const checklist = items.slice(0, MAX_SUBTASKS);
  const folded = items.slice(MAX_SUBTASKS);
  let description = task.description.trim();
  if (folded.length) {
    const list = folded.map((s) => `- [${s.done ? "x" : " "}] ${s.title}`).join("\n");
    description = `${description}${description ? "\n\n" : ""}**Weitere Checklisten-Punkte (aus ${sourceName}):**\n${list}`;
  }
  return {
    title,
    description: description ? cut(description, MAX_DESCRIPTION) : null,
    priority: task.priority,
    dueDate: task.dueAt ? berlinDay(task.dueAt) : null,
    checklist,
  };
}

const BERLIN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day of an instant in Berlin, "YYYY-MM-DD". */
export function berlinDay(date: Date): string {
  return BERLIN_DAY.format(date);
}

export type HierarchyRef = { externalId: string; externalParentId: string | null; localId: string; projectId: string };

/**
 * Where a synced ticket belongs: inhouseticket has one subtask level under a story/task, ClickUp
 * nests up to seven. Every task hangs under its top-most synced ancestor ("root"), like the CSV
 * import folds subtasks of subtasks. No parent when the root is the task itself, the parent was
 * not synced (list not selected), the root sits in another project (other space) or the chain
 * loops (broken source data).
 * Returns local ticket id → desired parent ticket id (null = top level).
 */
export function desiredParents(refs: HierarchyRef[]): Map<string, string | null> {
  const byExternal = new Map(refs.map((r) => [r.externalId, r]));
  const out = new Map<string, string | null>();
  for (const r of refs) {
    let root = r;
    let cycle = false;
    const seen = new Set([r.externalId]);
    for (let up = r.externalParentId ? byExternal.get(r.externalParentId) : undefined; up; up = up.externalParentId ? byExternal.get(up.externalParentId) : undefined) {
      if (seen.has(up.externalId)) {
        cycle = true;
        break;
      }
      seen.add(up.externalId);
      root = up;
    }
    out.set(r.localId, !cycle && root !== r && root.projectId === r.projectId ? root.localId : null);
  }
  return out;
}
