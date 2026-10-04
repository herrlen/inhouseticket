import { describe, expect, it } from "vitest";
import { parseDueWord, parseQuickAdd } from "./quick-add";

const members = [
  { id: "u1", name: "Max Mustermann" },
  { id: "u2", name: "Lea Becker" },
  { id: "u3", name: "Lena Kühn" },
  { id: "u4", name: "Jörg Weiß" },
];
const today = "2026-10-07"; // Wednesday
const parse = (s: string) => parseQuickAdd(s, { members, today, currentUserId: "u2" });

describe("parseQuickAdd", () => {
  it("parses the KONZEPT example", () => {
    expect(parse("Bug Login kaputt @max !hoch ^freitag")).toMatchObject({
      title: "Bug Login kaputt",
      assigneeId: "u1",
      priority: 3,
      dueDate: "2026-10-09",
    });
  });

  it("matches full names, umlauts and @ich", () => {
    expect(parse("x @LeaBecker").assigneeId).toBe("u2");
    expect(parse("x @joerg").assigneeId).toBe("u4");
    expect(parse("x @jörg").assigneeId).toBe("u4");
    expect(parse("x @ich").assigneeId).toBe("u2");
  });

  it("leaves ambiguous or unknown tokens in the title", () => {
    const ambiguous = parse("Mail an @le schreiben");
    expect(ambiguous.title).toBe("Mail an @le schreiben");
    expect(ambiguous.assigneeId).toBeUndefined();
    const unknown = parse("Preis !wichtig ^irgendwann");
    expect(unknown).toEqual({ title: "Preis !wichtig ^irgendwann", tokens: [] });
  });

  it("supports !1–!4 and English words", () => {
    expect(parse("a !1").priority).toBe(4);
    expect(parse("a !4").priority).toBe(1);
    expect(parse("a !urgent").priority).toBe(4);
  });

  it("only takes the first token of each kind", () => {
    expect(parse("a !hoch !niedrig")).toMatchObject({ priority: 3, title: "a !niedrig" });
  });

  it("describes recognized tokens for the preview", () => {
    expect(parse("a @max !dringend ^morgen").tokens.map((t) => t.label)).toEqual(["Max Mustermann", "Dringend", "Do., 08.10."]);
  });
});

describe("parseDueWord (today = Wed 2026-10-07)", () => {
  it.each([
    ["heute", "2026-10-07"],
    ["morgen", "2026-10-08"],
    ["übermorgen", "2026-10-09"],
    ["mittwoch", "2026-10-07"],
    ["mo", "2026-10-12"],
    ["sonntag", "2026-10-11"],
    ["nächste-woche", "2026-10-12"],
    ["+3", "2026-10-10"],
    ["24.12.", "2026-12-24"],
    ["01.02.", "2027-02-01"],
    ["24.12.2027", "2027-12-24"],
    ["5.3.27", "2027-03-05"],
    ["2026-11-30", "2026-11-30"],
  ])("%s → %s", (word, date) => {
    expect(parseDueWord(word, today)).toBe(date);
  });

  it.each(["31.02.", "2026-13-01", "gestern", "bald"])("rejects %s", (word) => {
    expect(parseDueWord(word, today)).toBeNull();
  });
});
