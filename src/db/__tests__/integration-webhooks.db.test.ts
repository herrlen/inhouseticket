// ClickUp webhooks against Postgres with the fake API: registration (sealed id + secret, one
// space filter, re-registration, removal on disconnect), the endpoint (signature, 404 for unknown
// ids, idempotent queue), the targeted sync (updated ticket, deleted task labelled, comments,
// same event twice), the lease and the slower poll while healthy. Fixture data is invented.
import { createHmac } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The route hands the batch to after(); here it runs right away and the test awaits it.
const background: Array<Promise<unknown>> = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => void background.push(fn()) }));
process.env.INTEGRATION_SECRET ??= "db-test-integration-secret-0123456789abcdef";

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const q = await import("@/db/queries/integrations");
const hooks = await import("@/db/queries/integration-webhooks");
const { claimIntegration, dueIntegrationIds, releaseIntegration } = await import("@/db/queries/integration-sync");
const { runSync } = await import("@/lib/integrations/engine");
const ws = await import("@/lib/integrations/webhook-sync");
const { ClickUpConnector } = await import("@/lib/integrations/clickup/connector");
const { createFakeClickUp, sampleData } = await import("@/lib/integrations/clickup/fake");
const { RateLimiter } = await import("@/lib/integrations/rate-limiter");
const route = await import("@/app/api/integrations/clickup/webhook/[integrationId]/route");

const run = Date.now().toString(36);
const ids = { users: [] as string[], workspaces: [] as string[] };
const data = sampleData();
data.members[0]!.email = `person.a@wh-${run}.example`;
const fake = createFakeClickUp(data);
const connector = () => new ClickUpConnector({ token: data.token, fetch: fake.fetch, limiter: new RateLimiter(10_000) });
const BASE = "https://app.example";
const opts = () => ({ connector: connector(), baseUrl: BASE });

let wsId: string;
let otherWsId: string;
let integrationId: string;

