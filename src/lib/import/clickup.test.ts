import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { taskLabels, ticketFields } from "../integrations/mapping";
import {
  attachmentLinks,
  csvSpaceId,
  decodeEntities,
  folderName,
  mapClickUpPriority,
  parseClickUpChecklists,
  parseClickUpComments,
  parseClickUpDate,
  parseList,
  readClickUpCsv,
  type ClickUpCsvStats,
  type ClickUpCsvTask,
} from "./clickup";
import { previewClickUpCsv } from "./clickup-plan";
import { csvRows } from "./csv-parse";

// Invented data in the shape of a real ClickUp workspace export (34 columns, "null" texts,
// JSON cells, an identical duplicate row, subtasks three levels deep, HTML entities).
// Line endings as in the export (a Windows checkout may turn them into CRLF).
const FIXTURE = readFileSync(join(__dirname, "__fixtures__", "clickup-export.csv"), "utf8").replace(/\r\n/g, "\n");

function all(text: string): { tasks: ClickUpCsvTask[]; stats: ClickUpCsvStats } {
  const r = readClickUpCsv(text);
  if (!r.ok) throw new Error(r.error);
  const tasks = [...r.tasks];
  return { tasks, stats: r.stats };
}

describe("ClickUp values", () => {
  it("reads epoch milliseconds, seconds and text dates with their offset", () => {
    expect(parseClickUpDate("1760486400000")?.toISOString()).toBe("2025-10-15T00:00:00.000Z");
    expect(parseClickUpDate("1760486400")?.toISOString()).toBe("2025-10-15T00:00:00.000Z");
    expect(parseClickUpDate("10/15/2025, 9:30:00 AM")?.toISOString()).toBe("2025-10-15T09:30:00.000Z");
    expect(parseClickUpDate("10/15/2025, 9:30:00 AM GMT+2")?.toISOString()).toBe("2025-10-15T07:30:00.000Z");
    expect(parseClickUpDate("1/5/2026, 11:05:00 PM GMT-5")?.toISOString()).toBe("2026-01-06T04:05:00.000Z");
    expect(parseClickUpDate("null")).toBeNull();
    expect(parseClickUpDate("")).toBeNull();
  });

  it("splits list cells and decodes entities", () => {
    expect(parseList("[Ina Example, Tom]")).toEqual(["Ina Example", "Tom"]);
    expect(parseList('["a","b"]')).toEqual(["a", "b"]);
    expect(parseList("[]")).toEqual([]);
    expect(decodeEntities("Release &quot;2.0&quot; &amp; mehr &#39;x&#39; &#x41;")).toBe("Release \"2.0\" & mehr 'x' A");
  });

  it("maps priority 1–4 to Dringend … Niedrig, null to none", () => {
    expect(["1", "2", "3", "4", "null", "urgent", "normal", "low", ""].map(mapClickUpPriority)).toEqual([4, 3, 2, 1, 0, 4, 2, 1, 0]);
  });

  it("reads comments with author and date; ids are stable", () => {
    const cell = JSON.stringify([{ text: "Hallo &amp; tschüss", by: "Ina Example", date: "9/2/2026, 10:00:00 AM GMT+2", resolved: "N/A" }]);
    const [c] = parseClickUpComments(cell, "t1");
    expect(c).toMatchObject({ body: "Hallo & tschüss", author: { name: "Ina Example", email: null }, createdAt: new Date("2026-09-02T08:00:00Z") });
    expect(c!.id).toMatch(/^csv:t1:0:[0-9a-f]{8}$/);
    expect(parseClickUpComments(cell, "t1")[0]!.id).toBe(c!.id);
    expect(parseClickUpComments("Freitext", "t1")).toMatchObject([{ body: "Freitext", author: null, createdAt: null }]);
    expect(parseClickUpComments("[]", "t1")).toEqual([]);
  });

  it("reads checklists in the export shape and the API shape", () => {
    expect(parseClickUpChecklists('{"Abnahme":["Texte","Bilder &amp; Video"],"Leer":[]}')).toEqual([{ name: "Abnahme", items: [{ name: "Texte", done: false }, { name: "Bilder & Video", done: false }] }]);
    expect(parseClickUpChecklists('[{"name":"A","items":[{"name":"x","resolved":true},{"name":"y"}]}]')).toEqual([{ name: "A", items: [{ name: "x", done: true }, { name: "y", done: false }] }]);
    expect(parseClickUpChecklists("{}")).toEqual([]);
  });

  it("keeps attachments as http(s) links only, folder paths as text", () => {
    expect(attachmentLinks('[{"title":"Plan [v2].pdf","url":"https://x.example/a.pdf"},{"title":"x","url":"javascript:alert(1)"}]')).toEqual(["- [Plan v2.pdf](https://x.example/a.pdf)"]);
    expect(folderName('["Kampagnen"]')).toBe("Kampagnen");
    expect(folderName('["A","B"]')).toBe("A / B");
    expect(folderName("")).toBeNull();
  });
});

