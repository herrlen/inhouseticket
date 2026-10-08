import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION, MAX_SUBTASKS, MAX_TITLE } from "@/lib/limits";
import { detectDelimiter, decodeText, parseCsv } from "./csv-parse";
import { parseJiraComment, readJira } from "./jira";
import { buildPlan, MAX_IMPORT_TICKETS, targetStatus } from "./plan";
import { readImportFile } from "./read";
import { guessCategory, mapPriority, parseDate } from "./source";

// Shaped like Jira Cloud "Export CSV (all fields)": repeated Labels/Comment columns, sub-tasks
// pointing to their parent's Issue id.
const JIRA = [
  "Summary,Issue key,Issue id,Issue Type,Status,Status Category,Project key,Project name,Priority,Assignee,Created,Resolved,Due date,Labels,Labels,Description,Parent id,Comment,Comment",
  'Login-Seite überarbeiten,WEB-1,10001,Story,In Progress,In Progress,WEB,Website,High,Ina Example,01/Sep/26 9:15 AM,,15/Oct/26,frontend,ux,"Zeile 1\nZeile 2, mit Komma",,"02/Sep/26 10:00 AM;5b10ac8d82e05b22cc7d4ef5;Bitte bis Freitag","03/Sep/26 4:30 PM;5b10ac8d82e05b22cc7d4ef5;Erledigt ""fast"""',
  "Formular validieren,WEB-2,10002,Sub-task,Done,Done,WEB,Website,Medium,,02/Sep/26 9:00 AM,05/Sep/26 2:00 PM,,,,,10001,,",
  "Texte prüfen,WEB-3,10003,Sub-task,To Do,To Do,WEB,Website,Low,,02/Sep/26 9:01 AM,,,,,,10001,,",
  "Bug im Footer,WEB-4,10004,Bug,Code Review,In Progress,WEB,Website,Highest,Tom Fremd,03/Sep/26 11:00 AM,,,,,,,,",
  "Alt und erledigt,WEB-5,10005,Task,Closed,Done,WEB,Website,Lowest,,01/Aug/26 8:00 AM,10/Aug/26 5:00 PM,,,,,,,",
].join("\n");

const members = [{ id: "u-ina", name: "Ina Example", email: "ina@firma.de" }];

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, line breaks in cells, CRLF and BOM", () => {
    const r = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nnext"\r\n\r\n1,2', 10);
    expect(r).toEqual({ ok: true, rows: [["a", "b"], ["x, y", 'say "hi"\nnext'], ["1", "2"]] });
  });

  it("detects semicolon and tab files (Excel, monday saved as CSV)", () => {
    expect(detectDelimiter('Name;"a,b";c\n')).toBe(";");
    expect(detectDelimiter("Name\tStatus\n")).toBe("\t");
    expect(parseCsv("a;b\n1;2", 10)).toEqual({ ok: true, rows: [["a", "b"], ["1", "2"]] });
  });

  it("refuses empty files and too many rows", () => {
    expect(parseCsv("\n\n", 10)).toEqual({ ok: false, error: "empty" });
    expect(parseCsv("a\n1\n2\n3", 2)).toEqual({ ok: false, error: "too_many_rows" });
  });

  it("decodes Windows-1252 when the file is not UTF-8", () => {
    expect(decodeText(new Uint8Array([0x46, 0xe4, 0x6c, 0x6c, 0x69, 0x67]))).toBe("Fällig");
    expect(decodeText(new TextEncoder().encode("Fällig"))).toBe("Fällig");
  });
});

