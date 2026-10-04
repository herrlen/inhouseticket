// Notifications and the daily digest against Postgres; mail sending is captured, not sent.
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sent: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => void sent.push(m)) }));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { createProjectWithDefaults } = await import("@/db/queries/projects");
const { createTicket, updateTicket } = await import("@/db/queries/tickets");
const { listNotifications, markRead, setEmailDigest, unreadCount } = await import("@/db/queries/notifications");
const { runDailyDigest } = await import("@/lib/digest");

const run = `n${Date.now().toString(36)}`;
const ids = { users: [] as string[], ws: "" };
let anna: string, ben: string, cleo: string, projectId: string;
let statuses: Array<typeof schema.status.$inferSelect>;

beforeAll(async () => {
  [anna, ben, cleo] = [`${run}-anna`, `${run}-ben`, `${run}-cleo`];
  await db.insert(schema.user).values([anna, ben, cleo].map((id) => ({ id, name: id.split("-")[1]!, email: `${id}@${run}.de` })));
  const [ws] = await db.insert(schema.workspace).values({ name: "N", domain: `n-${run}.de`, slug: `n-${run}` }).returning();
  ids.ws = ws!.id;
  ids.users = [anna, ben, cleo];
  await db.insert(schema.membership).values([anna, ben, cleo].map((userId) => ({ workspaceId: ws!.id, userId })));
  const p = await db.transaction((tx) => createProjectWithDefaults(tx, { workspaceId: ws!.id, name: "P", key: "PRJ", color: "#FF6B5B", sort: "a0" }));
  projectId = p.project.id;
  statuses = await db.select().from(schema.status).where(eq(schema.status.projectId, projectId));
});

afterAll(async () => {
  await db.delete(schema.ticket).where(eq(schema.ticket.workspaceId, ids.ws));
  await db.delete(schema.workspace).where(eq(schema.workspace.id, ids.ws));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

const asAnna = () => ({ userId: anna, workspaceId: ids.ws });

describe("notifications", () => {
  it("notifies the assignee, never the actor", async () => {
    await createTicket(asAnna(), { projectId, title: "selbst", assigneeId: anna });
    const t = await createTicket(asAnna(), { projectId, title: "für Ben", assigneeId: ben });
    expect(await unreadCount(ids.ws, anna)).toBe(0);
    const forBen = await listNotifications(ids.ws, ben);
    expect(forBen.map((n) => [n.type, n.actorName, n.ticketTitle])).toEqual([["assigned", "anna", "für Ben"]]);

    // Ben changes the status → creator Anna hears about it, Ben (actor) does not.
    const review = statuses.find((s) => s.name === "Review")!;
    await updateTicket({ userId: ben, workspaceId: ids.ws }, t.id, { statusId: review.id });
    const forAnna = await listNotifications(ids.ws, anna);
    expect(forAnna.map((n) => [n.type, n.payload])).toEqual([["status", { to: "Review" }]]);
    expect(await unreadCount(ids.ws, ben)).toBe(1);

    await markRead(ids.ws, anna);
    expect(await unreadCount(ids.ws, anna)).toBe(0);
  });
});

describe("daily digest", () => {
  it("sends one mail per person with news, adds due-tomorrow reminders once, respects opt-out", async () => {
    // Fix "now" at 08:00 Berlin; Cleo has a ticket due tomorrow and opted out of mails.
    const now = new Date();
    const berlinToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
    const tomorrow = new Date(`${berlinToday}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    await createTicket({ userId: cleo, workspaceId: ids.ws }, { projectId, title: "morgen fällig", assigneeId: cleo, dueDate: tomorrow.toISOString().slice(0, 10) });
    await setEmailDigest(ids.ws, cleo, false);

    sent.length = 0;
    const first = await runDailyDigest(now, { force: true });
    expect(first.reminders).toBeGreaterThanOrEqual(1);
    const recipients = sent.filter((m) => m.to.endsWith(`@${run}.de`)).map((m) => m.to.split("@")[0]).sort();
    expect(recipients).toEqual([`${run}-ben`]); // Anna read hers, Cleo opted out
    expect(sent.find((m) => m.to.startsWith(`${run}-ben`))!.text).toContain("hat dir PRJ-2 „für Ben“ zugewiesen");

    const cleoNotes = await listNotifications(ids.ws, cleo);
    expect(cleoNotes.filter((n) => n.type === "due_tomorrow")).toHaveLength(1);

    sent.length = 0;
    await runDailyDigest(now, { force: true });
    expect(sent.filter((m) => m.to.endsWith(`@${run}.de`))).toEqual([]);
    const again = await db.select().from(schema.notification).where(and(eq(schema.notification.userId, cleo), eq(schema.notification.type, "due_tomorrow")));
    expect(again).toHaveLength(1);
  });
});
