import { isTicketType, type TicketType } from "@/lib/ticket-hierarchy";
import { dueBucket, type DueBucket } from "./list-model";

// Filters live in the URL (shareable, saved views store the query string). Pure + unit-tested.

export type Filters = {
  assignee?: string; // "me" | "none" | userId
  priority?: number; // exact 0–4
  due?: Exclude<DueBucket, "later"> | "later";
  label?: string;
  type?: TicketType;
  q?: string;
};

export const FILTER_KEYS = ["assignee", "priority", "due", "label", "type", "q"] as const;

export function readFilters(params: URLSearchParams): Filters {
  const f: Filters = {};
  const a = params.get("assignee");
  if (a) f.assignee = a;
  const p = params.get("priority");
  if (p !== null && /^[0-4]$/.test(p)) f.priority = Number(p);
  const d = params.get("due");
  if (d && ["overdue", "today", "week", "later", "none"].includes(d)) f.due = d as Filters["due"];
  const l = params.get("label");
  if (l) f.label = l;
  const type = params.get("type");
  if (isTicketType(type)) f.type = type;
  const q = params.get("q")?.trim();
  if (q) f.q = q.slice(0, 200);
  return f;
}

export const hasFilters = (f: Filters) => Object.keys(f).length > 0;

type Filterable = { type?: TicketType; title: string; description?: string | null; assigneeId: string | null; priority: number; dueDate: string | null; statusId: string; labelIds: string[]; number: number };

export function applyFilters<T extends Filterable>(tickets: readonly T[], f: Filters, ctx: { currentUserId: string; today: string; doneStatusIds: Set<string>; projectKey: string }): T[] {
  const words = f.q ? f.q.toLowerCase().split(/\s+/).filter(Boolean) : [];
  return tickets.filter((t) => {
    if (f.assignee === "me" && t.assigneeId !== ctx.currentUserId) return false;
    if (f.assignee === "none" && t.assigneeId) return false;
    if (f.assignee && f.assignee !== "me" && f.assignee !== "none" && t.assigneeId !== f.assignee) return false;
    if (f.priority !== undefined && t.priority !== f.priority) return false;
    if (f.due && dueBucket(t.dueDate, ctx.today, ctx.doneStatusIds.has(t.statusId)) !== f.due) return false;
    if (f.label && !t.labelIds.includes(f.label)) return false;
    if (f.type && (t.type ?? "task") !== f.type) return false;
    if (words.length) {
      const hay = `${ctx.projectKey}-${t.number} ${t.title} ${t.description ?? ""}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}
