import { describe, expect, it } from "vitest";
import { slugFromDomain, slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it.each([
    ["Müller & Söhne GmbH", "mueller-soehne-gmbh"],
    ["  Agentur  Süß ", "agentur-suess"],
    ["Café Crème", "cafe-creme"],
    ["---", ""],
  ])("%j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("slugFromDomain", () => {
  it.each([
    ["firma.de", "firma"],
    ["it.firma.de", "it-firma"],
    ["firma.co.uk", "firma"],
    ["mein-shop.com", "mein-shop"],
  ])("%s → %s", (domain, expected) => {
    expect(slugFromDomain(domain)).toBe(expected);
  });
});

describe("uniqueSlug", () => {
  it("appends a counter when taken", async () => {
    const taken = new Set(["firma", "firma-2"]);
    expect(await uniqueSlug("firma", async (s) => taken.has(s))).toBe("firma-3");
  });

  it("skips reserved words", async () => {
    expect(await uniqueSlug("login", async () => false)).toBe("login-2");
  });
});
