import { describe, expect, it } from "vitest";
import { mentionedUserIds, parseInline, parseMarkdown } from "./markdown";

describe("parseInline", () => {
  it("handles bold, italic and code", () => {
    expect(parseInline("a **fett** und *kursiv* und `code`")).toEqual([
      { t: "text", v: "a " },
      { t: "strong", c: [{ t: "text", v: "fett" }] },
      { t: "text", v: " und " },
      { t: "em", c: [{ t: "text", v: "kursiv" }] },
      { t: "text", v: " und " },
      { t: "code", v: "code" },
    ]);
  });

  it("does not treat snake_case or 2*3*4 as italic", () => {
    expect(parseInline("my_var_name")).toEqual([{ t: "text", v: "my_var_name" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ t: "text", v: "2 * 3 * 4" }]);
  });

  it("allows http(s) and mailto links only", () => {
    expect(parseInline("[Docs](https://example.com/a)")).toEqual([{ t: "link", href: "https://example.com/a", c: [{ t: "text", v: "Docs" }] }]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "[x](javascript:alert(1))" }]);
    expect(parseInline("[x](data:text/html,hi)")[0]).toEqual({ t: "text", v: "[x](data:text/html,hi)" });
  });

  it("auto-links bare URLs without trailing punctuation", () => {
    expect(parseInline("Siehe https://firma.de/x.")).toEqual([
      { t: "text", v: "Siehe " },
      { t: "link", href: "https://firma.de/x", c: [{ t: "text", v: "https://firma.de/x" }] },
      { t: "text", v: "." },
    ]);
  });

  it("keeps HTML as plain text", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]);
  });

  it("parses mentions", () => {
    expect(parseInline("Hallo @[Lea Becker](u_1)!")).toEqual([
      { t: "text", v: "Hallo " },
      { t: "mention", name: "Lea Becker", userId: "u_1" },
      { t: "text", v: "!" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("builds paragraphs, lists and code blocks", () => {
    const blocks = parseMarkdown("Intro\nzweite Zeile\n\n- eins\n- zwei\n\n1. a\n2. b\n\n```\nnpm i\n```");
    expect(blocks.map((b) => b.t)).toEqual(["p", "ul", "ol", "pre"]);
    expect(blocks[1]).toEqual({ t: "ul", items: [[{ t: "text", v: "eins" }], [{ t: "text", v: "zwei" }]] });
    expect(blocks[3]).toEqual({ t: "pre", v: "npm i" });
  });
});

describe("mentionedUserIds", () => {
  it("returns unique ids", () => {
    expect(mentionedUserIds("@[A](u1) und @[B](u2) und nochmal @[A](u1)")).toEqual(["u1", "u2"]);
  });
});
