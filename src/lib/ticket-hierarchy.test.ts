import { describe, expect, it } from "vitest";
import { allowedChildTypes, allowedParentTypes, childProgress, hierarchyProblem, isTicketType, parentProblem } from "./ticket-hierarchy";

describe("parentProblem (allowed and forbidden parents)", () => {
  it.each([
    ["epic", null, null],
    ["epic", "epic", "epic_no_parent"],
    ["epic", "task", "epic_no_parent"],
    ["story", null, null],
    ["story", "epic", null],
    ["story", "story", "parent_must_be_epic"],
    ["task", "epic", null],
    ["task", "task", "parent_must_be_epic"],
    ["task", "subtask", "parent_must_be_epic"],
    ["subtask", null, "subtask_needs_parent"],
    ["subtask", "story", null],
    ["subtask", "task", null],
    ["subtask", "epic", "parent_must_be_story_or_task"],
    ["subtask", "subtask", "parent_must_be_story_or_task"],
  ] as const)("%s under %s → %s", (type, parent, problem) => {
    expect(parentProblem(type, parent)).toBe(problem);
  });

  it("matches the allowed lists", () => {
    expect(allowedParentTypes("epic")).toEqual([]);
    expect(allowedParentTypes("story")).toEqual(["epic"]);
    expect(allowedParentTypes("subtask")).toEqual(["story", "task"]);
    expect(allowedChildTypes("epic")).toEqual(["story", "task"]);
    expect(allowedChildTypes("task")).toEqual(["subtask"]);
    expect(allowedChildTypes("subtask")).toEqual([]);
  });
});

describe("hierarchyProblem (type changes with children)", () => {
  it("keeps an epic with stories an epic", () => {
    expect(hierarchyProblem("epic", null, ["story", "task"])).toBeNull();
    expect(hierarchyProblem("task", null, ["story"])).toBe("epic_has_children");
    expect(hierarchyProblem("story", null, ["task"])).toBe("epic_has_children");
  });

  it("keeps a task with subtasks a story or task", () => {
    expect(hierarchyProblem("story", null, ["subtask"])).toBeNull();
    expect(hierarchyProblem("epic", null, ["subtask"])).toBe("has_subtasks");
    expect(hierarchyProblem("subtask", "story", ["subtask"])).toBe("has_subtasks");
  });

  it("checks the ticket's own parent first", () => {
    expect(hierarchyProblem("epic", "epic", [])).toBe("epic_no_parent");
    expect(hierarchyProblem("subtask", "epic", [])).toBe("parent_must_be_story_or_task");
    expect(hierarchyProblem("subtask", "task", [])).toBeNull();
  });
});

it("counts done children", () => {
  const done = new Set(["s-done"]);
  expect(childProgress([{ statusId: "s-done" }, { statusId: "s-open" }, { statusId: "s-done" }], done)).toEqual({ done: 2, total: 3 });
});

it("recognizes ticket types", () => {
  expect(isTicketType("epic")).toBe(true);
  expect(isTicketType("bug")).toBe(false);
  expect(isTicketType(null)).toBe(false);
});
