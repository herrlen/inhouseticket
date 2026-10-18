// Onboarding wizard against Postgres (docs/ONBOARDING.md, ADR 006): the end-of-wizard transaction
// creates the template project exactly once, step saving only moves forward, answers follow the
// workspace on deletion and the CHECK constraints refuse unknown values.
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { completeOnboarding } = await import("@/db/queries/onboarding-complete");
const { getWizardPrefs, saveAnswer, saveWizardPrefs } = await import("@/db/queries/onboarding");

const run = `ob${Date.now().toString(36)}`;
const ids = { users: [] as string[], workspaces: [] as string[] };

async function setup(label: string, teamType: string | null, view: "board" | "list") {
  const userId = `${run}-${label}`;
  await db.insert(schema.user).values({ id: userId, name: label, email: `${label}@${run}.de`, timezone: "Atlantic/Reykjavik" });
  const [ws] = await db.insert(schema.workspace).values({ name: label, domain: `${label}-${run}.de`, slug: `${label}-${run}`, teamType }).returning();
  await db.insert(schema.membership).values({ workspaceId: ws!.id, userId, role: "owner" });
  await saveWizardPrefs(ws!.id, userId, { defaultView: view, advanceTo: 6 });
  ids.users.push(userId);
  ids.workspaces.push(ws!.id);
  return { userId, wsId: ws!.id, slug: ws!.slug };
}

let a: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  a = await setup("support", "support", "board");
});

afterAll(async () => {
  await db.delete(schema.workspace).where(inArray(schema.workspace.id, ids.workspaces));
  await db.delete(schema.user).where(inArray(schema.user.id, ids.users));
});

describe("completeOnboarding", () => {
  it("creates the template project with statuses, labels, tutorial tickets and subtasks in one go", async () => {
    const done = await db.transaction((tx) => completeOnboarding(tx, { workspaceId: a.wsId, userId: a.userId, locale: "de", invited: false }));
    expect(done).toEqual({ target: `/${a.slug}/p/SUP?view=board`, created: true });

    const [project] = await db.select().from(schema.project).where(eq(schema.project.workspaceId, a.wsId));
    expect(project).toMatchObject({ key: "SUP", name: "Support", ticketSeq: 5 });
    const statuses = await db.select().from(schema.status).where(eq(schema.status.projectId, project!.id)).orderBy(asc(schema.status.sort));
    expect(statuses.map((s) => s.name)).toEqual(["Neu", "In Bearbeitung", "Wartet auf Kunde", "Gelöst"]);
    const labels = await db.select().from(schema.label).where(eq(schema.label.projectId, project!.id));
    expect(labels.map((l) => l.name).sort()).toEqual(["Fehler", "Frage", "Tutorial", "Wunsch"]);

    const tickets = await db.select().from(schema.ticket).where(eq(schema.ticket.projectId, project!.id)).orderBy(asc(schema.ticket.number));
    expect(tickets.map((t) => t.number)).toEqual([1, 2, 3, 4, 5]);
    expect(tickets.map((t) => t.title)).toEqual([
      "Drück C – und leg dein erstes eigenes Ticket an",
      "Zieh mich nach „In Bearbeitung“ →",
      "Öffne mich und hak die Unteraufgaben ab",
      "Lade dein Team ein",
      "Kunde fragt nach einer Rechnungskopie",
    ]);
    expect(new Set(tickets.map((t) => t.statusId))).toEqual(new Set([statuses[0]!.id]));
    // Ticket 1: mine, high, due today in the person's time zone. (Not a zone ahead of UTC: a ticket due
    // "tomorrow" in UTC would be picked up by the digest test running in parallel.)
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
    expect(tickets[0]).toMatchObject({ assigneeId: a.userId, priority: 3 });
    expect(tickets[0]!.dueAt?.toISOString().slice(0, 10)).toBe(today);
    expect(tickets.slice(1).every((t) => t.assigneeId === null)).toBe(true);

    const tutorial = labels.find((l) => l.name === "Tutorial")!;
    const tagged = await db.select().from(schema.ticketLabel).where(eq(schema.ticketLabel.labelId, tutorial.id));
    expect(tagged).toHaveLength(5);
    const subtasks = await db.select().from(schema.subtask).where(eq(schema.subtask.ticketId, tickets[2]!.id)).orderBy(asc(schema.subtask.sort));
    expect(subtasks.map((s) => s.title)).toEqual(["Esc schließt", "↑/↓ springt zum nächsten Ticket", "Cmd/Ctrl+K öffnet die Palette"]);

    const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, a.wsId));
    const [person] = await db.select().from(schema.user).where(eq(schema.user.id, a.userId));
    expect(ws!.onboardingCompletedAt).not.toBeNull();
    expect(person!.onboardedAt).not.toBeNull();
    expect((await getWizardPrefs(a.wsId, a.userId)).onboardingStep).toBeNull();
  });

  it("is idempotent: a second run (double submit, reload) creates nothing", async () => {
    const again = await db.transaction((tx) => completeOnboarding(tx, { workspaceId: a.wsId, userId: a.userId, locale: "de", invited: false }));
    expect(again).toEqual({ target: `/${a.slug}`, created: false });
    expect(await db.select().from(schema.project).where(eq(schema.project.workspaceId, a.wsId))).toHaveLength(1);
    expect(await db.select().from(schema.ticket).where(eq(schema.ticket.workspaceId, a.wsId))).toHaveLength(5);
  });

  it("concurrent submits create the project once (row lock)", async () => {
    const c = await setup("race", "dev", "list");
    const results = await Promise.all(
      [0, 1].map(() => db.transaction((tx) => completeOnboarding(tx, { workspaceId: c.wsId, userId: c.userId, locale: "en", invited: true }))),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results.find((r) => r.created)?.target).toBe(`/${c.slug}/p/DEV`);
    const tickets = await db.select().from(schema.ticket).where(eq(schema.ticket.workspaceId, c.wsId));
    expect(tickets).toHaveLength(4); // invited → no "Invite your team" ticket
    expect(tickets.map((t) => t.title)).toContain("Change my status with a click");
  });

  it("picks a free key when the owner already created a project with it, and falls back to 'general'", async () => {
    const d = await setup("taken", null, "list");
    await db.insert(schema.project).values({ workspaceId: d.wsId, name: "Eigenes", key: "ALL", color: "#64748B", sort: "a0" });
    const done = await db.transaction((tx) => completeOnboarding(tx, { workspaceId: d.wsId, userId: d.userId, locale: "de", invited: true }));
    expect(done.target).toBe(`/${d.slug}/p/ALL2`);
  });
});