beforeAll(async () => {
  for (const label of ["a", "b"]) {
    const userId = `wh-${label}-${run}`;
    await db.insert(schema.user).values({ id: userId, name: `Person ${label}`, email: label === "a" ? data.members[0]!.email : `x@wh-b-${run}.example` });
    const [w] = await db.insert(schema.workspace).values({ name: label, domain: `wh-${label}-${run}.example`, slug: `wh-${label}-${run}` }).returning();
    await db.insert(schema.membership).values({ workspaceId: w!.id, userId, role: "owner" });
    ids.users.push(userId);
    ids.workspaces.push(w!.id);
  }
  [wsId, otherWsId] = ids.workspaces as [string, string];
  integrationId = await q.saveIntegrationToken({ workspaceId: wsId, userId: ids.users[0]! }, "clickup", data.token, { tokenHint: "pk_…1234" });
  await q.updateIntegrationConfig(wsId, integrationId, { accountId: "9001", accountName: "Beispiel GmbH", spaceIds: ["s-1"], listIds: [], step: "done" }, "active");
  await q.saveFieldMappings(wsId, integrationId, [{ kind: "user", externalValue: "101", localValue: ids.users[0]!, meta: {} }]);
  const first = await runSync(integrationId, "initial", { connector: connector() });
  expect(first?.counts).toMatchObject({ created: 4, errors: 0 });
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, ids.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("hex");

async function post(id: string, payload: unknown, signature?: (body: string) => string | null) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" };
  const sig = signature ? signature(body) : null;
  if (sig) headers["x-signature"] = sig;
  const res = await route.POST(new Request(`${BASE}/api/integrations/clickup/webhook/${id}`, { method: "POST", headers, body }), { params: Promise.resolve({ integrationId: id }) });
  await Promise.all(background.splice(0));
  return res;
}

async function ticketOf(taskId: string) {
  const [row] = await db
    .select({ id: schema.ticket.id, title: schema.ticket.title, status: schema.status.name })
    .from(schema.externalRef)
    .innerJoin(schema.ticket, eq(schema.ticket.id, schema.externalRef.localId))
    .innerJoin(schema.status, eq(schema.status.id, schema.ticket.statusId))
    .where(and(eq(schema.externalRef.integrationId, integrationId), eq(schema.externalRef.entityType, "task"), eq(schema.externalRef.externalId, taskId)));
  return row;
}

async function labelsOf(ticketId: string) {
  const rows = await db.select({ name: schema.label.name }).from(schema.ticketLabel).innerJoin(schema.label, eq(schema.label.id, schema.ticketLabel.labelId)).where(eq(schema.ticketLabel.ticketId, ticketId));
  return rows.map((r) => r.name).sort();
}

describe("ClickUp webhooks", () => {
  it("registers one webhook per integration, sealed, filtered to the single space", async () => {
    // No public https address (dev, E2E): nothing is registered, polling stays.
    expect(await ws.registerWebhook(wsId, integrationId, { connector: connector(), baseUrl: null })).toBeNull();
    expect(fake.webhooks).toHaveLength(0);

    expect(await ws.registerWebhook(wsId, integrationId, opts())).toBe("active");
    expect(fake.webhooks).toHaveLength(1);
    expect(fake.webhooks[0]!.endpoint).toBe(`${BASE}/api/integrations/clickup/webhook/${integrationId}`);
    const [row] = await db.select({ webhook: schema.integration.webhook, status: schema.integration.webhookStatus }).from(schema.integration).where(eq(schema.integration.id, integrationId));
    expect(row!.status).toBe("active");
    expect(row!.webhook).toMatch(/^v1:/);
    expect(row!.webhook).not.toContain(fake.webhooks[0]!.secret);
    expect(await hooks.openWebhook(wsId, integrationId)).toEqual({ id: fake.webhooks[0]!.id, secret: fake.webhooks[0]!.secret });
    // Another workspace cannot read it, and the overview carries only the status.
    expect(await hooks.openWebhook(otherWsId, integrationId)).toBeNull();
    expect((await q.findIntegration(wsId, "clickup"))?.webhookStatus).toBe("active");
  });

  it("re-registers on a new selection: the old webhook is removed", async () => {
    const before = fake.webhooks[0]!.id;
    await q.updateIntegrationConfig(wsId, integrationId, { spaceIds: ["s-1"], listIds: ["l-3"] });
    expect(await ws.registerWebhook(wsId, integrationId, opts())).toBe("active");
    expect(fake.webhooks.map((w) => w.id)).not.toContain(before);
    expect(fake.webhooks).toHaveLength(1);
  });

  it("endpoint: unknown ids 404, wrong or missing signature 401 – nothing queued", async () => {
    const hook = (await hooks.openWebhook(wsId, integrationId))!;
    const event = { event: "taskUpdated", task_id: "t-1", webhook_id: hook.id };
    expect((await post("not-a-uuid", event, (b) => sign(b, hook.secret))).status).toBe(404);
    expect((await post(crypto.randomUUID(), event, (b) => sign(b, hook.secret))).status).toBe(404);
    expect((await post(integrationId, event)).status).toBe(401);
    expect((await post(integrationId, event, (b) => sign(b, "not-the-secret"))).status).toBe(401);
    expect((await post(integrationId, event, (b) => sign(b + " ", hook.secret))).status).toBe(401);
    expect(await hooks.queuedEvents({ id: integrationId, workspaceId: wsId }, 10)).toHaveLength(0);
  });

  it("a signed event updates the ticket through the sync writer; the same event twice changes nothing", async () => {
    const hook = (await hooks.openWebhook(wsId, integrationId))!;
    const t1 = data.tasks.find((t) => t.id === "t-1")!;
    t1.name = "Kampagne planen (Echtzeit)";
    t1.status = "complete";
    t1.statusType = "closed";
    t1.updated = 1_760_100_000_000;
    // The route builds its connector from the stored token; the fake answers like ClickUp would.
    const realFetch = globalThis.fetch;
    globalThis.fetch = fake.fetch;
    try {
      const event = { event: "taskUpdated", task_id: "t-1", webhook_id: hook.id, history_items: [] };
      const res = await post(integrationId, event, (b) => sign(b, hook.secret));
      expect(res.status).toBe(204);
      expect(await ticketOf("t-1")).toMatchObject({ title: "Kampagne planen (Echtzeit)", status: "Erledigt" });
      expect((await q.findIntegration(wsId, "clickup"))?.webhookEventAt).not.toBeNull();

      const reads = fake.log.filter((l) => l.startsWith("GET /api/v2/task/t-1?")).length;
      expect((await post(integrationId, event, (b) => sign(b, hook.secret))).status).toBe(204);
      expect(fake.log.filter((l) => l.startsWith("GET /api/v2/task/t-1?")).length).toBe(reads + 1);
      expect(await ticketOf("t-1")).toMatchObject({ title: "Kampagne planen (Echtzeit)" });
      const count = await db.select({ id: schema.ticket.id }).from(schema.ticket).where(eq(schema.ticket.workspaceId, wsId));
      expect(count).toHaveLength(4);
      expect(await hooks.queuedEvents({ id: integrationId, workspaceId: wsId }, 10)).toHaveLength(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("queues idempotently and waits for the lease of a running poll", async () => {
    const target = { integrationId, workspaceId: wsId };
    await hooks.enqueueWebhookEvent(target, { taskId: "t-5", kind: "task" });
    await hooks.enqueueWebhookEvent(target, { taskId: "t-5", kind: "task" });
    await hooks.enqueueWebhookEvent(target, { taskId: "t-5", kind: "comment" });
    expect(await hooks.queuedEvents({ id: integrationId, workspaceId: wsId }, 10)).toHaveLength(2);

    const lease = await claimIntegration(integrationId, 60_000);
    expect(lease).not.toBeNull();
    expect(await ws.processWebhookEvents(integrationId, opts())).toBeNull();
    expect(await hooks.queuedEvents({ id: integrationId, workspaceId: wsId }, 10)).toHaveLength(2);
    await releaseIntegration(lease!, {});

    data.comments["t-5"] = [{ id: "c-wh-1", text: "Angebot ist raus", userId: 101, date: 1_760_100_000_000 }];
    const done = await ws.processWebhookEvents(integrationId, opts());
    // t-5 sits in the list selected since the second test: created by the event, its comment fetched.
    expect(done).toMatchObject({ processed: 2, created: 1, comments: 1, error: null });
    expect(await hooks.queuedEvents({ id: integrationId, workspaceId: wsId }, 10)).toHaveLength(0);
  });

  it("a task deleted in ClickUp keeps its ticket and gets the label „In ClickUp gelöscht“", async () => {
    const t4 = (await ticketOf("t-4"))!;
    data.tasks = data.tasks.filter((t) => t.id !== "t-4");
    const target = { integrationId, workspaceId: wsId };
    await hooks.enqueueWebhookEvent(target, { taskId: "t-4", kind: "deleted" });
    await hooks.enqueueWebhookEvent(target, { taskId: "t-4", kind: "task" });
    expect(await ws.processWebhookEvents(integrationId, opts())).toMatchObject({ processed: 2, deleted: 1, error: null });
    expect(await ticketOf("t-4")).toMatchObject({ id: t4.id, title: "Newsletter" });
    expect(await labelsOf(t4.id)).toContain("In ClickUp gelöscht");
    // Twice: still one label.
    await hooks.enqueueWebhookEvent(target, { taskId: "t-4", kind: "deleted" });
    await ws.processWebhookEvents(integrationId, opts());
    expect((await labelsOf(t4.id)).filter((l) => l === "In ClickUp gelöscht")).toHaveLength(1);
  });

  it("polls every 30 minutes while healthy, every 5 when failing; health check re-registers", async () => {
    await db.update(schema.integration).set({ lastSyncAt: new Date(Date.now() - 10 * 60_000), syncRequestedAt: null }).where(eq(schema.integration.id, integrationId));
    expect(await dueIntegrationIds(5 * 60_000, 30 * 60_000)).not.toContain(integrationId);

    fake.webhooks[0]!.status = "failing";
    expect(await ws.maintainWebhook(integrationId, opts())).toBe("failing");
    expect(await dueIntegrationIds(5 * 60_000, 30 * 60_000)).toContain(integrationId);

    const old = fake.webhooks[0]!.id;
    fake.webhooks[0]!.status = "suspended";
    expect(await ws.maintainWebhook(integrationId, opts())).toBe("active");
    expect(fake.webhooks.map((w) => w.id)).not.toContain(old);
    expect(fake.webhooks).toHaveLength(1);
  });

  it("disconnect removes the webhook at ClickUp, then the endpoint answers 404", async () => {
    const hook = (await hooks.openWebhook(wsId, integrationId))!;
    await ws.removeWebhook(wsId, integrationId, opts());
    expect(fake.webhooks).toHaveLength(0);
    expect((await q.findIntegration(wsId, "clickup"))?.webhookStatus).toBeNull();
    const event = { event: "taskUpdated", task_id: "t-1", webhook_id: hook.id };
    expect((await post(integrationId, event, (b) => sign(b, hook.secret))).status).toBe(404);
    expect(await q.deleteIntegration(wsId, integrationId)).toBe(true);
    expect((await post(integrationId, event, (b) => sign(b, hook.secret))).status).toBe(404);
  });
});
