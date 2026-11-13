// Ticket hierarchy (epic → story/task → subtask) against Postgres: app checks, the trigger as
// second line of defence, deletion, checklist conversion and export. Own workspaces, removed afterwards.
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { createProjectWithDefaults } = await import("@/db/queries/projects");
const { asHierarchyError, convertChecklistItem, createTicket, listActivity, listTickets, updateTicket } = await import("@/db/queries/tickets");
const parts = await import("@/db/queries/ticket-parts");
const { exportWorkspace } = await import("@/db/queries/export");

const run = `h${Date.now().toString(36)}`;
const cleanup = { users: [] as string[], workspaces: [] as string[] };
const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==", "base64"));

async function setup(label: string) {
  const ownerId = `${run}-${label}`;
  await db.insert(schema.user).values({ id: ownerId, name: ownerId, email: `${ownerId}@${run}.de` });
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `${label}-${run}.de`, slug: `${label}-${run}` }).returning();
  await db.insert(schema.membership).values({ workspaceId: ws!.id, userId: ownerId, role: "owner" });
  cleanup.users.push(ownerId);
  cleanup.workspaces.push(ws!.id);
  const mk = (key: string, sort: string) => db.transaction((tx) => createProjectWithDefaults(tx, { workspaceId: ws!.id, name: key, key, color: "#FF6B5B", sort }));
  const { project } = await mk("PRJ", "a0");
  const { project: other } = await mk("OTH", "a1");
  return { actor: { userId: ownerId, workspaceId: ws!.id }, projectId: project.id, otherProjectId: other.id };
}

let a: Awaited<ReturnType<typeof setup>>;
let b: Awaited<ReturnType<typeof setup>>;
const make = (type: "epic" | "story" | "task" | "subtask", parentId: string | null = null, title: string = type) =>
  createTicket(a.actor, { projectId: a.projectId, title, type, parentId });

beforeAll(async () => {
  a = await setup("ha");
  b = await setup("hb");
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, cleanup.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, cleanup.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, cleanup.users));
});

describe("creating with parents", () => {
  it("defaults to task without parent", async () => {
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Standard" });
    expect([t.type, t.parentId]).toEqual(["task", null]);
  });

  it("builds epic → story → subtask and task → subtask", async () => {
    const epic = await make("epic");
    const story = await make("story", epic.id);
    const task = await make("task", epic.id);
    const sub1 = await make("subtask", story.id);
    const sub2 = await make("subtask", task.id);
    expect([story.parentId, task.parentId, sub1.parentId, sub2.parentId]).toEqual([epic.id, epic.id, story.id, task.id]);
  });

  it("rejects forbidden parents with readable codes", async () => {
    const epic = await make("epic");
    const story = await make("story", epic.id);
    const sub = await make("subtask", story.id);
    await expect(make("epic", epic.id)).rejects.toMatchObject({ code: "epic_no_parent" });
    await expect(make("story", story.id)).rejects.toMatchObject({ code: "parent_must_be_epic" });
    await expect(make("task", sub.id)).rejects.toMatchObject({ code: "parent_must_be_epic" });
    await expect(make("subtask")).rejects.toMatchObject({ code: "subtask_needs_parent" });
    await expect(make("subtask", epic.id)).rejects.toMatchObject({ code: "parent_must_be_story_or_task" });
    await expect(make("subtask", sub.id)).rejects.toMatchObject({ code: "parent_must_be_story_or_task" });
  });

  it("rejects parents from another project or workspace", async () => {
    const otherEpic = await createTicket(a.actor, { projectId: a.otherProjectId, title: "Fremdes Epic", type: "epic" });
    await expect(make("story", otherEpic.id)).rejects.toMatchObject({ code: "invalid_parent" });
    const foreignEpic = await createTicket(b.actor, { projectId: b.projectId, title: "Anderer Workspace", type: "epic" });
    await expect(make("story", foreignEpic.id)).rejects.toMatchObject({ code: "invalid_parent" });
  });
});

describe("changing type and parent", () => {
  it("refuses type changes that would break the ticket or its children", async () => {
    const epic = await make("epic");
    const task = await make("task", epic.id);
    await make("subtask", task.id);
    await expect(updateTicket(a.actor, epic.id, { type: "task" })).rejects.toMatchObject({ code: "epic_has_children" });
    await expect(updateTicket(a.actor, task.id, { type: "epic" })).rejects.toMatchObject({ code: "epic_no_parent" });
    await expect(updateTicket(a.actor, task.id, { type: "epic", parentId: null })).rejects.toMatchObject({ code: "has_subtasks" });
    await expect(updateTicket(a.actor, task.id, { type: "subtask" })).rejects.toMatchObject({ code: "parent_must_be_story_or_task" });
    const story = await updateTicket(a.actor, task.id, { type: "story" });
    expect(story.type).toBe("story");
  });

  it("moves, detaches and logs type and parent changes", async () => {
    const e1 = await make("epic", null, "E1");
    const e2 = await make("epic", null, "E2");
    const story = await make("story", e1.id);
    await updateTicket(a.actor, story.id, { parentId: e2.id });
    await updateTicket(a.actor, story.id, { parentId: null, type: "task" });
    const types = (await listActivity(a.actor.workspaceId, story.id)).map((x) => [x.type, x.payload]);
    expect(types).toContainEqual(["parent", { from: `PRJ-${e1.number}`, to: `PRJ-${e2.number}` }]);
    expect(types).toContainEqual(["parent", { from: `PRJ-${e2.number}`, to: null }]);
    expect(types).toContainEqual(["type", { from: "story", to: "task" }]);
  });

  it("the trigger enforces the rules even past the app", async () => {
    const epic = await make("epic");
    const story = await make("story", epic.id);
    const sub = await make("subtask", story.id);
    // The database error text sits in `cause`; asHierarchyError reads it like the app does.
    const raw = async (q: ReturnType<typeof sql>) => {
      try {
        await db.execute(q);
        return "ok";
      } catch (e) {
        return asHierarchyError(e)?.code ?? "other_error";
      }
    };
    expect(await raw(sql`update ticket set type = 'task' where id = ${epic.id}`)).toBe("epic_has_children");
    expect(await raw(sql`update ticket set type = 'epic', parent_id = null where id = ${story.id}`)).toBe("has_subtasks");
    expect(await raw(sql`update ticket set parent_id = null where id = ${sub.id}`)).toBe("subtask_needs_parent");
    expect(await raw(sql`update ticket set parent_id = ${sub.id} where id = ${story.id}`)).toBe("parent_must_be_epic");
    expect(await raw(sql`update ticket set type = 'subtask' where id = ${epic.id}`)).toBe("subtask_needs_parent");
    expect(await raw(sql`update ticket set parent_id = ${story.id} where id = ${story.id}`)).toBe("parent_must_be_epic"); // and CHECK ticket_parent_not_self behind it
    expect(await raw(sql`update ticket set type = 'story' where id = ${story.id}`)).toBe("ok");
  });
});

