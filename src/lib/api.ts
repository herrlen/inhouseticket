import "server-only";
import { headers } from "next/headers";
import { findMembershipById } from "@/db/queries/workspaces";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";

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

/**
 * CSRF guard for cookie-authenticated mutations in route handlers (server actions have their own).
 * The browser always sends Origin on fetch POST/PATCH/DELETE; it must be our own origin.
 */
export async function requireSameOrigin(): Promise<Response | null> {
  const origin = (await headers()).get("origin");
  if (!origin || origin !== new URL(env.APP_URL).origin) return jsonError(403, "forbidden_origin", "Anfrage nicht erlaubt.");
  return null;
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
