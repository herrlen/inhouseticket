// Ticket data layer against Postgres. Creates its own workspaces and removes them afterwards.
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { createProjectWithDefaults } = await import("@/db/queries/projects");
const { createLabel, createTicket, listActivity, listTickets, updateTicket, TicketError } = await import("@/db/queries/tickets");

const run = `t${Date.now().toString(36)}`;
const cleanup = { users: [] as string[], workspaces: [] as string[] };

async function workspaceWithProject(label: string) {
  const userId = `${run}-${label}`;
  await db.insert(schema.user).values({ id: userId, name: `User ${label}`, email: `${userId}@${run}.de` });
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `${label}-${run}.de`, slug: `${label}-${run}` }).returning();
  await db.insert(schema.membership).values({ workspaceId: ws!.id, userId, role: "owner" });
  cleanup.users.push(userId);
  cleanup.workspaces.push(ws!.id);
  const { project, openStatus } = await db.transaction((tx) =>
    createProjectWithDefaults(tx, { workspaceId: ws!.id, name: "P", key: "PRJ", color: "#FF6B5B", sort: "a0" }),
  );
  const statuses = await db.select().from(schema.status).where(eq(schema.status.projectId, project.id));
  return { actor: { userId, workspaceId: ws!.id }, projectId: project.id, openStatus, statuses };
}

let a: Awaited<ReturnType<typeof workspaceWithProject>>;
let b: Awaited<ReturnType<typeof workspaceWithProject>>;

beforeAll(async () => {
  a = await workspaceWithProject("ta");
  b = await workspaceWithProject("tb");
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, cleanup.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, cleanup.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, cleanup.users));
});

describe("createTicket", () => {
  it("numbers tickets atomically, also under concurrency", async () => {
    const created = await Promise.all(Array.from({ length: 12 }, (_, i) => createTicket(a.actor, { projectId: a.projectId, title: `T${i}` })));
    const numbers = created.map((t) => t.number).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(12);
    expect(numbers[0]).toBeGreaterThanOrEqual(1);
  });

  it("defaults to the first open status, priority none, and logs 'created'", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Default" });
    expect(t.statusId).toBe(a.openStatus.id);
    expect(t.priority).toBe(0);
    const log = await listActivity(a.actor.workspaceId, t.id);
    expect(log.map((l) => l.type)).toEqual(["created"]);
  });

  it("puts new tickets on top of the manual order", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Neuestes" });
    const list = await listTickets(a.actor.workspaceId, a.projectId);
    expect(list[0]!.id).toBe(t.id);
  });

  it("refuses projects of another workspace", async () => {
    await expect(createTicket(b.actor, { projectId: a.projectId, title: "fremd" })).rejects.toThrow(TicketError);
  });
});

describe("updateTicket", () => {
  it("sets completedAt when moving into a done status and clears it again", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Fertig machen" });
    const done = a.statuses.find((s) => s.category === "done")!;
    const updated = await updateTicket(a.actor, t.id, { statusId: done.id });
    expect(updated.completedAt).not.toBeNull();
    const reopened = await updateTicket(a.actor, t.id, { statusId: a.openStatus.id });
    expect(reopened.completedAt).toBeNull();
    const log = await listActivity(a.actor.workspaceId, t.id);
    expect(log.filter((l) => l.type === "status").map((l) => l.payload)).toEqual([
      { from: "Erledigt", to: "Offen" },
      { from: "Offen", to: "Erledigt" },
    ]);
  });

  it("logs only fields that really changed", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Gleich" });
    await updateTicket(a.actor, t.id, { title: "Gleich", priority: 3, dueDate: "2026-12-24" });
    const types = (await listActivity(a.actor.workspaceId, t.id)).map((l) => l.type).sort();
    expect(types).toEqual(["created", "due", "priority"]);
    expect((await listTickets(a.actor.workspaceId, a.projectId)).find((x) => x.id === t.id)!.dueDate).toBe("2026-12-24");
  });

  it("rejects assignees, statuses and labels from another workspace", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Schutz" });
    await expect(updateTicket(a.actor, t.id, { assigneeId: b.actor.userId })).rejects.toThrow("invalid_assignee");
    await expect(updateTicket(a.actor, t.id, { statusId: b.openStatus.id })).rejects.toThrow("invalid_status");
    const foreign = await createLabel(b.actor.workspaceId, b.projectId, { name: "Fremd", color: "#EF4444" });
    await expect(updateTicket(a.actor, t.id, { labelIds: [foreign.id] })).rejects.toThrow("invalid_label");
  });

  it("cannot touch a ticket of another workspace", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Meins" });
    await expect(updateTicket(b.actor, t.id, { title: "gehackt" })).rejects.toThrow("not_found");
  });

  it("replaces labels and logs added/removed names", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Labels" });
    const bug = await createLabel(a.actor.workspaceId, a.projectId, { name: "Bug", color: "#EF4444" });
    const ux = await createLabel(a.actor.workspaceId, a.projectId, { name: "UX", color: "#3B82F6" });
    expect((await updateTicket(a.actor, t.id, { labelIds: [bug.id, ux.id] })).labelIds.sort()).toEqual([bug.id, ux.id].sort());
    expect((await updateTicket(a.actor, t.id, { labelIds: [ux.id] })).labelIds).toEqual([ux.id]);
    const labels = (await listActivity(a.actor.workspaceId, t.id)).filter((l) => l.type === "labels").map((l) => l.payload);
    expect(labels).toEqual([{ added: [], removed: ["Bug"] }, { added: expect.arrayContaining(["Bug", "UX"]), removed: [] }]);
  });
});
