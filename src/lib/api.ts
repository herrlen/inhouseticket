import "server-only";
import { headers } from "next/headers";
import { findMembershipById } from "@/db/queries/workspaces";
import { auth } from "@/lib/auth";

/** Membership check for route handlers: JSON 401/404 instead of redirects (CLAUDE.md rule 1). */
export async function requireApiMember(workspaceId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: jsonError(401, "unauthorized", "Nicht angemeldet.") } as const;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return { error: jsonError(404, "not_found", "Nicht gefunden.") } as const;
  const row = await findMembershipById(workspaceId, session.user.id);
  if (!row) return { error: jsonError(404, "not_found", "Nicht gefunden.") } as const;
  return { ctx: { user: session.user, workspace: row.workspace, membership: row.membership } } as const;
}

/** Uniform error format (docs/entwicklerregeln.md §4). */
export function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function json<T>(data: T) {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
