// Query-level tests against Postgres. Creates its own workspaces and deletes them afterwards.
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { getExplorer } = await import("@/db/queries/explorer");
const { createProjectWithDefaults, createTickets, listStatuses } = await import("@/db/queries/projects");

const run = Date.now().toString(36);
const ids = { users: [] as string[], workspaces: [] as string[] };

async function setup(label: string) {
  const userId = `q-${label}-${run}`;
  await db.insert(schema.user).values({ id: userId, name: label, email: `${userId}@q-${run}.de` });
  const [ws] = await db
    .insert(schema.workspace)
    .values({ name: label, domain: `${label}-${run}.de`, slug: `${label}-${run}` })
    .returning();
  ids.users.push(userId);
  ids.workspaces.push(ws!.id);
  return { userId, wsId: ws!.id };
}

let a: Awaited<ReturnType<typeof setup>>;
let b: Awaited<ReturnType<typeof setup>>;
let projectA1: string;

beforeAll(async () => {
  a = await setup("qa");
  b = await setup("qb");
  await db.transaction(async (tx) => {
    // Workspace A: project with 3 tickets (1 done), empty project.
    const p1 = await createProjectWithDefaults(tx, { workspaceId: a.wsId, name: "Eins", key: "ONE", color: "#FF6B5B", sort: "a0" });
    projectA1 = p1.project.id;
    await createTickets(tx, { workspaceId: a.wsId, projectId: p1.project.id, statusId: p1.openStatus.id, createdBy: a.userId,
      tickets: [{ title: "a", priority: 0 }, { title: "b", priority: 0 }, { title: "c", priority: 0 }] });
    const done = (await tx.select().from(schema.status).where(eq(schema.status.projectId, p1.project.id))).find((s) => s.category === "done")!;
    const [first] = await tx.select().from(schema.ticket).where(eq(schema.ticket.projectId, p1.project.id)).limit(1);
    await tx.update(schema.ticket).set({ statusId: done.id }).where(eq(schema.ticket.id, first!.id));
    await createProjectWithDefaults(tx, { workspaceId: a.wsId, name: "Zwei", key: "TWO", color: "#3A86FF", sort: "a1" });
    // Workspace B: a project with tickets that must never be counted in A.
    const p3 = await createProjectWithDefaults(tx, { workspaceId: b.wsId, name: "Fremd", key: "ONE", color: "#5B5BF7", sort: "a0" });
    await createTickets(tx, { workspaceId: b.wsId, projectId: p3.project.id, statusId: p3.openStatus.id, createdBy: b.userId,
      tickets: [{ title: "x", priority: 0 }] });
  });
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, ids.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

describe("getExplorer", () => {
  it("counts only open tickets and includes empty projects", async () => {
    const { projects } = await getExplorer(a.wsId, a.userId);
    expect(projects.map((p) => [p.key, p.openCount])).toEqual([["ONE", 2], ["TWO", 0]]);
  });

  it("never returns projects of another workspace", async () => {
    const { projects } = await getExplorer(b.wsId, b.userId);
    expect(projects.map((p) => [p.name, p.openCount])).toEqual([["Fremd", 1]]);
  });
});

describe("listStatuses", () => {
  it("counts tickets per status", async () => {
    const statuses = await listStatuses(a.wsId, projectA1);
    expect(statuses.map((s) => [s.name, s.ticketCount])).toEqual([["Offen", 2], ["In Arbeit", 0], ["Review", 0], ["Erledigt", 1]]);
  });
});
