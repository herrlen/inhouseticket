import "server-only";
import { and, count, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { apiToken, membership, workspace } from "@/db/schema";
import { hashToken } from "@/lib/tokens";
import { randomBytes } from "node:crypto";

// Personal API tokens (KONZEPT §4): one user, one workspace, hashed at rest, shown once.

export const MAX_TOKENS_PER_USER = 10;
const PREFIX = "iht_";

export type ApiTokenRow = { id: string; name: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; expiresAt: string | null };

/** Not revoked and not expired. */
const usable = () => and(isNull(apiToken.revokedAt), or(isNull(apiToken.expiresAt), gt(apiToken.expiresAt, new Date())));

export function generateApiToken(): string {
  return PREFIX + randomBytes(32).toString("base64url");
}

export async function listApiTokens(workspaceId: string, userId: string): Promise<ApiTokenRow[]> {
  const rows = await db
    .select({ id: apiToken.id, name: apiToken.name, createdAt: apiToken.createdAt, lastUsedAt: apiToken.lastUsedAt, revokedAt: apiToken.revokedAt, expiresAt: apiToken.expiresAt })
    .from(apiToken)
    .where(and(eq(apiToken.workspaceId, workspaceId), eq(apiToken.userId, userId)))
    .orderBy(desc(apiToken.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString(), lastUsedAt: r.lastUsedAt?.toISOString() ?? null, revokedAt: r.revokedAt?.toISOString() ?? null, expiresAt: r.expiresAt?.toISOString() ?? null }));
}

/** Creates a token and returns the plain value – the only time it exists outside the hash. */
export async function createApiToken(workspaceId: string, userId: string, name: string, expiresAt: Date | null): Promise<{ token: string; row: ApiTokenRow } | { error: "limit" }> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(apiToken)
    .where(and(eq(apiToken.workspaceId, workspaceId), eq(apiToken.userId, userId), usable()));
  if (n >= MAX_TOKENS_PER_USER) return { error: "limit" };
  const token = generateApiToken();
  const [row] = await db
    .insert(apiToken)
    .values({ workspaceId, userId, name, tokenHash: hashToken(token), expiresAt })
    .returning({ id: apiToken.id, name: apiToken.name, createdAt: apiToken.createdAt });
  return { token, row: { id: row!.id, name: row!.name, createdAt: row!.createdAt.toISOString(), lastUsedAt: null, revokedAt: null, expiresAt: expiresAt?.toISOString() ?? null } };
}

export async function revokeApiToken(workspaceId: string, userId: string, tokenId: string) {
  await db
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiToken.id, tokenId), eq(apiToken.workspaceId, workspaceId), eq(apiToken.userId, userId), isNull(apiToken.revokedAt)));
}

export type TokenActor = { tokenId: string; userId: string; workspaceId: string };

/**
 * Resolves a bearer token to its user and workspace. Revoked tokens and users who are no longer
 * active members are rejected on every call (rights are never cached).
 */
export async function authenticateApiToken(raw: string): Promise<TokenActor | null> {
  if (!raw.startsWith(PREFIX) || raw.length > 100) return null;
  const [row] = await db
    .select({ id: apiToken.id, userId: apiToken.userId, workspaceId: apiToken.workspaceId, lastUsedAt: apiToken.lastUsedAt })
    .from(apiToken)
    .innerJoin(membership, and(eq(membership.userId, apiToken.userId), eq(membership.workspaceId, apiToken.workspaceId), eq(membership.status, "active")))
    .innerJoin(workspace, and(eq(workspace.id, apiToken.workspaceId), isNull(workspace.lockedAt)))
    .where(and(eq(apiToken.tokenHash, hashToken(raw)), usable()))
    .limit(1);
  if (!row) return null;
  // Touch "last used" at most once a minute.
  const minuteAgo = new Date(Date.now() - 60_000);
  if (!row.lastUsedAt || row.lastUsedAt < minuteAgo) {
    await db.update(apiToken).set({ lastUsedAt: new Date() }).where(and(eq(apiToken.id, row.id), or(isNull(apiToken.lastUsedAt), lt(apiToken.lastUsedAt, minuteAgo))));
  }
  return { tokenId: row.id, userId: row.userId, workspaceId: row.workspaceId };
}