describe("deleting", () => {
  it("deletes subtasks (with their attachments and comments), keeps the epic's stories", async () => {
    const epic = await make("epic");
    const story = await make("story", epic.id);
    const task = await make("task", epic.id);
    const sub = await make("subtask", story.id);
    await parts.createAttachment(a.actor, sub.id, { bytes: PNG, fileName: "bild.png" });
    await parts.createComment(a.actor, sub.id, "Kommentar");

    await db.delete(schema.ticket).where(eq(schema.ticket.id, story.id));
    const remaining = await db.select({ id: schema.ticket.id }).from(schema.ticket).where(inArray(schema.ticket.id, [story.id, sub.id]));
    expect(remaining).toEqual([]);
    const orphans = await db.select().from(schema.attachment).where(eq(schema.attachment.ticketId, sub.id));
    expect(orphans).toEqual([]);

    await db.delete(schema.ticket).where(eq(schema.ticket.id, epic.id));
    const [left] = await db.select({ parentId: schema.ticket.parentId, type: schema.ticket.type }).from(schema.ticket).where(eq(schema.ticket.id, task.id));
    expect(left).toEqual({ parentId: null, type: "task" });
  });

  it("deleting a whole project with a hierarchy works in one statement", async () => {
    const { project } = await db.transaction((tx) => createProjectWithDefaults(tx, { workspaceId: a.actor.workspaceId, name: "Weg", key: "WEG", color: "#FF6B5B", sort: "a2" }));
    const epic = await createTicket(a.actor, { projectId: project.id, title: "E", type: "epic" });
    const story = await createTicket(a.actor, { projectId: project.id, title: "S", type: "story", parentId: epic.id });
    await createTicket(a.actor, { projectId: project.id, title: "U", type: "subtask", parentId: story.id });
    await db.delete(schema.project).where(eq(schema.project.id, project.id));
    expect(await db.select().from(schema.ticket).where(eq(schema.ticket.projectId, project.id))).toEqual([]);
  });
});

describe("checklist → subtask", () => {
  it("turns an item into a subtask ticket under a story or task and removes the item", async () => {
    const task = await make("task", null, "Mit Checkliste");
    const item = await parts.createSubtask(a.actor, task.id, "Punkt eins");
    await parts.updateSubtask(a.actor, item.id, { done: true });
    const sub = await convertChecklistItem(a.actor, item.id);
    expect(sub).toMatchObject({ type: "subtask", parentId: task.id, title: "Punkt eins" });
    expect(sub.completedAt).not.toBeNull(); // done carries over as a done status
    expect(await parts.listSubtasks(a.actor.workspaceId, task.id)).toEqual([]);
    const log = (await listActivity(a.actor.workspaceId, task.id)).map((x) => x.type);
    expect(log).toContain("checklist_converted");
  });

  it("refuses for epics, subtasks and other workspaces", async () => {
    const epic = await make("epic");
    const item = await parts.createSubtask(a.actor, epic.id, "Am Epic");
    await expect(convertChecklistItem(a.actor, item.id)).rejects.toMatchObject({ code: "checklist_needs_story_or_task" });
    await expect(convertChecklistItem(b.actor, item.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await parts.listSubtasks(a.actor.workspaceId, epic.id)).toHaveLength(1);
  });
});

it("exports type and parentNumber per ticket", async () => {
  const epic = await make("epic", null, "Export-Epic");
  const story = await make("story", epic.id, "Export-Story");
  const data = await exportWorkspace(a.actor.workspaceId);
  const tickets = data.projects.find((p) => p.key === "PRJ")!.tickets;
  expect(tickets.find((t) => t.number === epic.number)).toMatchObject({ type: "epic", parentNumber: null });
  expect(tickets.find((t) => t.number === story.number)).toMatchObject({ type: "story", parentNumber: epic.number });
  expect(data.version).toBe(2);
  const rows = await listTickets(a.actor.workspaceId, a.projectId);
  expect(rows.find((r) => r.id === story.id)?.parentId).toBe(epic.id);
});
