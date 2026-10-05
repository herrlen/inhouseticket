// Membership lifecycle against Postgres: removal, rejoin, token revocation, invitation revocation.
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { addMember } = await import("@/db/queries/workspaces");
const { disableMember, revokeInvitation } = await import("@/db/queries/members");
const { authenticateApiToken, createApiToken } = await import("@/db/queries/api-tokens");

const run = Date.now().toString(36);
const ids = { users: [] as string[], workspaces: [] as string[] };
let wsId: string;
let ownerId: string;

async function newUser(label: string) {
  const id = `m-${label}-${run}`;
  await db.insert(schema.user).values({ id, name: label, email: `${id}@m-${run}.de` });
  ids.users.push(id);
  return id;
}

async function membershipOf(userId: string) {
  const [row] = await db
    .select()
    .from(schema.membership)
    .where(and(eq(schema.membership.workspaceId, wsId), eq(schema.membership.userId, userId)));
  return row!;
}

async function newInvitation(role: "admin" | "member") {
  const [row] = await db
    .insert(schema.invitation)
    .values({ workspaceId: wsId, email: `inv-${role}-${run}@m-${run}.de`, role, tokenHash: `h-${role}-${run}`, invitedBy: ownerId, expiresAt: new Date(Date.now() + 86_400_000) })
    .returning();
  return row!.id;
}

const invitationExists = async (id: string) =>
  (await db.select().from(schema.invitation).where(eq(schema.invitation.id, id))).length === 1;

beforeAll(async () => {
  ownerId = await newUser("owner");
  const [ws] = await db.insert(schema.workspace).values({ name: "m", domain: `m-${run}.de`, slug: `m-${run}` }).returning();
  wsId = ws!.id;
  ids.workspaces.push(wsId);
  await db.transaction((tx) => addMember(tx, wsId, ownerId, "owner"));
});

afterAll(async () => {
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

describe("addMember on an existing membership", () => {
  it("gives a removed admin who rejoins the role of the new join, not the old one", async () => {
    const bob = await newUser("bob");
    await db.transaction((tx) => addMember(tx, wsId, bob, "admin"));
    await disableMember(wsId, (await membershipOf(bob)).id);
    await db.transaction((tx) => addMember(tx, wsId, bob, "member"));
    expect(await membershipOf(bob)).toMatchObject({ status: "active", role: "member" });
  });

  it("keeps the role of an active member", async () => {
    const carl = await newUser("carl");
    await db.transaction((tx) => addMember(tx, wsId, carl, "admin"));
    await db.transaction((tx) => addMember(tx, wsId, carl, "member"));
    expect(await membershipOf(carl)).toMatchObject({ status: "active", role: "admin" });
  });
});

describe("disableMember", () => {
  it("revokes the member's API tokens so a rejoin does not revive them", async () => {
    const dora = await newUser("dora");
    await db.transaction((tx) => addMember(tx, wsId, dora, "member"));
    const created = await createApiToken(wsId, dora, "laptop");
    if ("error" in created) throw new Error("token limit");
    expect(await authenticateApiToken(created.token)).not.toBeNull();

    await disableMember(wsId, (await membershipOf(dora)).id);
    await db.transaction((tx) => addMember(tx, wsId, dora, "member"));
    expect(await authenticateApiToken(created.token)).toBeNull();
  });

  it("never disables the owner", async () => {
    await disableMember(wsId, (await membershipOf(ownerId)).id);
    expect((await membershipOf(ownerId)).status).toBe("active");
  });
});

describe("revokeInvitation", () => {
  it("lets an admin revoke member invitations but not admin invitations", async () => {
    const member = await newInvitation("member");
    const admin = await newInvitation("admin");
    await revokeInvitation(wsId, member, "admin");
    await revokeInvitation(wsId, admin, "admin");
    expect(await invitationExists(member)).toBe(false);
    expect(await invitationExists(admin)).toBe(true);

    await revokeInvitation(wsId, admin, "owner");
    expect(await invitationExists(admin)).toBe(false);
  });
});
