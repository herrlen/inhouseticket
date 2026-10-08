// Turns a SourceFile into what gets written: limits from limits.ts applied, statuses mapped to
// the default statuses of a new project, people matched to members. Pure – the preview shows
// exactly this, and the import writes exactly this.

import { MAX_COMMENT, MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "@/lib/limits";
import { DEFAULT_STATUSES } from "@/lib/project-templates";
import type { Category, ColumnField, SourceFile, SourceSubtask } from "./source";

export const MAX_IMPORT_TICKETS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_LABEL = 50;
const PREVIEW_ROWS = 5;

export type DefaultStatusName = (typeof DEFAULT_STATUSES)[number]["name"];

export type PlannedTicket = {
  ref: string;
  title: string;
  description: string | null;
  status: DefaultStatusName;
  priority: number;
  assigneeId: string | null;
  dueDate: string | null;
  labels: string[];
  subtasks: SourceSubtask[];
  comments: Array<{ body: string; createdAt: Date | null }>;
  createdAt: Date | null;
  completedAt: Date | null;
};

export type ImportPreview = {
  projectName: string;
  projectKey: string;
  projectCount: number;
  tickets: number;
  subtasks: number;
  comments: number;
  labels: number;
  skipped: number;
  truncatedTitles: number;
  truncatedDescriptions: number;
  foldedSubtasks: number;
  statuses: Array<{ from: string; to: DefaultStatusName; count: number }>;
  people: Array<{ name: string; member: string | null; count: number }>;
  sample: Array<{ ref: string; title: string; status: DefaultStatusName; priority: number; assignee: string | null }>;
  /** Only for tools with free column names. */
  columns: Array<{ field: ColumnField; column: string }> | null;
};

export type ImportPlan = { tickets: PlannedTicket[]; preview: ImportPreview };

export type Member = { id: string; name: string; email: string };

function cut(text: string, max: number): [string, boolean] {
  return text.length > max ? [text.slice(0, max - 1).trimEnd() + "…", true] : [text, false];
}

/** Default status for a source status: done → Erledigt, review-like → Review, active → In Arbeit, else Offen. */
export function targetStatus(name: string, category: Category): DefaultStatusName {
  if (category === "done") return "Erledigt";
  if (category === "active") return /(review|prüf|pruef|freigabe|qa|test)/i.test(name) ? "Review" : "In Arbeit";
  return "Offen";
}

export function buildPlan(file: SourceFile, members: Member[], sourceName: string): ImportPlan {
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  const byName = new Map(members.map((m) => [m.name.trim().toLowerCase(), m]));
  const people = new Map<string, { member: Member | null; count: number }>();
  const statuses = new Map<string, { from: string; to: DefaultStatusName; count: number }>();
  const labelNames = new Set<string>();
  const p: ImportPreview = {
    projectName: file.projectName,
    projectKey: file.projectKey,
    projectCount: file.projectCount,
    tickets: 0, subtasks: 0, comments: 0, labels: 0, skipped: 0,
    truncatedTitles: 0, truncatedDescriptions: 0, foldedSubtasks: 0,
    statuses: [], people: [], sample: [],
    columns: file.columns ?? null,
  };

  const tickets: PlannedTicket[] = [];
  for (const t of file.tickets) {
    const rawTitle = t.title.replace(/\s+/g, " ").trim();
    if (!rawTitle) {
      p.skipped++;
      continue;
    }
    const [title, titleCut] = cut(rawTitle, MAX_TITLE);
    if (titleCut) p.truncatedTitles++;

    // Subtasks beyond the limit go into the description as a checklist, so nothing is lost.
    const subtasks = t.subtasks
      .map((s) => ({ title: cut(s.title.replace(/\s+/g, " ").trim(), MAX_TITLE)[0], done: s.done }))
      .filter((s) => s.title);
    const kept = subtasks.slice(0, MAX_SUBTASKS);
    const folded = subtasks.slice(MAX_SUBTASKS);
    p.subtasks += kept.length;
    p.foldedSubtasks += folded.length;
    let description = t.description.trim();
    if (folded.length) {
      const list = folded.map((s) => `- [${s.done ? "x" : " "}] ${s.title}`).join("\n");
      description = `${description}${description ? "\n\n" : ""}**Weitere Unteraufgaben (aus ${sourceName}):**\n${list}`;
    }
    const [desc, descCut] = cut(description, MAX_DESCRIPTION);
    if (descCut) p.truncatedDescriptions++;

    const status = targetStatus(t.statusName, t.category);
    const statusKey = `${t.statusName || "–"}→${status}`;
    const s = statuses.get(statusKey) ?? { from: t.statusName || "–", to: status, count: 0 };
    s.count++;
    statuses.set(statusKey, s);

    let assigneeId: string | null = null;
    const who = t.assignee.trim();
    if (who) {
      const member = byEmail.get(who.toLowerCase()) ?? byName.get(who.toLowerCase()) ?? null;
      assigneeId = member?.id ?? null;
      const entry = people.get(who) ?? { member, count: 0 };
      entry.count++;
      people.set(who, entry);
    }

    const labels: string[] = [];
    for (const l of t.labels) {
      const name = l.trim().slice(0, MAX_LABEL);
      if (name && !labels.some((x) => x.toLowerCase() === name.toLowerCase())) labels.push(name);
    }
    for (const l of labels) labelNames.add(l.toLowerCase());

    const comments = t.comments
      .map((c) => ({ body: cut(`_Aus ${sourceName} übernommen_\n\n${c.body}`, MAX_COMMENT)[0], createdAt: c.createdAt }));
    p.comments += comments.length;

    tickets.push({
      ref: t.ref,
      title,
      description: desc || null,
      status,
      priority: t.priority,
      assigneeId,
      dueDate: t.dueDate,
      labels,
      subtasks: kept,
      comments,
      createdAt: t.createdAt,
      completedAt: status === "Erledigt" ? (t.completedAt ?? t.createdAt) : null,
    });
    if (p.sample.length < PREVIEW_ROWS) {
      p.sample.push({ ref: t.ref, title, status, priority: t.priority, assignee: assigneeId ? (members.find((m) => m.id === assigneeId)?.name ?? null) : who || null });
    }
  }

  p.tickets = tickets.length;
  p.labels = labelNames.size;
  p.statuses = [...statuses.values()].sort((a, b) => b.count - a.count);
  p.people = [...people.entries()]
    .map(([name, v]) => ({ name, member: v.member?.name ?? null, count: v.count }))
    .sort((a, b) => Number(a.member !== null) - Number(b.member !== null) || b.count - a.count);
  return { tickets, preview: p };
}
