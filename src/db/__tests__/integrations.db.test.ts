// ClickUp sync against Postgres with the fake API: first run creates projects/tickets/hierarchy/
// comments, a second run creates no duplicates, changes arrive as updates, the lease keeps runs
// single, and nothing leaks into another workspace. Fixture data is invented.
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.INTEGRATION_SECRET ??= "db-test-integration-secret-0123456789abcdef";

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const q = await import("@/db/queries/integrations");
const { claimIntegration, releaseIntegration } = await import("@/db/queries/integration-sync");
const { runSync } = await import("@/lib/integrations/engine");
const { ClickUpConnector } = await import("@/lib/integrations/clickup/connector");
const { createFakeClickUp, sampleData } = await import("@/lib/integrations/clickup/fake");
const { RateLimiter } = await import("@/lib/integrations/rate-limiter");

const run = Date.now().toString(36);
const ids = { users: [] as string[], workspaces: [] as string[] };
const data = sampleData();
data.members[0]!.email = `person.a@cu-${run}.example`;
const fake = createFakeClickUp(data);
const connector = () => new ClickUpConnector({ token: data.token, fetch: fake.fetch, limiter: new RateLimiter(10_000) });

async function setup(label: string, email: string) {
  const userId = `cu-${label}-${run}`;
  await db.insert(schema.user).values({ id: userId, name: `Person ${label}`, email });
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `cu-${label}-${run}.example`, slug: `cu-${label}-${run}` }).returning();
  await db.insert(schema.membership).values({ workspaceId: ws!.id, userId, role: "owner" });
  ids.users.push(userId);
  ids.workspaces.push(ws!.id);
  return { userId, wsId: ws!.id };
}

let a: Awaited<ReturnType<typeof setup>>;
let b: Awaited<ReturnType<typeof setup>>;
let integrationId: string;

