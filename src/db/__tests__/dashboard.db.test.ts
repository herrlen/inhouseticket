// Dashboard figures against Postgres with controlled data. Own workspaces, removed afterwards.
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { createProjectWithDefaults } = await import("@/db/queries/projects");
const { createTicket, updateTicket } = await import("@/db/queries/tickets");
const { getDashboard, loadLevel } = await import("@/db/queries/dashboard");

const run = `d${Date.now().toString(36)}`;
const cleanup = { users: [] as string[], workspaces: [] as string[] };
const today = "2026-10-07"; // Wednesday

async function setup(label: string) {
  const users = [`${run}-${label}-a`, `${run}-${label}-b`];
  await db.insert(schema.user).values(users.map((id, i) => ({ id, name: i === 0 ? "Anna" : "Ben", email: `${id}@${run}.de` })));
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `${label}-${run}.de`, slug: `${label}-${run}`, workloadThreshold: 8 }).returning();
  await db.insert(schema.membership).values(users.map((userId) => ({ workspaceId: ws!.id, userId })));
  cleanup.users.push(...users);
  cleanup.workspaces.push(ws!.id);
  const { project } = await db.transaction((tx) => createProjectWithDefaults(tx, { workspaceId: ws!.id, name: "P", key: "PRJ", color: "#FF6B5B", sort: "a0" }));
  const statuses = await db.select().from(schema.status).where(eq(schema.status.projectId, project.id));
  return { actor: { userId: users[0]!, workspaceId: ws!.id }, users, projectId: project.id, statuses };
}

let a: Awaited<ReturnType<typeof setup>>;
let b: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  a = await setup("da");
  b = await setup("db");
  const [anna, ben] = a.users as [string, string];
  const active = a.statuses.find((s) => s.name === "In Arbeit")!;
  const done = a.statuses.find((s) => s.category === "done")!;
  const mk = (title: string, o: { priority?: number; assigneeId?: string; dueDate?: string }) => createTicket(a.actor, { projectId: a.projectId, title, ...o });
  await mk("dringend", { priority: 4, assigneeId: anna, dueDate: "2026-10-05" }); // overdue
  await mk("hoch", { priority: 3, assigneeId: anna, dueDate: "2026-10-07" }); // due today
  const keine = await mk("ohne prio", { assigneeId: anna, dueDate: "2026-10-09" });
  await updateTicket(a.actor, keine.id, { statusId: active.id });
  await mk("ben niedrig", { priority: 1, assigneeId: ben });
  const fertig = await mk("fertig", { priority: 4, assigneeId: ben, dueDate: "2026-10-01" });
  await updateTicket(a.actor, fertig.id, { statusId: done.id }); // done: not counted as load/overdue
  // Workspace B: noise that must never appear in A.
  await createTicket(b.actor, { projectId: b.projectId, title: "fremd", priority: 4, assigneeId: b.users[0]!, dueDate: "2026-10-01" });
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, cleanup.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, cleanup.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, cleanup.users));
});

describe("getDashboard", () => {
  it("weights open work per person (Keine counts as Niedrig), ignores done tickets", async () => {
    const d = await getDashboard(a.actor.workspaceId, { today });
    expect(d.threshold).toBe(8);
    expect(d.workload.map((w) => [w.name, w.open, w.score, w.overdue])).toEqual([
      ["Anna", 3, 4 + 3 + 1, 1],
      ["Ben", 1, 1, 0],
    ]);
  });

  it("reports project health and overdue tickets", async () => {
    const d = await getDashboard(a.actor.workspaceId, { today });
    expect(d.health.map((h) => [h.key, h.open, h.active, h.done, h.overdue])).toEqual([["PRJ", 3, 1, 1, 1]]);
    expect(d.overdue.map((o) => o.title)).toEqual(["dringend"]);
  });

  it("counts throughput per week (8 weeks) and due tickets per day (14 days)", async () => {
    const d = await getDashboard(a.actor.workspaceId, { today: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date()) });
    expect(d.throughput).toHaveLength(8);
    expect(d.throughput.at(-1)!.done).toBe(1); // completed just now, this week
    const fixed = await getDashboard(a.actor.workspaceId, { today });
    expect(fixed.dueDays).toHaveLength(14);
    expect(fixed.dueDays.filter((x) => x.count > 0)).toEqual([
      { day: "2026-10-07", count: 1 },
      { day: "2026-10-09", count: 1 },
    ]);
  });

  it("filters by project and never leaks another workspace", async () => {
    const d = await getDashboard(b.actor.workspaceId, { today });
    expect(d.workload.find((w) => w.name === "Anna")!.score).toBe(4);
    expect(d.overdue.map((o) => o.title)).toEqual(["fremd"]);
    const other = await getDashboard(a.actor.workspaceId, { today, projectId: b.projectId });
    expect(other.health).toEqual([]);
    expect(other.overdue).toEqual([]);
  });
});

describe("loadLevel", () => {
  it.each([
    [0, 12, "ok"],
    [8, 12, "ok"],
    [9, 12, "high"],
    [12, 12, "over"],
    [20, 12, "over"],
  ] as const)("%i of %i → %s", (score, threshold, level) => {
    expect(loadLevel(score, threshold)).toBe(level);
  });
});