describe("wizard state", () => {
  it("only moves forward; null clears it", async () => {
    const e = await setup("steps", null, "list");
    await saveWizardPrefs(e.wsId, e.userId, { advanceTo: 3 });
    expect((await getWizardPrefs(e.wsId, e.userId)).onboardingStep).toBe(6);
    await saveWizardPrefs(e.wsId, e.userId, { advanceTo: null });
    await saveWizardPrefs(e.wsId, e.userId, { advanceTo: 4 });
    expect((await getWizardPrefs(e.wsId, e.userId)).onboardingStep).toBe(4);
    await saveWizardPrefs(e.wsId, e.userId, { advanceTo: 2, defaultView: "board" });
    expect(await getWizardPrefs(e.wsId, e.userId)).toEqual({ defaultView: "board", onboardingStep: 4 });
  });

  it("answers are upserted, constrained, and deleted with the workspace", async () => {
    const f = await setup("answers", null, "list");
    await saveAnswer(f.wsId, f.userId, { previousTools: ["jira"], source: "linkedin", sourceOther: null });
    await saveAnswer(f.wsId, f.userId, { previousTools: ["excel", "notion"], source: "other", sourceOther: "Messe" });
    const rows = await db.select().from(schema.onboardingAnswer).where(eq(schema.onboardingAnswer.workspaceId, f.wsId));
    expect(rows).toEqual([expect.objectContaining({ previousTools: ["excel", "notion"], source: "other", sourceOther: "Messe" })]);

    await expect(saveAnswer(f.wsId, f.userId, { previousTools: ["basecamp" as never], source: null, sourceOther: null })).rejects.toThrow();
    await expect(saveAnswer(f.wsId, f.userId, { previousTools: [], source: "linkedin", sourceOther: "Messe" })).rejects.toThrow();
    await expect(db.update(schema.workspace).set({ teamType: "hr" }).where(eq(schema.workspace.id, f.wsId))).rejects.toThrow();

    await db.delete(schema.workspace).where(eq(schema.workspace.id, f.wsId));
    expect(await db.select().from(schema.onboardingAnswer).where(and(eq(schema.onboardingAnswer.userId, f.userId)))).toHaveLength(0);
  });
});