describe("csvRows", () => {
  it("streams quoted cells with line breaks, escaped quotes and CRLF", () => {
    expect([...csvRows('a,b\r\n"x, y","say ""hi""\nnext"\r\n\r\n1,')]).toEqual([["a", "b"], ["x, y", 'say "hi"\nnext'], ["1", ""]]);
  });
});

describe("readClickUpCsv", () => {
  it("reads the export: one task per Task ID, rows without name skipped", () => {
    const { tasks, stats: s } = all(FIXTURE);
    expect(tasks.map((t) => t.task.id)).toEqual(["86fx0001", "86fx0002", "86fx0003", "86fx0004", "86fx0010", "86fx0011", "86fx0013"]);
    expect(s).toEqual({ rows: 9, duplicates: 1, skipped: { no_id: 0, no_title: 1 } });
  });

  it("maps every field the concept names", () => {
    const { tasks } = all(FIXTURE);
    const [kampagne, texte, , freigabe, release, login, orphan] = tasks;
    expect(kampagne).toMatchObject({ spaceName: "Marketing", attachments: 1 });
    expect(kampagne!.task).toMatchObject({
      ref: "86fx0001",
      url: "https://app.clickup.com/t/86fx0001",
      title: "Kampagne Herbst planen",
      status: { name: "in progress", type: "" },
      priority: 3,
      assignees: [{ name: "Ina Beispiel" }],
      tags: ["mail", "social"],
      parentId: null,
      spaceId: csvSpaceId("Marketing"),
      listName: "Herbst 2026",
      folderName: "Kampagnen",
      milestone: false,
      createdAt: new Date(1756717200000),
      dueAt: new Date(1767268800000),
    });
    expect(kampagne!.task.description).toBe('Ziele:\n- Reichweite\n- "Newsletter" vorbereiten\n\n**Anhänge (aus ClickUp):**\n- [Briefing.pdf](https://files.example/briefing.pdf)');
    expect(kampagne!.task.checklists[0]!.items).toHaveLength(7);
    expect(kampagne!.comments.map((c) => [c.body, c.author?.name, c.createdAt?.toISOString()])).toEqual([
      ["Bitte bis Freitag fertig machen", "Ina Beispiel", "2026-09-02T08:00:00.000Z"],
      ["Erledigt & abgestimmt", "Extern Person", "2026-09-03T07:15:00.000Z"],
    ]);
    expect(texte!.task).toMatchObject({ parentId: "86fx0001", status: { name: "complete" }, priority: 2 });
    expect(freigabe!.task).toMatchObject({ parentId: "86fx0003", status: { name: 'closed "archiv"' }, priority: 1 });
    expect(release!.task).toMatchObject({ title: 'Release "2.0"', milestone: true, priority: 4, folderName: null, spaceId: csvSpaceId("Produkt") });
    expect(login!.task).toMatchObject({ createdAt: null, priority: 0, dueAt: null, tags: ["bug"] });
    expect(orphan!.task.parentId).toBe("86fxgone");

    // Labels and checklist through the shared mapping of the API connector.
    expect(taskLabels(kampagne!.task)).toEqual(["mail", "social", "Kampagnen", "Herbst 2026"]);
    expect(taskLabels(release!.task)).toEqual(["Backlog", "Meilenstein"]);
    const fields = ticketFields(kampagne!.task, "ClickUp")!;
    expect(fields.checklist).toHaveLength(5);
    expect(fields.description).toContain("**Weitere Checklisten-Punkte (aus ClickUp):**\n- [ ] Freigabe\n- [ ] Versand");
  });

  it("rejects other tools and empty files", () => {
    expect(readClickUpCsv("Summary,Issue key\nx,A-1\n")).toEqual({ ok: false, error: "not_this_tool" });
    expect(readClickUpCsv("")).toEqual({ ok: false, error: "empty" });
  });

  it("stops at the row limit", () => {
    const r = readClickUpCsv(FIXTURE, 3);
    if (!r.ok) throw new Error(r.error);
    expect(() => [...r.tasks]).toThrow("too_many_rows");
  });

  it("works with a single-list view export (no space, no link)", () => {
    const { tasks } = all("Task ID,Task Name,Status,List Name\na1,Newsletter,open,Kampagnen\n");
    expect(tasks[0]).toMatchObject({ spaceName: "Kampagnen", task: { url: null, listName: "Kampagnen" } });
  });
});

