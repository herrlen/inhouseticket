// ClickUp CSV import against Postgres with the invented fixture export: one project per space,
// real subtasks under the top-most parent, labels, own statuses, comments; importing the same
// file again creates nothing; the API sync finds CSV tasks, projects and comments again; a resumed
// run continues at its cursor; nothing leaks into another workspace.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const q = await import("@/db/queries/clickup-import");
const { findTicketSource } = await import("@/db/queries/integrations");
const { SyncWriter } = await import("@/db/queries/integration-sync");
const { runCsvImport } = await import("@/lib/integrations/csv-import");
const { previewClickUpCsv } = await import("@/lib/import/clickup-plan");

const FIXTURE = readFileSync(join(__dirname, "..", "..", "lib", "import", "__fixtures__", "clickup-export.csv"), "utf8").replace(/\r\n/g, "\n");
const run = Date.now().toString(36);
const ids = { users: [] as string[], workspaces: [] as string[] };

async function setup(label: string, name: string) {
  const userId = `csv-${label}-${run}`;
  await db.insert(schema.user).values({ id: userId, name, email: `${label}@csv-${label}-${run}.example` });
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `csv-${label}-${run}.example`, slug: `csv-${label}-${run}` }).returning();
  await db.insert(schema.membership).values({ workspaceId: ws!.id, userId, role: "owner" });
  ids.users.push(userId);
  ids.workspaces.push(ws!.id);
  return { userId, wsId: ws!.id };
}

/** Upload + start with the preview's suggestions, as the import page does. */
async function start(actor: { userId: string; wsId: string }, overrides: Record<string, "own" | "Offen" | "In Arbeit" | "Review" | "Erledigt"> = {}) {
  const plan = previewClickUpCsv(FIXTURE, []);
  if (!plan.ok) throw new Error(plan.error);
  const uploadId = await q.saveImportUpload({ workspaceId: actor.wsId, userId: actor.userId, fileName: "export.csv", content: FIXTURE, bytes: FIXTURE.length, tasks: plan.preview.tasks });
  const statuses = plan.preview.statuses.map((s) => ({ name: s.name, target: overrides[s.name] ?? s.target, category: s.category }));
  const started = await q.startClickUpCsvRun({ workspaceId: actor.wsId, userId: actor.userId }, uploadId, statuses);
  if (!started.ok) throw new Error(started.error);
  return { ...started, uploadId };
}

async function tickets(wsId: string) {
  return db
    .select({ id: schema.ticket.id, title: schema.ticket.title, type: schema.ticket.type, parentId: schema.ticket.parentId, assigneeId: schema.ticket.assigneeId, priority: schema.ticket.priority, status: schema.status.name, project: schema.project.name })
    .from(schema.ticket)
    .innerJoin(schema.status, eq(schema.status.id, schema.ticket.statusId))
    .innerJoin(schema.project, eq(schema.project.id, schema.ticket.projectId))
    .where(eq(schema.ticket.workspaceId, wsId))
    .orderBy(asc(schema.ticket.title));
}

async function labelsOf(ticketId: string) {
  const rows = await db.select({ name: schema.label.name }).from(schema.ticketLabel).innerJoin(schema.label, eq(schema.label.id, schema.ticketLabel.labelId)).where(eq(schema.ticketLabel.ticketId, ticketId));
  return rows.map((r) => r.name).sort();
}

let a: Awaited<ReturnType<typeof setup>>;
let b: Awaited<ReturnType<typeof setup>>;
let first: Awaited<ReturnType<typeof start>>;

