import "server-only";
import { headers } from "next/headers";
import { findMembershipById } from "@/db/queries/workspaces";
import { auth } from "@/lib/auth";
import { readBodyLimited } from "@/lib/body";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

/** Per signed-in user across all /api/w routes – generous for a fast UI, stops scripted floods. */
const API_REQUESTS_PER_MINUTE = 300;
const MAX_JSON_BYTES = 64 * 1024;

/** Membership check for route handlers: JSON 401/404 instead of redirects (CLAUDE.md rule 1). */
export async function requireApiMember(workspaceId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: jsonError(401, "unauthorized", "Nicht angemeldet.") } as const;
  const limited = tooManyRequests(rateLimit(`api:${session.user.id}`, API_REQUESTS_PER_MINUTE, 60_000));
  if (limited) return { error: limited } as const;
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

/** 429 response for a failed rate limit, or null when the request may pass. */
export function tooManyRequests(limit: ReturnType<typeof rateLimit>): Response | null {
  if (limit.ok) return null;
  const res = jsonError(429, "rate_limited", `Zu viele Anfragen. Bitte in ${limit.retryAfterSec} s erneut versuchen.`);
  res.headers.set("Retry-After", String(limit.retryAfterSec));
  return res;
}

/** JSON body capped at 64 KB; anything larger or malformed reads as null (→ validation error). */
export async function readJson(request: Request): Promise<unknown> {
  const body = await readBodyLimited(request, MAX_JSON_BYTES);
  if (body === "too_large") return null;
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}
