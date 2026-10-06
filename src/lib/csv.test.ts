import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes separators, quotes and line breaks", () => {
    expect(csvCell('Sag "Hallo"; danke')).toBe('"Sag ""Hallo""; danke"');
    expect(csvCell("Zeile 1\nZeile 2")).toBe('"Zeile 1\nZeile 2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
  });

  it("defuses formulas (CSV injection)", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+49 40 123")).toBe("'+49 40 123");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@chef")).toBe("'@chef");
  });

  it("writes BOM, header and CRLF rows", () => {
    expect(toCsv(["A", "B"], [["1", "x;y"]])).toBe('﻿A;B\r\n1;"x;y"\r\n');
  });
});
