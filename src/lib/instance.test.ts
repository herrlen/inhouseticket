import { describe, expect, it } from "vitest";
import { applyInstance, legalLinks, legalPage, type Instance } from "./instance";

const HOSTED: Instance = { selfHosted: false };
const COMPANY: Instance = { selfHosted: true, name: "Firma GmbH", imprintUrl: "https://www.firma.example/impressum", privacyUrl: "https://www.firma.example/datenschutz" };
const BARE: Instance = { selfHosted: true };

describe("applyInstance", () => {
  const env = { SELF_HOSTED: false, SITE_URL: "https://inhouseticket.com", SITE_INDEXABLE: true, APP_URL: "https://app.inhouseticket.com" };

  it("leaves the hosted service alone", () => {
    expect(applyInstance(env)).toEqual(env);
  });

  it("drops the marketing host and indexing on a company instance", () => {
    expect(applyInstance({ ...env, SELF_HOSTED: true })).toEqual({ ...env, SELF_HOSTED: true, SITE_URL: undefined, SITE_INDEXABLE: false });
  });
});

describe("legalLinks", () => {
  it("lists our four pages on the hosted service", () => {
    expect(legalLinks(HOSTED)).toEqual([
      { key: "imprint", href: "/impressum", external: false },
      { key: "privacy", href: "/datenschutz", external: false },
      { key: "terms", href: "/agb", external: false },
      { key: "dpa", href: "/avv", external: false },
    ]);
  });

  it("points at the company's own pages, without terms and DPA", () => {
    expect(legalLinks(COMPANY)).toEqual([
      { key: "imprint", href: "https://www.firma.example/impressum", external: true },
      { key: "privacy", href: "https://www.firma.example/datenschutz", external: true },
    ]);
  });

  it("falls back to the neutral pages without URLs", () => {
    expect(legalLinks(BARE)).toEqual([
      { key: "imprint", href: "/impressum", external: false },
      { key: "privacy", href: "/datenschutz", external: false },
    ]);
  });
});

describe("legalPage", () => {
  it.each(["imprint", "privacy", "terms", "dpa"] as const)("shows our %s text on the hosted service", (key) => {
    expect(legalPage(key, HOSTED)).toEqual({ kind: "own" });
  });

  it("redirects to the company's pages", () => {
    expect(legalPage("imprint", COMPANY)).toEqual({ kind: "redirect", url: COMPANY.imprintUrl });
    expect(legalPage("privacy", COMPANY)).toEqual({ kind: "redirect", url: COMPANY.privacyUrl });
  });

  it("shows the neutral note without URLs", () => {
    expect(legalPage("imprint", BARE)).toEqual({ kind: "note" });
    expect(legalPage("privacy", BARE)).toEqual({ kind: "note" });
  });

  it.each(["terms", "dpa"] as const)("has no %s page on a company instance", (key) => {
    expect(legalPage(key, COMPANY)).toEqual({ kind: "none" });
    expect(legalPage(key, BARE)).toEqual({ kind: "none" });
  });
});
