import "server-only";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { membership, oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken, oauthWorkspace, workspace } from "@/db/schema";
import { hashToken } from "@/lib/tokens";
import type { TokenActor } from "./api-tokens";

// OAuth connections (claude.ai connectors). Tokens are bound to a person; the workspace comes from
// the choice on the consent page. Membership and workspace lock are checked on every call.

export async function authenticateOAuthAccessToken(raw: string, resource: string): Promise<TokenActor | null> {
  if (raw.length > 200) return null;
  const now = new Date();
  const [row] = await db
    .select({ id: oauthAccessToken.id, userId: oauthAccessToken.userId, clientId: oauthAccessToken.clientId, resources: oauthAccessToken.resources, workspaceId: oauthWorkspace.workspaceId })
    .from(oauthAccessToken)
    .innerJoin(oauthWorkspace, and(eq(oauthWorkspace.userId, oauthAccessToken.userId), eq(oauthWorkspace.clientId, oauthAccessToken.clientId)))
    .innerJoin(membership, and(eq(membership.userId, oauthWorkspace.userId), eq(membership.workspaceId, oauthWorkspace.workspaceId), eq(membership.status, "active")))
    .innerJoin(workspace, and(eq(workspace.id, oauthWorkspace.workspaceId), isNull(workspace.lockedAt)))
    .innerJoin(oauthClient, and(eq(oauthClient.clientId, oauthAccessToken.clientId), eq(oauthClient.disabled, false)))
    .where(and(eq(oauthAccessToken.token, hashToken(raw)), isNull(oauthAccessToken.revoked), gt(oauthAccessToken.expiresAt, now)))
    .limit(1);
  if (!row?.userId) return null;
  // Audience: tokens issued for another resource are not valid here.
  if (row.resources?.length && !row.resources.includes(resource)) return null;
  return { tokenId: `oauth:${row.id}`, userId: row.userId, workspaceId: row.workspaceId };
}

/** Stores which workspace a client may act in for this person (consent page). */
export async function setOAuthWorkspace(userId: string, clientId: string, workspaceId: string) {
  await db
    .insert(oauthWorkspace)
    .values({ userId, clientId, workspaceId })
    .onConflictDoUpdate({ target: [oauthWorkspace.userId, oauthWorkspace.clientId], set: { workspaceId } });
}

export type OAuthConnection = { clientId: string; name: string; createdAt: string };

/** Connected apps for the settings page: clients this person granted access to in this workspace. */
export async function listOAuthConnections(workspaceId: string, userId: string): Promise<OAuthConnection[]> {
  const rows = await db
    .select({ clientId: oauthWorkspace.clientId, name: oauthClient.name, createdAt: oauthWorkspace.createdAt })
    .from(oauthWorkspace)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthWorkspace.clientId))
    .where(and(eq(oauthWorkspace.workspaceId, workspaceId), eq(oauthWorkspace.userId, userId)))
    .orderBy(asc(oauthWorkspace.createdAt));
  return rows.map((r) => ({ clientId: r.clientId, name: r.name || "Unbenannte App", createdAt: r.createdAt.toISOString() }));
}

/** Disconnects a client: consent, all its tokens for this person and the workspace choice. */
export async function revokeOAuthConnection(workspaceId: string, userId: string, clientId: string) {
  await db.transaction(async (tx) => {
    const [choice] = await tx
      .select({ clientId: oauthWorkspace.clientId })
      .from(oauthWorkspace)
      .where(and(eq(oauthWorkspace.workspaceId, workspaceId), eq(oauthWorkspace.userId, userId), eq(oauthWorkspace.clientId, clientId)));
    if (!choice) return;
    await tx.delete(oauthAccessToken).where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)));
    await tx.delete(oauthRefreshToken).where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)));
    await tx.delete(oauthConsent).where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)));
    await tx.delete(oauthWorkspace).where(and(eq(oauthWorkspace.userId, userId), eq(oauthWorkspace.clientId, clientId)));
  });
}

/** Client name and registered redirect URIs for the consent page. */
export async function findOAuthClient(clientId: string): Promise<{ name: string; redirectUris: string[] } | null> {
  const [row] = await db
    .select({ name: oauthClient.name, redirectUris: oauthClient.redirectUris })
    .from(oauthClient)
    .where(and(eq(oauthClient.clientId, clientId), eq(oauthClient.disabled, false)))
    .limit(1);
  return row ? { name: row.name || "Unbenannte App", redirectUris: row.redirectUris } : null;
}
