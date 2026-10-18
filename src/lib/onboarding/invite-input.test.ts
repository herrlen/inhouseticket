import { describe, expect, it } from "vitest";
import { parseInviteInput, splitInviteInput } from "./invite-input";

describe("splitInviteInput", () => {
  it("splits on commas, semicolons, spaces and line breaks", () => {
    expect(splitInviteInput("a@firma.de, b@firma.de;c@firma.de\nd@firma.de  e@firma.de\r\n")).toEqual([
      "a@firma.de", "b@firma.de", "c@firma.de", "d@firma.de", "e@firma.de",
    ]);
  });

  it("takes the address from mail-client lists and drops mailto/quotes", () => {
    expect(splitInviteInput(`Max Muster <Max@Firma.de>; "Anna" <anna@firma.de>, mailto:lea@firma.de, 'ole@firma.de'`)).toEqual([
      "max@firma.de", "anna@firma.de", "lea@firma.de", "ole@firma.de",
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(splitInviteInput(" ,\n ; ")).toEqual([]);
  });
});

describe("parseInviteInput", () => {
  const ctx = { domain: "firma.de", members: ["chef@firma.de"], existing: ["offen@firma.de"] };

  it("classifies every address", () => {
    expect(
      parseInviteInput("neu@firma.de max@gmail.com frei@agentur.de chef@firma.de offen@firma.de neu@firma.de kein-at nix@firma", ctx),
    ).toEqual([
      { email: "neu@firma.de", status: "ok" },
      { email: "max@gmail.com", status: "freemail" },
      { email: "frei@agentur.de", status: "external" },
      { email: "chef@firma.de", status: "member" },
      { email: "offen@firma.de", status: "duplicate" },
      { email: "neu@firma.de", status: "duplicate" },
      { email: "kein-at", status: "invalid" },
      { email: "nix@firma", status: "invalid" },
    ]);
  });

  it("treats freemail subdomains as freemail", () => {
    expect(parseInviteInput("a@mail.gmx.de", ctx)[0]?.status).toBe("freemail");
  });

  it("marks every company address external in a personal workspace", () => {
    expect(parseInviteInput("neu@firma.de", { domain: "len@gmail.com" })).toEqual([{ email: "neu@firma.de", status: "external" }]);
  });

  it("works without context (no domain → external)", () => {
    expect(parseInviteInput("a@firma.de")).toEqual([{ email: "a@firma.de", status: "external" }]);
  });
});
