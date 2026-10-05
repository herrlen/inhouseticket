// Subtasks, attachments, comments against Postgres. Own workspaces, removed afterwards.
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { createProjectWithDefaults } = await import("@/db/queries/projects");
const { createTicket, listTickets } = await import("@/db/queries/tickets");
const parts = await import("@/db/queries/ticket-parts");

const run = `p${Date.now().toString(36)}`;
const cleanup = { users: [] as string[], workspaces: [] as string[] };
const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGP4z8AAQQxwFgBB0gX7h/C5SAAAAABJRU5ErkJggg==", "base64"));

async function setup(label: string, extraMembers: string[] = []) {
  const ownerId = `${run}-${label}`;
  const users = [ownerId, ...extraMembers.map((m) => `${run}-${label}-${m}`)];
  await db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@${run}.de` })));
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `${label}-${run}.de`, slug: `${label}-${run}` }).returning();
  await db.insert(schema.membership).values(users.map((userId, i) => ({ workspaceId: ws!.id, userId, role: i === 0 ? ("owner" as const) : ("member" as const) })));
  cleanup.users.push(...users);
  cleanup.workspaces.push(ws!.id);
  const { project } = await db.transaction((tx) => createProjectWithDefaults(tx, { workspaceId: ws!.id, name: "P", key: "PRJ", color: "#FF6B5B", sort: "a0" }));
  const actor = { userId: ownerId, workspaceId: ws!.id };
  const t = await createTicket(actor, { projectId: project.id, title: "Mit Teilen" });
  return { actor, users, projectId: project.id, ticketId: t.id };
}

let a: Awaited<ReturnType<typeof setup>>;
let b: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  a = await setup("pa", ["kim"]);
  b = await setup("pb");
});

afterAll(async () => {
  await db.delete(schema.ticket).where(inArray(schema.ticket.workspaceId, cleanup.workspaces));
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, cleanup.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, cleanup.users));
});

describe("subtasks", () => {
  it("allows 5 per ticket, counts progress, rejects the 6th with a typed error", async () => {
    const created = [];
    for (let i = 0; i < 5; i++) created.push(await parts.createSubtask(a.actor, a.ticketId, `Schritt ${i + 1}`));
    await parts.updateSubtask(a.actor, created[0]!.id, { done: true });
    await parts.updateSubtask(a.actor, created[1]!.id, { done: true });
    await expect(parts.createSubtask(a.actor, a.ticketId, "zu viel")).rejects.toMatchObject({ code: "max_subtasks" });
    const row = (await listTickets(a.actor.workspaceId, a.projectId)).find((t) => t.id === a.ticketId)!;
    expect([row.subtaskDone, row.subtaskTotal]).toEqual([2, 5]);
  });

  it("is invisible to other workspaces", async () => {
    const [one] = await parts.listSubtasks(a.actor.workspaceId, a.ticketId);
    await expect(parts.updateSubtask(b.actor, one!.id, { done: false })).rejects.toMatchObject({ code: "not_found" });
    expect(await parts.listSubtasks(b.actor.workspaceId, a.ticketId)).toEqual([]);
  });
});

describe("attachments", () => {
  it("stores a real PNG with its sniffed size and serves it only inside the workspace", async () => {
    const row = await parts.createAttachment(a.actor, a.ticketId, { bytes: PNG, fileName: "../../etc/passwd.png" });
    expect(row).toMatchObject({ mime: "image/png", width: 3, height: 2, bytes: PNG.byteLength, fileName: "....etcpasswd.png" });
    expect((await parts.getAttachmentFile(a.actor.workspaceId, row.key))?.data.equals(Buffer.from(PNG))).toBe(true);
    expect(await parts.getAttachmentFile(b.actor.workspaceId, row.key)).toBeNull();
  });

  it("rejects non-images regardless of the file name", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(parts.createAttachment(a.actor, a.ticketId, { bytes: svg, fileName: "bild.png" })).rejects.toMatchObject({ code: "invalid_image" });
    await expect(parts.createAttachment(a.actor, a.ticketId, { bytes: new Uint8Array(102_401), fileName: "x.png" })).rejects.toMatchObject({ code: "too_large" });
  });

  it("cannot attach to a ticket of another workspace", async () => {
    await expect(parts.createAttachment(b.actor, a.ticketId, { bytes: PNG, fileName: "x.png" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleting attachments (uploader, ticket author, admin)", () => {
  it("allows the uploader, the ticket author and admins – nobody else", async () => {
    const c = await setup("pc", ["kim", "lea"]);
    const [, kim, lea] = c.users as [string, string, string];
    const as = (userId: string) => ({ userId, workspaceId: c.actor.workspaceId });
    // The owner (c.actor) authored the ticket.
    const kims = await parts.createAttachment(as(kim), c.ticketId, { bytes: PNG, fileName: "kim.png" });
    await expect(parts.deleteAttachment(as(lea), kims.id, false)).rejects.toMatchObject({ code: "forbidden" });
    await parts.deleteAttachment(as(kim), kims.id, false); // uploader

    const leas = await parts.createAttachment(as(lea), c.ticketId, { bytes: PNG, fileName: "lea.png" });
    await parts.deleteAttachment(c.actor, leas.id, false); // ticket author

    const again = await parts.createAttachment(as(kim), c.ticketId, { bytes: PNG, fileName: "kim2.png" });
    await parts.deleteAttachment(as(lea), again.id, true); // admin
    expect(await parts.listAttachments(c.actor.workspaceId, c.ticketId)).toEqual([]);

    expect(await parts.canManageAttachments(c.actor.workspaceId, c.ticketId, c.actor.userId, false)).toBe(true);
    expect(await parts.canManageAttachments(c.actor.workspaceId, c.ticketId, lea, false)).toBe(false);
    expect(await parts.canManageAttachments(c.actor.workspaceId, c.ticketId, lea, true)).toBe(true);
  });

  it("cannot delete attachments of another workspace", async () => {
    const row = await parts.createAttachment(a.actor, a.ticketId, { bytes: PNG, fileName: "fremd.png" });
    await expect(parts.deleteAttachment(b.actor, row.id, true)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("comments", () => {
  it("notifies mentioned members only (not self, not outsiders)", async () => {
    const kim = a.users[1]!;
    const outsider = b.actor.userId;
    await parts.createComment(a.actor, a.ticketId, `Hallo @[Kim](${kim}), @[Ich](${a.actor.userId}) und @[Fremd](${outsider})`);
    const notes = await db
      .select({ userId: schema.notification.userId, type: schema.notification.type })
      .from(schema.notification)
      .where(and(eq(schema.notification.ticketId, a.ticketId)));
    expect(notes).toEqual([{ userId: kim, type: "mention" }]);
  });

  it("only the author edits; author or admin deletes", async () => {
    const kimActor = { userId: a.users[1]!, workspaceId: a.actor.workspaceId };
    const c = await parts.createComment(kimActor, a.ticketId, "Von Kim");
    await expect(parts.updateComment(a.actor, c.id, "überschrieben")).rejects.toMatchObject({ code: "forbidden" });
    await expect(parts.deleteComment(a.actor, c.id, false)).rejects.toMatchObject({ code: "forbidden" });
    await parts.deleteComment(a.actor, c.id, true);
    expect((await parts.listComments(a.actor.workspaceId, a.ticketId)).some((x) => x.id === c.id)).toBe(false);
  });
});

describe("searchTickets", () => {
  it("finds by word prefix, German stem and exact key – only in the own workspace", async () => {
    const { searchTickets, toPrefixQuery } = await import("@/db/queries/search");
    const { createTicket } = await import("@/db/queries/tickets");
    const t = await createTicket(a.actor, { projectId: a.projectId, title: "Herbstkampagne Banner gestalten" });
    expect(toPrefixQuery("bann'; drop table--")).toBe("bann:* & drop:* & table:*");
    expect((await searchTickets(a.actor.workspaceId, "herbstk")).map((h) => h.id)).toContain(t.id);
    expect((await searchTickets(a.actor.workspaceId, "Banners")).map((h) => h.id)).toContain(t.id);
    expect((await searchTickets(a.actor.workspaceId, `prj-${t.number}`)).map((h) => h.id)).toEqual([t.id]);
    expect(await searchTickets(b.actor.workspaceId, "herbstk")).toEqual([]);
  });
});
