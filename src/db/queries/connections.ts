import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiToken, oauthAccessToken, oauthConsent, oauthRefreshToken, oauthWorkspace } from "@/db/schema";

export type RevokedConnections = { apiTokens: number; oauthClients: number };

/**
 * Cuts every machine access of one person at once: revokes all API tokens and deletes all OAuth
 * tokens, consents and workspace choices – across all workspaces, because they all belong to this
 * person (scoped by `userId`, no other person's data is touched). Used after a password reset and
 * by "Alle Verbindungen trennen" in the account settings.
 */
export async function revokeAllConnections(userId: string): Promise<RevokedConnections> {
  return db.transaction(async (tx) => {
    const tokens = await tx
      .update(apiToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiToken.userId, userId), isNull(apiToken.revokedAt)))
      .returning({ id: apiToken.id });
    await tx.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId));
    await tx.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId));
    const consents = await tx.delete(oauthConsent).where(eq(oauthConsent.userId, userId)).returning({ clientId: oauthConsent.clientId });
    const choices = await tx.delete(oauthWorkspace).where(eq(oauthWorkspace.userId, userId)).returning({ clientId: oauthWorkspace.clientId });
    const clients = new Set([...consents, ...choices].map((r) => r.clientId));
    return { apiTokens: tokens.length, oauthClients: clients.size };
  });
}
