// MCP accepts OAuth access tokens only for its own audience (RFC 8707 resource).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { authenticateOAuthAccessToken } = await import("@/db/queries/oauth");
const { hashToken } = await import("@/lib/tokens");

const run = `o${Date.now().toString(36)}`;
const userId = `${run}-u`;
const client = `${run}-client`;
const MCP = "https://inhouseticket.test/mcp";
let workspaceId = "";
const inAnHour = () => new Date(Date.now() + 3_600_000);

beforeAll(async () => {
  await db.insert(schema.user).values({ id: userId, name: "U", email: `${userId}@firma-${run}.de` });
  const [ws] = await db.insert(schema.workspace).values({ name: "OAuth", domain: `firma-${run}.de`, slug: run }).returning({ id: schema.workspace.id });
  workspaceId = ws!.id;
  await db.insert(schema.membership).values({ workspaceId, userId });
  await db.insert(schema.oauthClient).values({ id: client, clientId: client, name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
  await db.insert(schema.oauthWorkspace).values({ userId, clientId: client, workspaceId });
  const token = (id: string, resources: string[] | null) => ({ id: `${run}-${id}`, token: hashToken(`${run}-${id}`), clientId: client, userId, resources, scopes: ["openid"], expiresAt: inAnHour() });
  await db.insert(schema.oauthAccessToken).values([token("mcp", [MCP]), token("other", ["https://elsewhere.test/api"]), token("none", null), token("empty", [])]);
});

afterAll(async () => {
  await db.delete(schema.oauthClient).where(eq(schema.oauthClient.clientId, client));
  await db.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId));
  await db.delete(schema.user).where(eq(schema.user.id, userId));
});

describe("authenticateOAuthAccessToken – audience", () => {
  it("accepts a token issued for the MCP resource", async () => {
    expect(await authenticateOAuthAccessToken(`${run}-mcp`, MCP)).toEqual({ tokenId: `oauth:${run}-mcp`, userId, workspaceId });
  });

  it.each(["other", "none", "empty"])("rejects a token with audience %s", async (id) => {
    expect(await authenticateOAuthAccessToken(`${run}-${id}`, MCP)).toBeNull();
  });
});
