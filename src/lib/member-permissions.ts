import type { Role } from "@/db/queries/workspaces";

// Who may do what with members (pure, unit-tested). The server actions enforce these rules.

/** Only the owner changes roles; never their own and never the owner's. */
export function canChangeRole(actor: { role: Role; userId: string }, target: { role: Role; userId: string }): boolean {
  return actor.role === "owner" && target.role !== "owner" && actor.userId !== target.userId;
}

/** Owner removes admins and members; admins remove members only. Nobody removes themselves here. */
export function canRemove(actor: { role: Role; userId: string }, target: { role: Role; userId: string }): boolean {
  if (actor.userId === target.userId || target.role === "owner") return false;
  if (actor.role === "owner") return true;
  return actor.role === "admin" && target.role === "member";
}

/** Admins invite members; only the owner can invite admins. */
export function canInviteAs(actorRole: Role, role: Exclude<Role, "owner">): boolean {
  if (actorRole === "owner") return true;
  return actorRole === "admin" && role === "member";
}
