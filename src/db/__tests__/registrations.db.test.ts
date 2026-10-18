// Pending registrations against Postgres (ADR 005): replacement, expiry, attempt counter,
// single use, cleanup – and the server-only confirm endpoint creating user + credential account.
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const q = await import("@/db/queries/registrations");
const { hashToken } = await import("@/lib/tokens");
const { MAX_REGISTRATION_ATTEMPTS } = await import("@/lib/limits");

const run = `r${Date.now().toString(36)}`;
const domain = `reg-${run}.de`;
const hour = 3_600_000;

function row(local: string, token: string, overrides: Partial<Parameters<typeof q.upsertPendingRegistration>[0]> = {}) {
  return {
    email: `${local}@${domain}`,
    name: `Name ${local}`,
    passwordHash: "salt:hash",
    tokenHash: hashToken(`${run}-${token}`),
    next: null,
    expiresAt: new Date(Date.now() + hour),
    ...overrides,
  };
}

afterAll(async () => {
  await db.delete(schema.pendingRegistration).where(like(schema.pendingRegistration.email, `%@${domain}`));
  await db.delete(schema.user).where(like(schema.user.email, `%@${domain}`));
});

describe("pending registrations", () => {
  it("keeps one row per address: a new registration replaces the older one and its link", async () => {
    await q.upsertPendingRegistration(row("anna", "t1"));
    await q.claimConfirmAttempt(hashToken(`${run}-t1`));
    await q.upsertPendingRegistration(row("anna", "t2", { name: "Anna Neu" }));

    const rows = await db.select().from(schema.pendingRegistration).where(eq(schema.pendingRegistration.email, `anna@${domain}`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Anna Neu", failedAttempts: 0, tokenHash: hashToken(`${run}-t2`) });
    expect(await q.findPendingByTokenHash(hashToken(`${run}-t1`))).toBeNull();
    expect(await q.findPendingByTokenHash(hashToken(`${run}-t2`))).toEqual({ email: `anna@${domain}` });
  });

  it("treats an expired link as gone and the cleanup deletes it", async () => {
    await q.upsertPendingRegistration(row("old", "t3", { expiresAt: new Date(Date.now() - 1000) }));
    expect(await q.findPendingByTokenHash(hashToken(`${run}-t3`))).toBeNull();
    expect(await q.claimConfirmAttempt(hashToken(`${run}-t3`))).toBeNull();
    expect(await q.deleteExpiredRegistrations()).toBeGreaterThanOrEqual(1);
    const left = await db.select().from(schema.pendingRegistration).where(eq(schema.pendingRegistration.email, `old@${domain}`));
    expect(left).toEqual([]);
  });

  it("counts attempts up to the limit, then the link is dead", async () => {
    await q.upsertPendingRegistration(row("bert", "t4"));
    const token = hashToken(`${run}-t4`);
    for (let i = 1; i <= MAX_REGISTRATION_ATTEMPTS; i++) expect((await q.claimConfirmAttempt(token))?.failedAttempts).toBe(i);
    expect(await q.claimConfirmAttempt(token)).toBeNull();
    expect(await q.findPendingByTokenHash(token)).toBeNull();
  });

  it("can be consumed once", async () => {
    await q.upsertPendingRegistration(row("cleo", "t5"));
    const claimed = await q.claimConfirmAttempt(hashToken(`${run}-t5`));
    const [a, b] = await Promise.all([q.consumePendingRegistration(claimed!.id), q.consumePendingRegistration(claimed!.id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("rejects mixed-case addresses, empty or long names and attempts beyond the limit (constraints)", async () => {
    await expect(db.insert(schema.pendingRegistration).values(row("Dora", "t6"))).rejects.toThrow();
    await expect(db.insert(schema.pendingRegistration).values(row("dora", "t7", { name: "" }))).rejects.toThrow();
    await expect(db.insert(schema.pendingRegistration).values(row("dora", "t8", { name: "x".repeat(101) }))).rejects.toThrow();
    await expect(db.insert(schema.pendingRegistration).values({ ...row("dora", "t9"), failedAttempts: MAX_REGISTRATION_ATTEMPTS + 1 })).rejects.toThrow();
  });
});

describe("confirmRegistration (server-only Better Auth endpoint)", async () => {
  const { auth } = await import("@/lib/auth");
  const ctx = await auth.$context;
  const password = "registriert-123";

  it("needs the registration password, locks after the limit and never creates a user meanwhile", async () => {
    await q.upsertPendingRegistration(row("emil", "t10", { passwordHash: await ctx.password.hash(password) }));
    const body = { token: `${run}-t10`, password: "falsch-falsch" };
    for (let i = 1; i < MAX_REGISTRATION_ATTEMPTS; i++) {
      await expect(auth.api.confirmRegistration({ body, headers: new Headers() })).rejects.toMatchObject({ body: { code: "WRONG_PASSWORD" } });
    }
    await expect(auth.api.confirmRegistration({ body, headers: new Headers() })).rejects.toMatchObject({ body: { code: "LOCKED" } });
    // Locked: even the right password no longer works, and the row is gone.
    await expect(auth.api.confirmRegistration({ body: { ...body, password }, headers: new Headers() })).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
    expect(await db.select().from(schema.user).where(eq(schema.user.email, `emil@${domain}`))).toEqual([]);
  });

  it("creates a verified user with name and the stored password hash, once", async () => {
    const passwordHash = await ctx.password.hash(password);
    await q.upsertPendingRegistration(row("frida", "t11", { name: "Frida Kahlo", passwordHash, next: "/invite/abc" }));
    const res = await auth.api.confirmRegistration({ body: { token: `${run}-t11`, password }, headers: new Headers() });
    expect(res).toEqual({ next: "/invite/abc" });

    const [created] = await db.select().from(schema.user).where(eq(schema.user.email, `frida@${domain}`));
    expect(created).toMatchObject({ name: "Frida Kahlo", emailVerified: true });
    const accounts = await db.select().from(schema.account).where(eq(schema.account.userId, created!.id));
    expect(accounts).toEqual([expect.objectContaining({ providerId: "credential", accountId: created!.id, password: passwordHash })]);
    expect(await db.select().from(schema.session).where(eq(schema.session.userId, created!.id))).toHaveLength(1);

    await expect(auth.api.confirmRegistration({ body: { token: `${run}-t11`, password }, headers: new Headers() })).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });

  it("refuses when the address got an account in the meantime – and any account drops open registrations", async () => {
    await q.upsertPendingRegistration(row("gero", "t12", { passwordHash: await ctx.password.hash(password) }));
    await db.insert(schema.user).values({ id: `${run}-gero`, name: "Gero", email: `gero@${domain}` });
    await expect(auth.api.confirmRegistration({ body: { token: `${run}-t12`, password }, headers: new Headers() })).rejects.toMatchObject({ body: { code: "ACCOUNT_EXISTS" } });

    // A user created through Better Auth (e.g. by the magic link) removes the pending row.
    await q.upsertPendingRegistration(row("hugo", "t13"));
    await ctx.internalAdapter.createUser({ email: `hugo@${domain}`, name: "Hugo" }, { method: "magic-link" });
    const left = await db.select().from(schema.pendingRegistration).where(inArray(schema.pendingRegistration.email, [`hugo@${domain}`]));
    expect(left).toEqual([]);
  });
});
