// "Alle Verbindungen trennen" / password reset: every machine access of one person ends, nobody else's.
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { revokeAllConnections } = await import("@/db/queries/connections");

const run = `x${Date.now().toString(36)}`;
const me = `${run}-me`;
const other = `${run}-other`;
const client = `${run}-client`;
let workspaceId = "";

beforeAll(async () => {
  await db.insert(schema.user).values([me, other].map((id) => ({ id, name: id, email: `${id}@firma-${run}.de` })));
  const [ws] = await db.insert(schema.workspace).values({ name: "Conn", domain: `firma-${run}.de`, slug: run }).returning({ id: schema.workspace.id });
  workspaceId = ws!.id;
  await db.insert(schema.apiToken).values([
    { userId: me, workspaceId, name: "ci", tokenHash: `${run}-h1` },
    { userId: me, workspaceId, name: "old", tokenHash: `${run}-h2`, revokedAt: new Date("2026-01-01") },
    { userId: other, workspaceId, name: "theirs", tokenHash: `${run}-h3` },
  ]);
  await db.insert(schema.oauthClient).values({ id: client, clientId: client, name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
  for (const userId of [me, other]) {
    await db.insert(schema.oauthRefreshToken).values({ id: `${userId}-r`, token: `${userId}-rt`, clientId: client, userId, scopes: ["openid"] });
    await db.insert(schema.oauthAccessToken).values({ id: `${userId}-a`, token: `${userId}-at`, clientId: client, userId, refreshId: `${userId}-r`, scopes: ["openid"] });
    await db.insert(schema.oauthConsent).values({ id: `${userId}-c`, clientId: client, userId, scopes: ["openid"] });
    await db.insert(schema.oauthWorkspace).values({ userId, clientId: client, workspaceId });
  }
});

afterAll(async () => {
  await db.delete(schema.oauthClient).where(eq(schema.oauthClient.clientId, client));
  await db.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  await db.delete(schema.user).where(inArray(schema.user.id, [me, other]));
});

describe("revokeAllConnections", () => {
  it("revokes API tokens and deletes OAuth tokens, consents and workspace choices of the person", async () => {
    expect(await revokeAllConnections(me)).toEqual({ apiTokens: 1, oauthClients: 1 });

    const tokens = await db.select().from(schema.apiToken).where(eq(schema.apiToken.workspaceId, workspaceId));
    expect(tokens.filter((t) => t.userId === me).every((t) => t.revokedAt)).toBe(true);
    for (const table of [schema.oauthAccessToken, schema.oauthRefreshToken, schema.oauthConsent, schema.oauthWorkspace]) {
      const rows = await db.select({ userId: table.userId }).from(table).where(inArray(table.userId, [me, other]));
      expect(rows.map((r) => r.userId)).toEqual([other]);
    }
    expect(tokens.find((t) => t.userId === other)?.revokedAt).toBeNull();
  });

  it("is a no-op the second time", async () => {
    expect(await revokeAllConnections(me)).toEqual({ apiTokens: 0, oauthClients: 0 });
  });
});
