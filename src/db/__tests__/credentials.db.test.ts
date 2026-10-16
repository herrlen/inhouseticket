// Password state against Postgres: only a "credential" account with a hash counts.
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { userHasPassword } = await import("@/db/queries/credentials");

const run = `c${Date.now().toString(36)}`;
const users = [`${run}-none`, `${run}-other`, `${run}-empty`, `${run}-set`];

beforeAll(async () => {
  await db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@firma-${run}.de` })));
  await db.insert(schema.account).values([
    { id: `${run}-a1`, accountId: `${run}-other`, providerId: "github", userId: `${run}-other`, password: "not-a-credential" },
    { id: `${run}-a2`, accountId: `${run}-empty`, providerId: "credential", userId: `${run}-empty`, password: null },
    { id: `${run}-a3`, accountId: `${run}-set`, providerId: "credential", userId: `${run}-set`, password: "salt:hash" },
  ]);
});

afterAll(async () => {
  await db.delete(schema.user).where(inArray(schema.user.id, users));
});

describe("userHasPassword", () => {
  it("is false without any account, with another provider and with an empty credential", async () => {
    expect(await userHasPassword(`${run}-none`)).toBe(false);
    expect(await userHasPassword(`${run}-other`)).toBe(false);
    expect(await userHasPassword(`${run}-empty`)).toBe(false);
  });

  it("is true once a password hash is stored", async () => {
    expect(await userHasPassword(`${run}-set`)).toBe(true);
  });
});
