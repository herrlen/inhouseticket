// Closed-beta gate against Postgres, with the allowlist set via a mocked env.
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return { env: { ...actual.env, BETA_ALLOWED_DOMAINS: ["studioluy.de"], TESTER_EMAILS: ["tester@hotmail.com"], SUPERADMIN_EMAILS: [] } };
});

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { mayEnterBeta } = await import("@/lib/beta");

const run = `b${Date.now().toString(36)}`;
const ids = { users: [] as string[], workspaces: [] as string[] };

beforeAll(async () => {
  const owner = `${run}-owner`;
  await db.insert(schema.user).values([
    { id: owner, name: "Owner", email: `owner@studioluy.de-${run}.test` },
    { id: `${run}-old`, name: "Alt", email: `alt@bestand-${run}.de` },
  ]);
  ids.users.push(owner, `${run}-old`);
  const [ws] = await db.insert(schema.workspace).values({ name: "B", domain: `beta-${run}.de`, slug: `beta-${run}` }).returning();
  ids.workspaces.push(ws!.id);
  await db.insert(schema.invitation).values({
    workspaceId: ws!.id, email: `freelancer@agentur-${run}.de`, tokenHash: `hash-${run}`, invitedBy: owner,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
});

afterAll(async () => {
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

describe("mayEnterBeta", () => {
  it("admits listed domains (case-insensitive)", async () => {
    expect(await mayEnterBeta("Keren@StudioLuy.de")).toBe(true);
  });

  it("refuses other company domains", async () => {
    expect(await mayEnterBeta(`neu@fremd-${run}.de`)).toBe(false);
  });

  it("admits existing users and people with an open invitation", async () => {
    expect(await mayEnterBeta(`alt@bestand-${run}.de`)).toBe(true);
    expect(await mayEnterBeta(`freelancer@agentur-${run}.de`)).toBe(true);
  });

  it("admits listed testers, also with a freemail address – without operator rights", async () => {
    const { isExemptEmail, isSuperadminEmail } = await import("@/lib/superadmin");
    expect(await mayEnterBeta("Tester@Hotmail.com ")).toBe(true);
    expect(isExemptEmail("tester@hotmail.com")).toBe(true);
    expect(isSuperadminEmail("tester@hotmail.com")).toBe(false);
    expect(await mayEnterBeta("someone-else@hotmail.com")).toBe(false);
    expect(isExemptEmail("someone-else@hotmail.com")).toBe(false);
  });
});
