import { describe, expect, it } from "vitest";
import { checklistMarkdown, mapClickUpPriority, parseClickUpComments, parseClickUpDate, parseList, readClickUp } from "./clickup";
import { parseCsv } from "./csv-parse";
import { buildPlan } from "./plan";
import { readImportFile } from "./read";

// Shaped like a ClickUp workspace export: epoch-ms dates plus text columns, "[a, b]" lists,
// JSON comments and checklists, subtasks via Parent ID (also nested).
const comments = JSON.stringify([{ text: "Bitte bis Freitag", by: "Ina", date: 1756890000000 }]).replace(/"/g, '""');
const checklists = JSON.stringify([{ name: "Abnahme", items: [{ name: "Texte", resolved: true }, { name: "Bilder", resolved: false }] }]).replace(/"/g, '""');
const CLICKUP = [
  "Task ID,Task Custom ID,Task Name,Task Content,Status,Date Created,Date Created Text,Due Date,Due Date Text,Date Closed,Parent ID,Assignees,Tags,Priority,List Name,Folder Name,Space Name,Checklists,Comments",
  `86abc1,,Login überarbeiten,Mehr Kontrast,in progress,1756717200000,"09/01/2025, 9:00:00 AM",1760486400000,10/15/2025,,,"[Ina Example, Tom Fremd]","[frontend, ux]",high,Website,Marketing,Team,"${checklists}","${comments}"`,
  "86abc2,,Formular prüfen,,complete,1756720800000,,,,1756980000000,86abc1,[],[],,Website,Marketing,Team,[],[]",
  "86abc3,,Fehlermeldung,,to do,1756720900000,,,,,86abc2,[],[],,Website,Marketing,Team,[],[]",
  "86abc4,WEB-7,Bug im Footer,,Open,1756800000000,,,,,,[],[],1,Website,Marketing,Team,[],[]",
  "86abc5,,Alt,,closed,1754035200000,,,,1754812800000,,[],[],4,Blog,Marketing,Team,[],[]",
].join("\n");

describe("ClickUp values", () => {
  it("reads epoch milliseconds, seconds and text dates", () => {
    expect(parseClickUpDate("1760486400000")?.toISOString()).toBe("2025-10-15T00:00:00.000Z");
    expect(parseClickUpDate("1760486400")?.toISOString()).toBe("2025-10-15T00:00:00.000Z");
    expect(parseClickUpDate("10/15/2025, 9:30:00 AM")?.toISOString()).toBe("2025-10-15T09:30:00.000Z");
    expect(parseClickUpDate("")).toBeNull();
  });

  it("splits list cells", () => {
    expect(parseList("[Ina Example, Tom]")).toEqual(["Ina Example", "Tom"]);
    expect(parseList('["a","b"]')).toEqual(["a", "b"]);
    expect(parseList("[]")).toEqual([]);
  });

  it("maps priority numbers and words", () => {
    expect(["1", "2", "3", "4", "urgent", "normal", "low", ""].map(mapClickUpPriority)).toEqual([4, 3, 2, 1, 4, 2, 1, 0]);
  });

  it("reads JSON comments and keeps unknown comment text", () => {
    expect(parseClickUpComments('[{"text":"Hallo","date":"1756890000000"}]')).toEqual([{ body: "Hallo", createdAt: new Date(1756890000000) }]);
    expect(parseClickUpComments('[{"comment_text":"Ohne Datum"}]')).toEqual([{ body: "Ohne Datum", createdAt: null }]);
    expect(parseClickUpComments("Freitext")).toEqual([{ body: "Freitext", createdAt: null }]);
    expect(parseClickUpComments("[]")).toEqual([]);
  });

  it("turns checklists into Markdown", () => {
    expect(checklistMarkdown('[{"name":"A","items":[{"name":"x","resolved":true},{"name":"y"}]}]')).toBe("**A:**\n- [x] x\n- [ ] y");
    expect(checklistMarkdown("[]")).toBe("");
    expect(checklistMarkdown("kein JSON")).toBe("kein JSON");
  });
});

describe("readClickUp", () => {
  const rows = (parseCsv(CLICKUP, 100) as { rows: string[][] }).rows;

  it("reads tasks, nests subtasks of any depth under the top task", () => {
    const r = readClickUp(rows);
    if (!r.ok) throw new Error(r.error);
    expect(r.file).toMatchObject({ projectName: "Website", projectKey: "", projectCount: 2 });
    expect(r.file.tickets.map((t) => t.ref)).toEqual(["86abc1", "WEB-7", "86abc5"]);
    const [login, bug, old] = r.file.tickets;
    expect(login).toMatchObject({
      title: "Login überarbeiten",
      description: "Mehr Kontrast\n\n**Abnahme:**\n- [x] Texte\n- [ ] Bilder",
      category: "active",
      priority: 3,
      assignee: "Ina Example",
      dueDate: "2025-10-15",
      labels: ["frontend", "ux"],
      subtasks: [{ title: "Formular prüfen", done: true }, { title: "Fehlermeldung", done: false }],
      comments: [{ body: "Bitte bis Freitag", createdAt: new Date(1756890000000) }],
      createdAt: new Date(1756717200000),
    });
    expect(bug).toMatchObject({ category: "open", priority: 4 });
    expect(old).toMatchObject({ category: "done", priority: 1, completedAt: new Date(1754812800000) });
  });

  it("rejects a Jira file", () => {
    expect(readClickUp([["Summary", "Issue key", "Status"], ["x", "A-1", "Done"]])).toEqual({ ok: false, error: "not_this_tool" });
  });

  it("goes through the shared plan (status mapping, people)", () => {
    const r = readImportFile("clickup", new TextEncoder().encode(CLICKUP));
    if (!r.ok) throw new Error(r.error);
    const { tickets, preview } = buildPlan(r.file, [{ id: "u1", name: "Ina Example", email: "ina@firma.de" }], "ClickUp");
    expect(tickets.map((t) => [t.status, t.assigneeId])).toEqual([["In Arbeit", "u1"], ["Offen", null], ["Erledigt", null]]);
    expect(preview).toMatchObject({ tickets: 3, subtasks: 2, comments: 1, labels: 2, projectCount: 2 });
  });
});
