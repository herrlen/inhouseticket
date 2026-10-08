import { describe, expect, it } from "vitest";
import { categoryOf, detectColumns, dueFromCell, splitValues, stripLinks } from "./columns";
import { parseCsv } from "./csv-parse";
import { readMonday } from "./monday";
import { readNotion } from "./notion";
import { buildPlan } from "./plan";
import { readImportFile } from "./read";
import { parseDate } from "./source";

const rowsOf = (csv: string) => (parseCsv(csv, 100) as { rows: string[][] }).rows;

describe("free column names", () => {
  it("detects English and German names, each column once", () => {
    expect(detectColumns(["Aufgabe", "Status", "Zuständig", "Fälligkeitsdatum", "Priorität", "Tags", "Erstellt am"])).toEqual({
      title: 0, status: 1, assignee: 2, due: 3, priority: 4, labels: 5, created: 6,
    });
    expect(detectColumns(["Name", "Owner", "Timeline", "Notes", "Date"])).toEqual({ title: 0, assignee: 1, due: 4, description: 3 });
  });

  it("reads Notion relation and multi-value cells", () => {
    expect(stripLinks("Login (https://www.notion.so/Login-abc), Bug, Footer (https://www.notion.so/x)")).toEqual(["Login", "Bug", "Footer"]);
    expect(splitValues("Ina Example, Tom; Eva")).toEqual(["Ina Example", "Tom", "Eva"]);
  });

  it("uses the end of a date range as due date", () => {
    expect(dueFromCell("October 1, 2026 → October 8, 2026")).toBe("2026-10-08");
    expect(dueFromCell("2026-10-01 - 2026-10-08")).toBe("2026-10-08");
    expect(dueFromCell("8. Oktober 2026")).toBe("2026-10-08");
  });

  it("parses Notion and Excel date formats", () => {
    expect(parseDate("October 8, 2026 2:33 PM")?.toISOString()).toBe("2026-10-08T14:33:00.000Z");
    expect(parseDate("Oct 8, 2026")?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(parseDate("8. März 2026")?.toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect(parseDate("10/8/26")?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(parseDate("Bug im Footer")).toBeNull();
  });

  it("decides done by status or checkbox", () => {
    expect(categoryOf("Not started", undefined)).toBe("open");
    expect(categoryOf("Working on it", undefined)).toBe("active");
    expect(categoryOf("Stuck", undefined)).toBe("active");
    expect(categoryOf("", "Yes")).toBe("done");
    expect(categoryOf("", "No")).toBe("open");
  });
});

describe("readNotion", () => {
  const NOTION = [
    "Aufgabe,Status,Zuständig,Fällig,Priorität,Tags,Erstellt am,Parent item,Sub-items",
    "Login überarbeiten,In Bearbeitung,\"Ina Example, Tom\",\"October 15, 2026\",High,\"ux, frontend\",\"September 1, 2026 9:15 AM\",,\"Formular prüfen (https://www.notion.so/Formular-1), Texte (https://www.notion.so/Texte-2)\"",
    "Formular prüfen,Erledigt,,,,,\"September 2, 2026 9:00 AM\",Login überarbeiten (https://www.notion.so/Login-0),",
    "Texte,Nicht begonnen,,,,,,,",
    "Bug im Footer,Not started,Tom,,Low,,,,",
  ].join("\n");

  it("reads pages, nests sub-items, lists the columns it used", () => {
    const r = readNotion(rowsOf(NOTION));
    if (!r.ok) throw new Error(r.error);
    expect(r.file.tickets.map((t) => t.title)).toEqual(["Login überarbeiten", "Bug im Footer"]);
    expect(r.file.tickets[0]).toMatchObject({
      category: "active",
      assignee: "Ina Example",
      dueDate: "2026-10-15",
      priority: 3,
      labels: ["ux", "frontend"],
      subtasks: [{ title: "Formular prüfen", done: true }, { title: "Texte", done: false }],
      createdAt: new Date("2026-09-01T09:15:00Z"),
    });
    expect(r.file.columns).toContainEqual({ field: "title", column: "Aufgabe" });
    expect(r.file.columns).toContainEqual({ field: "parent", column: "Parent item" });
  });

  it("takes the first column as title when its name is unusual, and a done checkbox", () => {
    const r = readNotion(rowsOf("Projektidee,Erledigt\nNeue Website,Yes\nFlyer,No"));
    expect(r.ok && r.file.tickets.map((t) => [t.title, t.category])).toEqual([["Neue Website", "done"], ["Flyer", "open"]]);
  });

  it("names the project after the file in the preview, through the shared plan", () => {
    const r = readImportFile("notion", new TextEncoder().encode(NOTION));
    if (!r.ok) throw new Error(r.error);
    const plan = buildPlan(r.file, [], "Notion");
    expect(plan.preview).toMatchObject({ tickets: 2, subtasks: 2, projectName: "" });
    expect(plan.preview.columns?.length).toBeGreaterThan(5);
  });
});

describe("readMonday", () => {
  // Excel export saved as CSV: board name, groups with their own header rows, subitems
  // under a shifted header, empty spacer rows.
  const MONDAY = [
    "Marketing Board,,,,,",
    ",,,,,",
    "Diese Woche,,,,,",
    "Name,Subitems,Person,Status,Date,Priority",
    "Newsletter planen,\"Texte, Bilder\",Ina Example,Working on it,2026-10-15,High",
    ",Name,Owner,Status,Date,",
    ",Texte,,Done,,",
    ",Bilder,,,,",
    "Nur ein Name,,,,,",
    ",,,,,",
    "Erledigt,,,,,",
    "Name,Subitems,Person,Status,Date,Priority",
    "Messe vorbereiten,,Tom,Done,10/1/26,Low",
  ].join("\n");

  it("reads groups as labels, subitems as subtasks and the board name", () => {
    const r = readMonday(rowsOf(MONDAY));
    if (!r.ok) throw new Error(r.error);
    expect(r.file.projectName).toBe("Marketing Board");
    expect(r.file.tickets.map((t) => [t.title, t.labels, t.category])).toEqual([
      ["Newsletter planen", ["Diese Woche"], "active"],
      ["Nur ein Name", ["Diese Woche"], "open"],
      ["Messe vorbereiten", ["Erledigt"], "done"],
    ]);
    expect(r.file.tickets[0]).toMatchObject({
      assignee: "Ina Example",
      dueDate: "2026-10-15",
      priority: 3,
      subtasks: [{ title: "Texte", done: true }, { title: "Bilder", done: false }],
    });
    expect(r.file.tickets[2]!.dueDate).toBe("2026-10-01");
  });

  it("keeps names from the Subitems column when there are no subitem rows", () => {
    const r = readMonday(rowsOf("Name,Subitems,Status\nA,\"x, y\",Done"));
    expect(r.ok && r.file.tickets[0]!.subtasks).toEqual([{ title: "x", done: false }, { title: "y", done: false }]);
  });

  it("rejects files without a monday header row", () => {
    expect(readMonday(rowsOf("Summary,Issue key\nx,A-1"))).toEqual({ ok: false, error: "not_this_tool" });
  });
});
