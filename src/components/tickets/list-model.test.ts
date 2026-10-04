import { describe, expect, it } from "vitest";
import { dueBucket, groupTickets, sortTickets, todayInBerlin, type ListTicket, type StatusOption } from "./list-model";

const t = (id: string, o: Partial<ListTicket> = {}): ListTicket => ({
  id, number: Number(id.replace(/\D/g, "")) || 1, title: id, statusId: "open", priority: 0, assigneeId: null,
  dueDate: null, sort: "a0", createdAt: "2026-10-01T00:00:00Z", ...o,
});
const statuses: StatusOption[] = [
  { id: "done", name: "Erledigt", color: "#22C55E", category: "done", sort: "a3" },
  { id: "open", name: "Offen", color: "#78716C", category: "open", sort: "a0" },
  { id: "doing", name: "In Arbeit", color: "#3B82F6", category: "active", sort: "a1" },
];

describe("todayInBerlin", () => {
  it("uses Berlin time, not UTC", () => {
    expect(todayInBerlin(new Date("2026-10-04T22:30:00Z"))).toBe("2026-10-05"); // 00:30 CEST
  });
});

describe("dueBucket (today = Wednesday 2026-10-07)", () => {
  const today = "2026-10-07";
  it.each([
    [null, "none"],
    ["2026-10-06", "overdue"],
    ["2026-10-07", "today"],
    ["2026-10-11", "week"], // Sunday
    ["2026-10-12", "later"], // next Monday
  ] as const)("%j → %s", (due, bucket) => {
    expect(dueBucket(due, today)).toBe(bucket);
  });

  it("done tickets are never overdue", () => {
    expect(dueBucket("2026-10-01", today, true)).toBe("later");
  });
});

describe("sortTickets", () => {
  const list = [t("t1", { priority: 1, sort: "a2", dueDate: "2026-10-09" }), t("t2", { priority: 4, sort: "a1" }), t("t3", { priority: 4, sort: "a0", dueDate: "2026-10-08" })];
  it("manual uses the fractional key", () => expect(sortTickets(list, "manual").map((x) => x.id)).toEqual(["t3", "t2", "t1"]));
  it("priority high first, then manual", () => expect(sortTickets(list, "priority").map((x) => x.id)).toEqual(["t3", "t2", "t1"]));
  it("due date first, empty last", () => expect(sortTickets(list, "due").map((x) => x.id)).toEqual(["t3", "t1", "t2"]));
});

describe("groupTickets", () => {
  const base = { sortBy: "manual" as const, statuses, members: [{ id: "u1", name: "Anna" }], today: "2026-10-07" };
  const list = [t("t1", { statusId: "doing", assigneeId: "u1" }), t("t2"), t("t3", { assigneeId: "gone" })];

  it("by status keeps every status in workflow order, even empty ones", () => {
    const g = groupTickets(list, { ...base, groupBy: "status" });
    expect(g.map((x) => [x.label, x.tickets.length])).toEqual([["Offen", 2], ["In Arbeit", 1], ["Erledigt", 0]]);
  });

  it("by assignee puts former members under 'Nicht zugewiesen'", () => {
    const g = groupTickets(list, { ...base, groupBy: "assignee" });
    expect(g.map((x) => [x.label, x.tickets.map((y) => y.id)])).toEqual([["Anna", ["t1"]], ["Nicht zugewiesen", ["t2", "t3"]]]);
  });

  it("by priority drops empty groups", () => {
    expect(groupTickets(list, { ...base, groupBy: "priority" }).map((x) => x.label)).toEqual(["Keine"]);
  });
});
