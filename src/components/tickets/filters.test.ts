import { describe, expect, it } from "vitest";
import { applyFilters, readFilters } from "./filters";

const t = (n: number, o: Partial<Parameters<typeof applyFilters>[0][number]> = {}) => ({
  number: n, title: `Ticket ${n}`, description: null, assigneeId: null, priority: 0, dueDate: null, statusId: "open", labelIds: [], ...o,
});
const ctx = { currentUserId: "me-id", today: "2026-10-07", doneStatusIds: new Set(["done"]), projectKey: "MKT" };
const list = [
  t(1, { assigneeId: "me-id", priority: 4, dueDate: "2026-10-01" }),
  t(2, { assigneeId: "other", priority: 3, labelIds: ["bug"], title: "Login kaputt" }),
  t(3, { priority: 4, dueDate: "2026-10-07", description: "Banner für die Messe" }),
  t(4, { assigneeId: "me-id", dueDate: "2026-10-01", statusId: "done" }),
];
const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(list, f, ctx).map((x) => x.number);

describe("readFilters", () => {
  it("parses valid params and ignores junk", () => {
    expect(readFilters(new URLSearchParams("assignee=me&priority=4&due=today&label=bug&q=%20banner%20"))).toEqual({ assignee: "me", priority: 4, due: "today", label: "bug", q: "banner" });
    expect(readFilters(new URLSearchParams("priority=9&due=gestern"))).toEqual({});
  });
});

describe("applyFilters", () => {
  it("filters by person: me, none, specific", () => {
    expect(ids({ assignee: "me" })).toEqual([1, 4]);
    expect(ids({ assignee: "none" })).toEqual([3]);
    expect(ids({ assignee: "other" })).toEqual([2]);
  });
  it("filters by priority, label and due bucket (done tickets are never overdue)", () => {
    expect(ids({ priority: 4 })).toEqual([1, 3]);
    expect(ids({ label: "bug" })).toEqual([2]);
    expect(ids({ due: "overdue" })).toEqual([1]);
    expect(ids({ due: "today" })).toEqual([3]);
  });
  it("text matches key, title and description, all words", () => {
    expect(ids({ q: "mkt-2" })).toEqual([2]);
    expect(ids({ q: "messe banner" })).toEqual([3]);
    expect(ids({ q: "login messe" })).toEqual([]);
  });
  it("combines filters", () => {
    expect(ids({ assignee: "me", due: "overdue" })).toEqual([1]);
  });
});

describe("type filter", () => {
  it("reads only known types and treats a missing type as task", () => {
    expect(readFilters(new URLSearchParams("type=epic"))).toEqual({ type: "epic" });
    expect(readFilters(new URLSearchParams("type=bug"))).toEqual({});
    const typed = [t(1, { type: "epic" }), t(2, { type: "subtask" }), t(3)];
    expect(applyFilters(typed, { type: "epic" }, ctx).map((x) => x.number)).toEqual([1]);
    expect(applyFilters(typed, { type: "task" }, ctx).map((x) => x.number)).toEqual([3]);
  });
});