beforeAll(async () => {
  a = await setup("a", "Ina Beispiel");
  b = await setup("b", "Ina Beispiel");
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, ids.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

describe("ClickUp CSV import", () => {
  it("imports spaces as projects, subtasks under their top-most parent, labels, statuses and comments", async () => {
    first = await start(a, { "Wartet auf Kunde": "own" });
    const result = await runCsvImport(first.integrationId);
    expect(result).toMatchObject({ error: null, finished: true });
    expect(result!.counts).toMatchObject({ read: 7, created: 7, unchanged: 0, errors: 0, comments: 2, duplicates: 1, skipped: 1, unlinked: 0 });

    const rows = await tickets(a.wsId);
    const by = new Map(rows.map((r) => [r.title, r]));
    expect([...new Set(rows.map((r) => r.project))].sort()).toEqual(["Marketing", "Produkt"]);
    const top = by.get("Kampagne Herbst planen")!;
    expect(top).toMatchObject({ type: "task", parentId: null, assigneeId: a.userId, priority: 3, status: "In Arbeit", project: "Marketing" });
    for (const title of ["Texte schreiben", "Korrektur lesen", "Freigabe einholen"]) expect(by.get(title)).toMatchObject({ type: "subtask", parentId: top.id, status: "Erledigt" });
    expect(by.get("Unteraufgabe ohne Eltern")).toMatchObject({ type: "task", parentId: null, status: "Erledigt" });
    expect(by.get('Release "2.0"')).toMatchObject({ status: "Wartet auf Kunde", priority: 4, project: "Produkt" });
    expect(by.get("Login reparieren")).toMatchObject({ status: "Offen", priority: 0 });

    expect(await labelsOf(top.id)).toEqual(["Herbst 2026", "Kampagnen", "mail", "social"]);
    expect(await labelsOf(by.get('Release "2.0"')!.id)).toEqual(["Backlog", "Meilenstein"]);
    const checklist = await db.select({ title: schema.subtask.title }).from(schema.subtask).where(eq(schema.subtask.ticketId, top.id));
    expect(checklist).toHaveLength(5);
    const comments = await db.select({ body: schema.comment.body, authorId: schema.comment.authorId, createdAt: schema.comment.createdAt }).from(schema.comment).where(eq(schema.comment.ticketId, top.id)).orderBy(asc(schema.comment.createdAt));
    expect(comments).toEqual([
      { body: "_Aus ClickUp übernommen_\n\nBitte bis Freitag fertig machen", authorId: a.userId, createdAt: new Date("2026-09-02T08:00:00Z") },
      { body: "_Aus ClickUp übernommen – Extern Person_\n\nErledigt & abgestimmt", authorId: a.userId, createdAt: new Date("2026-09-03T07:15:00Z") },
    ]);
    expect(await findTicketSource(a.wsId, top.id)).toEqual({ provider: "clickup", ref: "86fx0001", url: "https://app.clickup.com/t/86fx0001" });

    // The upload is gone, the run is in the protocol, the integration row has no token.
    expect(await q.loadImportContent(a.wsId, first.uploadId)).toBeNull();
    expect(await q.findCsvRun(a.wsId, first.runId)).toMatchObject({ done: 7, total: 7, error: null, running: false });
    const [integ] = await db.select({ credentials: schema.integration.credentials, status: schema.integration.status }).from(schema.integration).where(eq(schema.integration.id, first.integrationId));
    expect(integ).toEqual({ credentials: "", status: "setup" });
  });

  it("importing the same file again creates nothing", async () => {
    const before = await tickets(a.wsId);
    const again = await start(a);
    expect(again.integrationId).toBe(first.integrationId);
    const result = await runCsvImport(again.integrationId);
    expect(result!.counts).toMatchObject({ read: 7, created: 0, unchanged: 7, comments: 0, errors: 0 });
    expect(await tickets(a.wsId)).toEqual(before);
    const comments = await db.select({ id: schema.comment.id }).from(schema.comment).where(eq(schema.comment.workspaceId, a.wsId));
    expect(comments).toHaveLength(2);
    expect(await q.countKnownTasks(a.wsId, ["86fx0001", "86fx0010", "unknown"])).toBe(2);
  });

  it("the API sync finds CSV tasks, the space's project and the comments again", async () => {
    const integ = { id: first.integrationId, workspaceId: a.wsId, provider: "clickup" as const, config: {}, createdBy: a.userId };
    const writer = new SyncWriter(integ, a.userId, "ClickUp", new Map([["90015", "Marketing"]]));
    await writer.load();
    // Same space by id: the CSV project is adopted.
    const [marketing] = await db.select({ id: schema.project.id }).from(schema.project).where(and(eq(schema.project.workspaceId, a.wsId), eq(schema.project.name, "Marketing")));
    expect(await writer.projectFor("90015")).toBe(marketing!.id);
    // Same task id: updated, not created again.
    const task = {
      id: "86fx0011", ref: "86fx0011", url: "https://app.clickup.com/t/86fx0011", title: "Login reparieren (API)", description: "", status: { name: "to do", type: "open", color: null },
      priority: 2, assignees: [], tags: [], parentId: null, spaceId: "90016", listId: "l1", listName: "Backlog", folderName: null, milestone: false, checklists: [],
      createdAt: null, updatedAt: new Date("2026-10-01T00:00:00Z"), doneAt: null, dueAt: null,
    };
    expect(await writer.upsertTask(task)).toBe("updated");
    expect((await tickets(a.wsId)).filter((t) => t.title.startsWith("Login reparieren"))).toHaveLength(1);
    // A comment from the API with its own id but the CSV's text and time is linked, not added.
    const top = (await tickets(a.wsId)).find((t) => t.title === "Kampagne Herbst planen")!;
    const [ref] = await db.select({ id: schema.externalRef.id }).from(schema.externalRef).where(and(eq(schema.externalRef.integrationId, first.integrationId), eq(schema.externalRef.externalId, "86fx0001")));
    const added = await writer.saveComments({ refId: ref!.id, ticketId: top.id }, [
      { id: "api-c-1", body: "Bitte bis Freitag fertig machen", author: { id: "101", name: "Ina Beispiel", email: null }, createdAt: new Date("2026-09-02T08:00:00.500Z") },
      { id: "api-c-2", body: "Neu aus der API", author: null, createdAt: new Date("2026-10-02T08:00:00Z") },
    ]);
    expect(added).toBe(1);
    const comments = await db.select({ id: schema.comment.id }).from(schema.comment).where(eq(schema.comment.ticketId, top.id));
    expect(comments).toHaveLength(3);
  });

  it("a resumed run continues at its cursor", async () => {
    const c = await setup("c", "Someone Else");
    const started = await start(c);
    // As if a crash happened after the first four tasks were saved.
    await db.update(schema.syncRun).set({ cursor: { uploadId: started.uploadId, actorId: c.userId, phase: "tasks", done: 4, total: 7 }, counts: { read: 4, created: 4 } }).where(eq(schema.syncRun.id, started.runId));
    const result = await runCsvImport(started.integrationId);
    expect(result!.counts).toMatchObject({ read: 7, created: 7 });
    expect((await tickets(c.wsId)).map((t) => t.title).sort()).toEqual(["Login reparieren", 'Release "2.0"', "Unteraufgabe ohne Eltern"].sort());
    // Nobody named like the assignees here: unassigned.
    expect((await tickets(c.wsId)).every((t) => t.assigneeId === null)).toBe(true);
  });

  it("one run per workspace at a time; other workspaces see nothing", async () => {
    const plan = previewClickUpCsv(FIXTURE, []);
    if (!plan.ok) throw new Error(plan.error);
    const upload = await q.saveImportUpload({ workspaceId: b.wsId, userId: b.userId, fileName: "x.csv", content: FIXTURE, bytes: 1, tasks: 7 });
    const startedB = await q.startClickUpCsvRun({ workspaceId: b.wsId, userId: b.userId }, upload, []);
    expect(startedB.ok).toBe(true);
    const second = await q.saveImportUpload({ workspaceId: b.wsId, userId: b.userId, fileName: "y.csv", content: FIXTURE, bytes: 1, tasks: 7 });
    expect(await q.startClickUpCsvRun({ workspaceId: b.wsId, userId: b.userId }, second, [])).toEqual({ ok: false, error: "busy" });

    // Workspace A's upload ids and runs are not reachable from B.
    expect(await q.startClickUpCsvRun({ workspaceId: b.wsId, userId: b.userId }, first.uploadId, [])).toEqual({ ok: false, error: "not_found" });
    expect(await q.findCsvRun(b.wsId, first.runId)).toBeNull();
    expect(await q.loadImportContent(b.wsId, first.uploadId)).toBeNull();
    expect(await tickets(b.wsId)).toEqual([]);
    expect(await q.countKnownTasks(b.wsId, ["86fx0001"])).toBe(0);
    expect(await q.pendingCsvIntegrationIds()).toContain(startedB.ok ? startedB.integrationId : "");
  });
});
