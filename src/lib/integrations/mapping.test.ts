import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "../limits";
import { berlinDay, desiredParents, matchPeople, suggestStatus, targetCategory, taskLabels, ticketFields } from "./mapping";
import type { ExternalTask } from "./types";

function task(over: Partial<ExternalTask> = {}): ExternalTask {
  return {
    id: "t1",
    ref: "t1",
    url: "https://app.clickup.com/t/t1",
    title: "Angebot schreiben",
    description: "",
    status: { name: "to do", type: "open", color: null },
    priority: 0,
    assignees: [],
    tags: [],
    parentId: null,
    spaceId: "s1",
    listId: "l1",
    listName: "Liste A",
    folderName: null,
    milestone: false,
    checklists: [],
    createdAt: null,
    updatedAt: null,
    doneAt: null,
    dueAt: null,
    ...over,
  };
}

describe("suggestStatus", () => {
  it.each([
    [{ name: "done", type: "custom" }, "Erledigt", "done"],
    [{ name: "Complete", type: "custom" }, "Erledigt", "done"],
    [{ name: "abgeschlossen", type: "custom" }, "Erledigt", "done"],
    [{ name: "archiv", type: "closed" }, "Erledigt", "done"],
    [{ name: "in progress", type: "custom" }, "In Arbeit", "active"],
    [{ name: "In Bearbeitung", type: "custom" }, "In Arbeit", "active"],
    [{ name: "to do", type: "custom" }, "Offen", "open"],
    [{ name: "Neu", type: "custom" }, "Offen", "open"],
    [{ name: "not started", type: "custom" }, "Offen", "open"],
    [{ name: "irgendwas", type: "open" }, "Offen", "open"],
  ] as const)("%o → %s", (status, target, category) => {
    expect(suggestStatus(status)).toEqual({ target, category });
  });

  it("leaves unclear custom statuses as an own status with a guessed category", () => {
    expect(suggestStatus({ name: "Wartet auf Kunde", type: "custom" })).toEqual({ target: "own", category: "active" });
    expect(suggestStatus({ name: "Ideen", type: "custom" })).toEqual({ target: "own", category: "open" });
  });

  it("knows the category of every target", () => {
    expect(targetCategory("Erledigt", "open")).toBe("done");
    expect(targetCategory("Review", "open")).toBe("active");
    expect(targetCategory("own", "done")).toBe("done");
  });
});

describe("matchPeople", () => {
  it("matches by e-mail, case-insensitive; no e-mail or no member → null", () => {
    const people = [
      { id: "1", name: "A", email: "Person.A@Firma.example" },
      { id: "2", name: "B", email: "b@extern.example" },
      { id: "3", name: "C", email: null },
    ];
    const map = matchPeople(people, [{ id: "u-a", email: "person.a@firma.example", name: "A" }]);
    expect([...map]).toEqual([["1", "u-a"], ["2", null], ["3", null]]);
  });
});

describe("taskLabels", () => {
  it("tags, folder, list and milestone – unique and at most 50 characters", () => {
    const labels = taskLabels(task({ tags: ["UX", "ux", "x".repeat(60)], folderName: "Ordner", listName: "Liste A", milestone: true }));
    expect(labels).toEqual(["UX", "x".repeat(50), "Ordner", "Liste A", "Meilenstein"]);
  });
});

describe("ticketFields", () => {
  it("cuts to the limits and folds checklist items beyond MAX_SUBTASKS into the description", () => {
    const items = Array.from({ length: MAX_SUBTASKS + 2 }, (_, i) => ({ name: `Punkt ${i + 1}`, done: i === 0 }));
    const f = ticketFields(task({ title: "t".repeat(MAX_TITLE + 10), description: "d".repeat(MAX_DESCRIPTION), checklists: [{ name: "C", items }] }), "ClickUp")!;
    expect(f.title).toHaveLength(MAX_TITLE);
    expect(f.title.endsWith("…")).toBe(true);
    expect(f.checklist).toHaveLength(MAX_SUBTASKS);
    expect(f.checklist[0]).toEqual({ title: "Punkt 1", done: true });
    expect(f.description).toHaveLength(MAX_DESCRIPTION);
  });

  it("keeps folded checklist items when there is room", () => {
    const items = Array.from({ length: MAX_SUBTASKS + 1 }, (_, i) => ({ name: `Punkt ${i + 1}`, done: false }));
    const f = ticketFields(task({ description: "Text", checklists: [{ name: "C", items }] }), "ClickUp")!;
    expect(f.description).toBe(`Text\n\n**Weitere Checklisten-Punkte (aus ClickUp):**\n- [ ] Punkt ${MAX_SUBTASKS + 1}`);
  });

  it("skips tasks without a title and takes the due day in Berlin", () => {
    expect(ticketFields(task({ title: "   " }), "ClickUp")).toBeNull();
    // 23:30 UTC on 1 March is already 2 March in Berlin.
    expect(ticketFields(task({ dueAt: new Date("2026-03-01T23:30:00Z") }), "ClickUp")!.dueDate).toBe("2026-03-02");
    expect(berlinDay(new Date("2026-07-01T10:00:00Z"))).toBe("2026-07-01");
  });
});

describe("desiredParents", () => {
  const ref = (externalId: string, externalParentId: string | null, projectId = "p1") => ({ externalId, externalParentId, localId: `L-${externalId}`, projectId });

  it("hangs every descendant under its top-most synced ancestor", () => {
    const map = desiredParents([ref("c", "b"), ref("b", "a"), ref("a", null), ref("x", null)]);
    expect(map.get("L-a")).toBeNull();
    expect(map.get("L-b")).toBe("L-a");
    expect(map.get("L-c")).toBe("L-a");
    expect(map.get("L-x")).toBeNull();
  });

  it("stays top-level when the parent was not synced or sits in another project", () => {
    const map = desiredParents([ref("c", "missing"), ref("d", "e", "p1"), ref("e", null, "p2")]);
    expect(map.get("L-c")).toBeNull();
    expect(map.get("L-d")).toBeNull();
  });

  it("leaves looping chains top-level", () => {
    const map = desiredParents([ref("a", "b"), ref("b", "a"), ref("c", "a")]);
    expect(map.get("L-a")).toBeNull();
    expect(map.get("L-b")).toBeNull();
    expect(map.get("L-c")).toBeNull();
  });
});