beforeAll(async () => {
  a = await setup("a", data.members[0]!.email);
  b = await setup("b", `person.x@cu-b-${run}.example`);
  integrationId = await q.saveIntegrationToken({ workspaceId: a.wsId, userId: a.userId }, "clickup", data.token, { tokenHint: "pk_…1234" });
  await q.updateIntegrationConfig(a.wsId, integrationId, { accountId: "9001", accountName: "Beispiel GmbH", spaceIds: ["s-1"], listIds: ["l-3"], step: "done" }, "active");
  // The wizard's mapping step: Person A matched by e-mail, Person B stays unassigned.
  await q.saveFieldMappings(a.wsId, integrationId, [
    { kind: "user", externalValue: "101", localValue: a.userId, meta: {} },
    { kind: "user", externalValue: "102", localValue: "", meta: {} },
    { kind: "status", externalValue: "in progress", localValue: "In Arbeit", meta: { category: "active" } },
  ]);
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, ids.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

async function tickets(wsId: string) {
  return db
    .select({ id: schema.ticket.id, title: schema.ticket.title, type: schema.ticket.type, parentId: schema.ticket.parentId, assigneeId: schema.ticket.assigneeId, priority: schema.ticket.priority, status: schema.status.name, project: schema.project.name, completedAt: schema.ticket.completedAt, dueAt: schema.ticket.dueAt })
    .from(schema.ticket)
    .innerJoin(schema.status, eq(schema.status.id, schema.ticket.statusId))
    .innerJoin(schema.project, eq(schema.project.id, schema.ticket.projectId))
    .where(eq(schema.ticket.workspaceId, wsId))
    .orderBy(asc(schema.ticket.title));
}

describe("ClickUp sync", () => {
  it("first run: projects per space, tickets, hierarchy, mapping, checklist and comments", async () => {
    const result = await runSync(integrationId, "initial", { connector: connector() });
    expect(result?.error).toBeNull();
    expect(result?.counts).toMatchObject({ read: 5, created: 5, updated: 0, errors: 0, comments: 2, unlinked: 0 });

    const rows = await tickets(a.wsId);
    const by = new Map(rows.map((r) => [r.title, r]));
    expect([...new Set(rows.map((r) => r.project))].sort()).toEqual(["Marketing", "Vertrieb"]);
    const plan = by.get("Kampagne planen")!;
    expect(plan).toMatchObject({ type: "task", parentId: null, assigneeId: a.userId, priority: 3, status: "In Arbeit" });
    expect(plan.dueAt?.toISOString()).toBe("2025-12-31T00:00:00.000Z");
    // Subtask and sub-subtask both hang under the top task (one subtask level).
    expect(by.get("Texte schreiben")).toMatchObject({ type: "subtask", parentId: plan.id, assigneeId: null, status: "Offen", priority: 2 });
    expect(by.get("Korrektur lesen")).toMatchObject({ type: "subtask", parentId: plan.id, status: "Erledigt" });
    expect(by.get("Korrektur lesen")!.completedAt).not.toBeNull();
    // Unclear custom status → own status (suggestion stored for the settings page).
    expect(by.get("Newsletter")).toMatchObject({ status: "wartet auf freigabe", priority: 4 });
    const mappings = await q.listFieldMappings(a.wsId, integrationId);
    expect(mappings.find((m) => m.externalValue === "wartet auf freigabe")).toMatchObject({ localValue: "own", meta: { category: "active" } });

    const labels = await db
      .select({ name: schema.label.name })
      .from(schema.ticketLabel)
      .innerJoin(schema.label, eq(schema.label.id, schema.ticketLabel.labelId))
      .where(eq(schema.ticketLabel.ticketId, by.get("Newsletter")!.id));
    expect(labels.map((l) => l.name).sort()).toEqual(["Allgemein", "Meilenstein"]);
    const checklist = await db.select({ title: schema.subtask.title, done: schema.subtask.done }).from(schema.subtask).where(eq(schema.subtask.ticketId, plan.id)).orderBy(asc(schema.subtask.sort));
    expect(checklist).toEqual([{ title: "Budget", done: true }, { title: "Zeitplan", done: false }]);

    const comments = await db.select({ body: schema.comment.body, authorId: schema.comment.authorId }).from(schema.comment).where(eq(schema.comment.ticketId, plan.id)).orderBy(asc(schema.comment.createdAt));
    expect(comments[0]).toEqual({ body: "_Aus ClickUp übernommen_\n\nBitte bis Freitag", authorId: a.userId });
    expect(comments[1]!.body).toBe("_Aus ClickUp übernommen – Person B_\n\nErledige ich");

    const log = await db.select({ type: schema.activity.type, payload: schema.activity.payload, via: schema.activity.via }).from(schema.activity).where(eq(schema.activity.ticketId, plan.id));
    expect(log).toEqual([{ type: "imported", payload: { source: "ClickUp", ref: "t-1" }, via: "api" }]);
    expect(await q.findTicketSource(a.wsId, plan.id)).toEqual({ provider: "clickup", ref: "t-1", url: "https://app.clickup.com/t/t-1" });
  });

  it("second run: no duplicates, nothing changed", async () => {
    const before = await tickets(a.wsId);
    const result = await runSync(integrationId, "manual", { connector: connector() });
    expect(result?.counts).toMatchObject({ created: 0, updated: 0, errors: 0, comments: 0 });
    expect(await tickets(a.wsId)).toEqual(before);
    // Full re-read (selection changed) is idempotent as well.
    await q.updateIntegrationConfig(a.wsId, integrationId, { fullResync: true });
    const full = await runSync(integrationId, "manual", { connector: connector() });
    expect(full?.counts).toMatchObject({ read: 5, created: 0, updated: 0, unchanged: 5 });
    expect(await tickets(a.wsId)).toEqual(before);
    const commentCount = await db.select({ id: schema.comment.id }).from(schema.comment).where(eq(schema.comment.workspaceId, a.wsId));
    expect(commentCount).toHaveLength(2);
  });

  it("changed tasks are updated, moved subtasks re-linked, new comments added", async () => {
    const t2 = data.tasks.find((t) => t.id === "t-2")!;
    t2.name = "Texte schreiben (v2)";
    t2.status = "complete";
    t2.statusType = "closed";
    t2.updated = 1_760_001_000_000;
    const t3 = data.tasks.find((t) => t.id === "t-3")!;
    t3.parent = null;
    t3.updated = 1_760_001_000_001;
    data.comments["t-2"] = [{ id: "c-9", text: "Fertig", userId: 101, date: 1_760_001_000_000 }];

    const result = await runSync(integrationId, "manual", { connector: connector() });
    expect(result?.counts).toMatchObject({ created: 0, updated: 2, comments: 1, errors: 0 });
    const by = new Map((await tickets(a.wsId)).map((r) => [r.title, r]));
    expect(by.size).toBe(5);
    expect(by.get("Texte schreiben (v2)")).toMatchObject({ type: "subtask", status: "Erledigt" });
    expect(by.get("Korrektur lesen")).toMatchObject({ type: "task", parentId: null });
  });

  it("runs one at a time (lease) and records every run", async () => {
    const integ = await claimIntegration(integrationId, 60_000);
    expect(integ).not.toBeNull();
    expect(await runSync(integrationId, "manual", { connector: connector() })).toBeNull();
    await releaseIntegration(integ!, {});
    const runs = await q.listSyncRuns(a.wsId, integrationId);
    expect(runs.length).toBe(4);
    expect(runs.every((r) => r.finishedAt && !r.error)).toBe(true);
  });

  it("resumes an unfinished run from its cursor", async () => {
    // A crashed run that already read the tasks: only links and comments are left.
    await db.insert(schema.syncRun).values({ workspaceId: a.wsId, integrationId, trigger: "schedule", counts: { read: 5, created: 0 }, cursor: { phase: "links", since: null, maxUpdated: "2025-10-09T09:10:00.001Z" } });
    const before = fake.requests();
    const result = await runSync(integrationId, "schedule", { connector: connector() });
    expect(result?.counts).toMatchObject({ read: 5, created: 0 });
    // No task pages were fetched again – only the space list for names.
    expect(fake.log.slice(before).filter((l) => l.includes("/task?"))).toEqual([]);
    const runs = await q.listSyncRuns(a.wsId, integrationId);
    expect(runs.filter((r) => !r.finishedAt)).toEqual([]);
  });

  it("stores only the sealed token and keeps workspaces apart", async () => {
    const [row] = await db.select({ credentials: schema.integration.credentials }).from(schema.integration).where(eq(schema.integration.id, integrationId));
    expect(row!.credentials).toMatch(/^v1:/);
    expect(row!.credentials).not.toContain(data.token);
    expect(await q.openIntegrationToken(a.wsId, integrationId)).toBe(data.token);
    await expect(q.openIntegrationToken(b.wsId, integrationId)).rejects.toThrow();

    const ticket = (await tickets(a.wsId))[0]!;
    expect(await q.findTicketSource(b.wsId, ticket.id)).toBeNull();
    expect(await q.findIntegration(b.wsId, "clickup")).toBeNull();
    expect(await q.listSyncRuns(b.wsId, integrationId)).toEqual([]);
    expect(await q.deleteIntegration(b.wsId, integrationId)).toBe(false);
    expect(await tickets(b.wsId)).toEqual([]);
  });

  it("disconnect removes token and refs, tickets stay", async () => {
    const before = await tickets(a.wsId);
    expect(await q.deleteIntegration(a.wsId, integrationId)).toBe(true);
    expect(await db.select().from(schema.externalRef).where(eq(schema.externalRef.integrationId, integrationId))).toEqual([]);
    expect(await db.select().from(schema.syncRun).where(and(eq(schema.syncRun.integrationId, integrationId)))).toEqual([]);
    expect(await tickets(a.wsId)).toEqual(before);
    expect(await q.findTicketSource(a.wsId, before[0]!.id)).toBeNull();
  });
});
