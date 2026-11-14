import { describe, expect, it, vi } from "vitest";

// Company instance (SELF_HOSTED=true): "/" is the sign-in, nothing indexable, legal pages of the company.
vi.mock("@/lib/env", () => ({ env: { SELF_HOSTED: true, SITE_INDEXABLE: false, APP_URL: "https://tickets.firma.example" } }));
vi.mock("@/lib/site", () => ({
  SITE_URL: "https://tickets.firma.example",
  INSTANCE: { selfHosted: true, name: "Firma GmbH", imprintUrl: "https://www.firma.example/impressum" },
  LEGAL_LINKS: [],
  appHref: (path: string) => path,
  isAppHost: () => false,
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => null) }));
vi.mock("@/lib/i18n/server", () => ({ getT: vi.fn(), getLocale: vi.fn(async () => "de") }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "tickets.firma.example" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

describe("company instance", () => {
  it("sends signed-out visitors from / to the sign-in", async () => {
    const { default: Home } = await import("./page");
    await expect(Home()).rejects.toThrow("REDIRECT /login");
  });

  it("keeps search engines out", async () => {
    const { default: robots } = await import("./robots");
    const { default: sitemap } = await import("./sitemap");
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    expect(sitemap()).toEqual([]);
  });

  it("redirects the legal notice to the company's page", async () => {
    const { instanceLegal } = await import("@/components/instance-legal");
    expect(() => instanceLegal("imprint")).toThrow("REDIRECT https://www.firma.example/impressum");
  });

  it("shows a neutral note for the privacy policy without PRIVACY_URL", async () => {
    const { instanceLegal } = await import("@/components/instance-legal");
    expect(instanceLegal("privacy")).toBeTruthy();
  });

  it.each(["terms", "dpa"] as const)("has no %s page", async (key) => {
    const { instanceLegal } = await import("@/components/instance-legal");
    expect(() => instanceLegal(key)).toThrow("NOT_FOUND");
  });
});