describe("previewClickUpCsv", () => {
  it("counts what the import will create", () => {
    const r = previewClickUpCsv(FIXTURE, [{ id: "u1", name: "  ina beispiel " }]);
    if (!r.ok) throw new Error(r.error);
    const p = r.preview;
    expect(p).toMatchObject({
      rows: 9,
      duplicates: 1,
      tasks: 7,
      subtasks: 3,
      nestedSubtasks: 2,
      orphanSubtasks: 1,
      comments: 2,
      checklistItems: 7,
      foldedChecklistItems: 2,
      attachments: 1,
      milestones: 1,
      lists: 2,
      folders: 1,
      skipped: [{ reason: "no_title", count: 1 }],
      projects: [
        { name: "Marketing", tickets: 4 },
        { name: "Produkt", tickets: 3 },
      ],
    });
    expect(r.taskIds).toHaveLength(7);
    expect(Object.fromEntries(p.statuses.map((s) => [s.name, s.target]))).toEqual({
      "in progress": "In Arbeit",
      complete: "Erledigt",
      achived: "Erledigt",
      'closed "archiv"': "Erledigt",
      "Wartet auf Kunde": "own",
      "to do": "Offen",
      Closed: "Erledigt",
    });
    expect(p.people).toEqual([
      { name: "Tom Muster", memberId: null, count: 1 },
      { name: "Ina Beispiel", memberId: "u1", count: 1 },
    ]);
  });

  it("suggests people from earlier choices first, then the exact name", () => {
    const members = [{ id: "u1", name: "Ina Beispiel" }, { id: "u2", name: "Someone" }];
    const r = previewClickUpCsv(FIXTURE, members, new Map(), new Map([["tom muster", "u2"], ["ina beispiel", null]]));
    if (!r.ok) throw new Error(r.error);
    expect(Object.fromEntries(r.preview.people.map((x) => [x.name, x.memberId]))).toEqual({ "Tom Muster": "u2", "Ina Beispiel": null });
  });

  it("prefers the confirmed mapping of the ClickUp connection", () => {
    const r = previewClickUpCsv(FIXTURE, [], new Map([["wartet auf kunde", { target: "Review", category: "active" }]]));
    if (!r.ok) throw new Error(r.error);
    expect(r.preview.statuses.find((s) => s.name === "Wartet auf Kunde")).toMatchObject({ target: "Review", category: "active" });
  });
});