describe("value mappings", () => {
  it("maps priority words of Jira, ClickUp and German exports", () => {
    expect(["Highest", "Blocker", "urgent", "Dringend", "High", "Major", "Medium", "normal", "Low", "Lowest", "Trivial", "", "Egal"].map(mapPriority))
      .toEqual([4, 4, 4, 4, 3, 3, 2, 2, 1, 1, 1, 0, 0]);
  });

  it("guesses status categories from names", () => {
    expect(["Done", "Geschlossen", "Won't Do", "In Progress", "Code Review", "Backlog", "Selected for Development"].map(guessCategory))
      .toEqual(["done", "done", "done", "active", "active", "open", "open"]);
    expect(targetStatus("Code Review", "active")).toBe("Review");
    expect(targetStatus("Doing", "active")).toBe("In Arbeit");
  });

  it("parses the date formats of the supported tools as UTC", () => {
    expect(parseDate("08/Oct/26 12:33 PM")?.toISOString()).toBe("2026-10-08T12:33:00.000Z");
    expect(parseDate("08/Okt/26 00:10")?.toISOString()).toBe("2026-10-08T00:10:00.000Z");
    expect(parseDate("12/Mar/26 12:05 AM")?.toISOString()).toBe("2026-03-12T00:05:00.000Z");
    expect(parseDate("2026-10-08")?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(parseDate("08.10.2026 14:00")?.toISOString()).toBe("2026-10-08T14:00:00.000Z");
    expect(parseDate("10/08/2026")?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(parseDate("31/Feb/26")).toBeNull();
    expect(parseDate("morgen")).toBeNull();
  });

  it("splits Jira comment cells into date and text", () => {
    expect(parseJiraComment("02/Sep/26 10:00 AM;5b10ac;Text; mit Semikolon")).toEqual({ body: "Text; mit Semikolon", createdAt: new Date("2026-09-02T10:00:00Z") });
    expect(parseJiraComment("Nur Text")).toEqual({ body: "Nur Text", createdAt: null });
    expect(parseJiraComment("  ")).toBeNull();
  });
});

describe("readJira", () => {
  const rows = (parseCsv(JIRA, 100) as { rows: string[][] }).rows;

  it("reads tickets and nests sub-tasks under their parent", () => {
    const r = readJira(rows);
    if (!r.ok) throw new Error(r.error);
    expect(r.file).toMatchObject({ projectName: "Website", projectKey: "WEB", projectCount: 1 });
    expect(r.file.tickets.map((t) => t.ref)).toEqual(["WEB-1", "WEB-4", "WEB-5"]);
    const [login, bug, old] = r.file.tickets;
    expect(login).toMatchObject({
      title: "Login-Seite überarbeiten",
      description: "Zeile 1\nZeile 2, mit Komma",
      statusName: "In Progress",
      category: "active",
      priority: 3,
      assignee: "Ina Example",
      dueDate: "2026-10-15",
      labels: ["frontend", "ux"],
      subtasks: [{ title: "Formular validieren", done: true }, { title: "Texte prüfen", done: false }],
      createdAt: new Date("2026-09-01T09:15:00Z"),
      completedAt: null,
    });
    expect(login!.comments).toEqual([
      { body: "Bitte bis Freitag", createdAt: new Date("2026-09-02T10:00:00Z") },
      { body: 'Erledigt "fast"', createdAt: new Date("2026-09-03T16:30:00Z") },
    ]);
    expect(bug).toMatchObject({ category: "active", priority: 4, statusName: "Code Review" });
    expect(old).toMatchObject({ category: "done", completedAt: new Date("2026-08-10T17:00:00Z") });
  });

  it("accepts German column names", () => {
    const r = readJira([["Zusammenfassung", "Vorgangsschlüssel", "Status", "Priorität", "Bearbeiter"], ["Drucker", "IT-1", "Erledigt", "Hoch", "Ina"]]);
    expect(r.ok && r.file.tickets[0]).toMatchObject({ title: "Drucker", ref: "IT-1", category: "done", priority: 3, assignee: "Ina" });
  });

  it("rejects files from other tools", () => {
    expect(readJira([["Task Name", "Status"], ["x", "open"]])).toEqual({ ok: false, error: "not_this_tool" });
  });
});

describe("buildPlan", () => {
  const file = (readJira((parseCsv(JIRA, 100) as { rows: string[][] }).rows) as { file: Parameters<typeof buildPlan>[0] }).file;

  it("maps statuses and people and fills the preview", () => {
    const { tickets, preview } = buildPlan(file, members, "Jira");
    expect(tickets.map((t) => [t.ref, t.status, t.assigneeId])).toEqual([
      ["WEB-1", "In Arbeit", "u-ina"],
      ["WEB-4", "Review", null],
      ["WEB-5", "Erledigt", null],
    ]);
    expect(preview).toMatchObject({ tickets: 3, subtasks: 2, comments: 2, labels: 2, skipped: 0, foldedSubtasks: 0 });
    expect(preview.people).toEqual([
      { name: "Tom Fremd", member: null, count: 1 },
      { name: "Ina Example", member: "Ina Example", count: 1 },
    ]);
    expect(preview.statuses).toContainEqual({ from: "Code Review", to: "Review", count: 1 });
    expect(tickets[0]!.comments[0]!.body).toBe("_Aus Jira übernommen_\n\nBitte bis Freitag");
  });

  it("matches people by e-mail too", () => {
    const t = { ...file.tickets[1]!, assignee: "INA@firma.de" };
    expect(buildPlan({ ...file, tickets: [t] }, members, "Jira").tickets[0]!.assigneeId).toBe("u-ina");
  });

  it("applies limits: long title and description are cut, extra subtasks become a checklist", () => {
    const subtasks = Array.from({ length: MAX_SUBTASKS + 2 }, (_, i) => ({ title: `S${i + 1}`, done: i === 6 }));
    const big = { ...file.tickets[0]!, title: "T".repeat(MAX_TITLE + 10), description: "D".repeat(100), subtasks };
    const { tickets, preview } = buildPlan({ ...file, tickets: [big] }, members, "Jira");
    expect(tickets[0]!.title).toHaveLength(MAX_TITLE);
    expect(tickets[0]!.subtasks).toHaveLength(MAX_SUBTASKS);
    expect(tickets[0]!.description).toContain("**Weitere Unteraufgaben (aus Jira):**\n- [ ] S6\n- [x] S7");
    expect(preview).toMatchObject({ truncatedTitles: 1, foldedSubtasks: 2, truncatedDescriptions: 0 });

    const long = buildPlan({ ...file, tickets: [{ ...big, description: "D".repeat(MAX_DESCRIPTION) }] }, members, "Jira");
    expect(long.tickets[0]!.description).toHaveLength(MAX_DESCRIPTION);
    expect(long.preview.truncatedDescriptions).toBe(1);
  });

  it("skips rows without a title and de-duplicates labels", () => {
    const { tickets, preview } = buildPlan(
      { ...file, tickets: [{ ...file.tickets[0]!, title: "  " }, { ...file.tickets[1]!, labels: ["UX", "ux", "a".repeat(80)] }] },
      members,
      "Jira",
    );
    expect(preview.skipped).toBe(1);
    expect(tickets[0]!.labels).toEqual(["UX", "a".repeat(50)]);
  });
});

describe("readImportFile", () => {
  it("reads a Jira file end to end", () => {
    const r = readImportFile("jira", new TextEncoder().encode(JIRA));
    expect(r.ok && r.file.tickets).toHaveLength(3);
  });

  it("caps the number of tickets", () => {
    const lines = ["Summary,Issue key", ...Array.from({ length: MAX_IMPORT_TICKETS + 1 }, (_, i) => `T${i},X-${i}`)];
    expect(readImportFile("jira", new TextEncoder().encode(lines.join("\n")))).toEqual({ ok: false, error: "too_many_tickets" });
  });

  it("explains a header-only file as empty", () => {
    expect(readImportFile("jira", new TextEncoder().encode("Summary,Issue key\n"))).toEqual({ ok: false, error: "empty" });
  });
});
