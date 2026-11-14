// Preview of a ClickUp CSV import: what the background run (src/lib/integrations/csv-import.ts)
// will create, counted in one streaming pass over the file. Pure – the route adds what only the
// database knows (tasks already imported or synced, the confirmed status mapping).

import { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "../limits";
import { nameResolver, suggestStatus, ticketFields, type StatusSuggestion, type StatusTarget } from "../integrations/mapping";
import { CsvRowLimitError, readClickUpCsv, type ClickUpCsvSkip } from "./clickup";
import type { Category, SourceError } from "./source";

/**
 * Rough write cost per task and per comment for "about N minutes". Measured 2026-11-14 against a
 * local Postgres: a real 17,120-task export (6,959 comments) took 230 s, about 13 ms per task;
 * rounded up a little for a shared database.
 */
const MS_PER_TASK = 15;
const MS_PER_COMMENT = 3;

export type ClickUpStatusRow = { name: string; count: number; target: StatusTarget; category: Category };

export type ClickUpPreview = {
  /** Tasks that already have a ticket (earlier import or API sync) – filled in by the route. */
  known: number;
  rows: number;
  duplicates: number;
  tasks: number;
  /** Tasks with a parent in the file → subtask tickets. */
  subtasks: number;
  /** Subtasks of subtasks: they hang under their top-most ancestor (one level in inhouseticket). */
  nestedSubtasks: number;
  /** Parent not in the file → stays a normal ticket. */
  orphanSubtasks: number;
  comments: number;
  checklistItems: number;
  /** Checklist items beyond MAX_SUBTASKS per ticket go into the description. */
  foldedChecklistItems: number;
  attachments: number;
  milestones: number;
  lists: number;
  folders: number;
  projects: Array<{ name: string; tickets: number }>;
  statuses: ClickUpStatusRow[];
  /** Assignees by name with the suggested member (saved choice, else exact name, else nobody). */
  people: Array<{ name: string; memberId: string | null; count: number }>;
  skipped: Array<{ reason: ClickUpCsvSkip; count: number }>;
  truncatedTitles: number;
  truncatedDescriptions: number;
  estimatedSeconds: number;
};

export type PreviewMember = { id: string; name: string };

/**
 * Counts everything the preview shows. `mappings` (lower-case ClickUp status → choice) are the
 * confirmed ones of the workspace's ClickUp connection; other statuses get the shared suggestion.
 * `people` (lower-case name → member id or null) are earlier choices for names.
 */
export function previewClickUpCsv(
  text: string,
  members: PreviewMember[],
  mappings: Map<string, StatusSuggestion> = new Map(),
  people: Map<string, string | null> = new Map(),
): { ok: true; preview: ClickUpPreview; taskIds: string[] } | { ok: false; error: SourceError } {
  const read = readClickUpCsv(text);
  if (!read.ok) return read;
  const memberOf = nameResolver(members, people);
  const p: ClickUpPreview = {
    known: 0, rows: 0, duplicates: 0, tasks: 0, subtasks: 0, nestedSubtasks: 0, orphanSubtasks: 0, comments: 0, checklistItems: 0,
    foldedChecklistItems: 0, attachments: 0, milestones: 0, lists: 0, folders: 0, projects: [], statuses: [], people: [],
    skipped: [], truncatedTitles: 0, truncatedDescriptions: 0, estimatedSeconds: 0,
  };
  const projects = new Map<string, { name: string; tickets: number }>();
  const statuses = new Map<string, { name: string; count: number }>();
  const assignees = new Map<string, { name: string; count: number }>();
  const lists = new Set<string>();
  const folders = new Set<string>();
  const parents = new Map<string, string | null>();

  try {
    for (const { task, spaceName, comments, attachments } of read.tasks) {
      p.tasks++;
      parents.set(task.id, task.parentId);
      const project = projects.get(task.spaceId) ?? { name: spaceName, tickets: 0 };
      project.tickets++;
      projects.set(task.spaceId, project);
      const key = task.status.name.trim().toLowerCase();
      const s = statuses.get(key) ?? { name: task.status.name.trim(), count: 0 };
      s.count++;
      statuses.set(key, s);
      const who = task.assignees[0]?.name;
      if (who) {
        const entry = assignees.get(who.toLowerCase()) ?? { name: who, count: 0 };
        entry.count++;
        assignees.set(who.toLowerCase(), entry);
      }
      if (task.listName) lists.add(`${task.spaceId}\u0000${task.listName}`);
      if (task.folderName) folders.add(`${task.spaceId}\u0000${task.folderName}`);
      p.comments += comments.length;
      p.attachments += attachments;
      if (task.milestone) p.milestones++;
      const items = task.checklists.reduce((n, c) => n + c.items.length, 0);
      p.checklistItems += items;
      p.foldedChecklistItems += Math.max(0, items - MAX_SUBTASKS);
      if (task.title.length > MAX_TITLE) p.truncatedTitles++;
      const fields = ticketFields(task, "ClickUp");
      if (fields?.description && fields.description.length >= MAX_DESCRIPTION && fields.description.endsWith("…")) p.truncatedDescriptions++;
    }
  } catch (e) {
    if (e instanceof CsvRowLimitError) return { ok: false, error: "too_many_rows" };
    throw e;
  }
  if (p.tasks === 0) return { ok: false, error: "empty" };

  for (const parent of parents.values()) {
    if (!parent) continue;
    if (!parents.has(parent)) {
      p.orphanSubtasks++;
      continue;
    }
    p.subtasks++;
    if (parents.get(parent)) p.nestedSubtasks++;
  }

  p.rows = read.stats.rows;
  p.duplicates = read.stats.duplicates;
  p.skipped = (Object.entries(read.stats.skipped) as Array<[ClickUpCsvSkip, number]>).filter(([, n]) => n > 0).map(([reason, count]) => ({ reason, count }));
  p.lists = lists.size;
  p.folders = folders.size;
  p.projects = [...projects.values()].sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name));
  p.statuses = [...statuses.entries()]
    .map(([key, s]) => ({ ...s, ...(mappings.get(key) ?? suggestStatus({ name: s.name, type: "" })) }))
    .sort((a, b) => b.count - a.count);
  p.people = [...assignees.values()]
    .map((x) => ({ name: x.name, memberId: memberOf(x.name), count: x.count }))
    .sort((a, b) => Number(a.memberId !== null) - Number(b.memberId !== null) || b.count - a.count);
  p.estimatedSeconds = Math.ceil((p.tasks * MS_PER_TASK + p.comments * MS_PER_COMMENT) / 1000);
  return { ok: true, preview: p, taskIds: [...parents.keys()] };
}
