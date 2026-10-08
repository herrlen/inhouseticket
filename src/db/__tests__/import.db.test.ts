// Import writes against Postgres: numbering, statuses, labels, subtasks, comments, activity,
// all-or-nothing, and nothing leaks into another workspace.
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { ImportError, listImportMembers, runImport } = await import("@/db/queries/import");
const { buildPlan } = await import("@/lib/import/plan");
const { readImportFile } = await import("@/lib/import/read");

const run = Date.now().toString(36);
const ids = { users: [] as string[], workspaces: [] as string[] };

async function setup(label: string) {
  const userId = `imp-${label}-${run}`;
  await db.insert(schema.user).values({ id: userId, name: `Ina ${label}`, email: `${userId}@imp-${run}.de` });
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `${label}-${run}.de`, slug: `imp-${label}-${run}` }).returning();
  await db.insert(schema.membership).values({ workspaceId: ws!.id, userId, role: "owner" });
  ids.users.push(userId);
  ids.workspaces.push(ws!.id);
  return { userId, wsId: ws!.id };
}

let a: Awaited<ReturnType<typeof setup>>;
let b: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  a = await setup("a");
  b = await setup("b");
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, ids.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

function jira(assignee: string) {
  const subtasks = Array.from({ length: 7 }, (_, i) => `Teil ${i + 1},WEB-${10 + i},${2000 + i},Sub-task,Done,Done,,,,,10002,`);
  const csv = [
    "Summary,Issue key,Issue id,Issue Type,Status,Status Category,Priority,Assignee,Created,Labels,Parent id,Comment",
    `Neuer,WEB-2,10002,Task,In Review,In Progress,High,${assignee},05/Sep/26 9:00 AM,ux,,"06/Sep/26 8:00 AM;abc;Passt so"`,
    "Ältester,WEB-1,10001,Bug,Done,Done,Low,,01/Sep/26 9:00 AM,UX,,",
    ...subtasks,
  ].join("\n");
  const r = readImportFile("jira", new TextEncoder().encode(csv));
  if (!r.ok) throw new Error(r.error);
  return r.file;
}

describe("runImport", () => {
  it("creates a project with numbered tickets, labels, subtasks, comments and activity", async () => {
    const members = await listImportMembers(a.wsId);
    const plan = buildPlan(jira(`Ina a`), members, "Jira");
    const result = await runImport({ workspaceId: a.wsId, userId: a.userId }, { name: "Website", key: "WEB", color: "#5B5BF7", source: "Jira" }, plan);
    expect(result).toEqual({ projectKey: "WEB", tickets: 2 });

    const [p] = await db.select().from(schema.project).where(and(eq(schema.project.workspaceId, a.wsId), eq(schema.project.key, "WEB")));
    expect(p!.ticketSeq).toBe(2);
    const tickets = await db
      .select({ id: schema.ticket.id, number: schema.ticket.number, title: schema.ticket.title, status: schema.status.name, assigneeId: schema.ticket.assigneeId, completedAt: schema.ticket.completedAt, createdAt: schema.ticket.createdAt, description: schema.ticket.description })
      .from(schema.ticket)
      .innerJoin(schema.status, eq(schema.status.id, schema.ticket.statusId))
      .where(eq(schema.ticket.projectId, p!.id))
      .orderBy(asc(schema.ticket.sort));
    // Oldest gets number 1; the list shows the newest first.
    expect(tickets.map((t) => [t.number, t.title, t.status])).toEqual([[2, "Neuer", "Review"], [1, "Ältester", "Erledigt"]]);
    expect(tickets[0]!.assigneeId).toBe(a.userId);
    expect(tickets[0]!.createdAt.toISOString()).toBe("2026-09-05T09:00:00.000Z");
    expect(tickets[1]!.completedAt).not.toBeNull();
    expect(tickets[0]!.description).toContain("- [x] Teil 6\n- [x] Teil 7");

    const subs = await db.select().from(schema.subtask).where(eq(schema.subtask.ticketId, tickets[0]!.id));
    expect(subs).toHaveLength(5);
    const labels = await db.select({ name: schema.label.name }).from(schema.label).where(eq(schema.label.projectId, p!.id));
    expect(labels.map((l) => l.name)).toEqual(["ux"]);
    const links = await db.select().from(schema.ticketLabel).where(eq(schema.ticketLabel.projectId, p!.id));
    expect(links).toHaveLength(2);
    const [c] = await db.select().from(schema.comment).where(eq(schema.comment.ticketId, tickets[0]!.id));
    expect(c).toMatchObject({ authorId: a.userId, body: "_Aus Jira übernommen_\n\nPasst so" });
    expect(c!.createdAt.toISOString()).toBe("2026-09-06T08:00:00.000Z");
    const log = await db.select().from(schema.activity).where(eq(schema.activity.ticketId, tickets[1]!.id));
    expect(log).toEqual([expect.objectContaining({ type: "imported", payload: { source: "Jira", ref: "WEB-1" } })]);
  });

  it("does not assign people from another workspace", async () => {
    const plan = buildPlan(jira("Ina b"), await listImportMembers(a.wsId), "Jira");
    expect(plan.tickets[0]!.assigneeId).toBeNull();
    expect(plan.preview.people).toEqual([{ name: "Ina b", member: null, count: 1 }]);
  });

  it("refuses a taken key and writes nothing on failure", async () => {
    const plan = buildPlan(jira(""), [], "Jira");
    await expect(runImport({ workspaceId: a.wsId, userId: a.userId }, { name: "Nochmal", key: "WEB", color: "#5B5BF7", source: "Jira" }, plan)).rejects.toBeInstanceOf(ImportError);

    // Broken plan (status name unknown) → the transaction rolls back, no half project remains.
    const broken = { ...plan, tickets: plan.tickets.map((t) => ({ ...t, status: "Gibt es nicht" as "Offen" })) };
    await expect(runImport({ workspaceId: b.wsId, userId: b.userId }, { name: "Kaputt", key: "BRK", color: "#5B5BF7", source: "Jira" }, broken)).rejects.toThrow();
    expect(await db.select().from(schema.project).where(eq(schema.project.workspaceId, b.wsId))).toEqual([]);
  });
});
