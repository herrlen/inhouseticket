// Ticket hierarchy like Jira (same rules in emuchat): epic → story/task → subtask.
// Pure and shared by client and server; the database enforces the same rules in the trigger
// `enforce_ticket_hierarchy` (drizzle/0015_ticket_hierarchy_rules.sql) as a second line of defence.

export const TICKET_TYPES = ["epic", "story", "task", "subtask"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const DEFAULT_TICKET_TYPE: TicketType = "task";

export const isTicketType = (v: unknown): v is TicketType => typeof v === "string" && (TICKET_TYPES as readonly string[]).includes(v);

export type HierarchyProblem =
  | "epic_no_parent"
  | "subtask_needs_parent"
  | "parent_must_be_epic"
  | "parent_must_be_story_or_task"
  | "epic_has_children"
  | "has_subtasks";

/** Which parent types a ticket of `type` may have (empty: none allowed). */
export function allowedParentTypes(type: TicketType): readonly TicketType[] {
  if (type === "epic") return [];
  if (type === "subtask") return ["story", "task"];
  return ["epic"];
}

/** Which child types a ticket of `type` may have. */
export function allowedChildTypes(type: TicketType): readonly TicketType[] {
  if (type === "epic") return ["story", "task"];
  if (type === "story" || type === "task") return ["subtask"];
  return [];
}

export const canHaveChildren = (type: TicketType) => allowedChildTypes(type).length > 0;

/** Checks a ticket's own place: its type against the type of its parent (null = no parent). */
export function parentProblem(type: TicketType, parentType: TicketType | null): HierarchyProblem | null {
  if (type === "epic") return parentType === null ? null : "epic_no_parent";
  if (type === "subtask") {
    if (parentType === null) return "subtask_needs_parent";
    return parentType === "story" || parentType === "task" ? null : "parent_must_be_story_or_task";
  }
  return parentType === null || parentType === "epic" ? null : "parent_must_be_epic";
}

/** Checks the final state of a ticket: its own parent and every child under it. */
export function hierarchyProblem(type: TicketType, parentType: TicketType | null, childTypes: readonly TicketType[]): HierarchyProblem | null {
  const own = parentProblem(type, parentType);
  if (own) return own;
  for (const child of childTypes) {
    if (parentProblem(child, type) === null) continue;
    return child === "subtask" ? "has_subtasks" : "epic_has_children";
  }
  return null;
}

/** Progress of child tickets: how many are in a "done" status. */
export function childProgress(children: readonly { statusId: string }[], doneStatusIds: ReadonlySet<string>) {
  return { done: children.filter((c) => doneStatusIds.has(c.statusId)).length, total: children.length };
}
