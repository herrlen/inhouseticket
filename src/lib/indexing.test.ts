import { describe, expect, it, vi } from "vitest";
import { needsNoindex } from "./indexing";

vi.mock("@/lib/env", () => ({ env: { SITE_INDEXABLE: true, APP_URL: "https://app.inhouseticket.com" } }));
// Public pages live on the site host, not on APP_URL.
vi.mock("@/lib/site", () => ({ SITE_URL: "https://inhouseticket.com" }));

describe("needsNoindex", () => {
  it.each(["/", "/umziehen", "/impressum", "/datenschutz/", "/agb", "/avv", "/robots.txt", "/sitemap.xml", "/landing/board-light.jpg", "/opengraph-image", "/_next/static/chunks/a.js", "/.well-known/security.txt"])(
    "lets %s be indexed",
    (path) => expect(needsNoindex(path)).toBe(false),
  );

  it.each([
    "/login", "/login/link", "/register", "/register/confirm", "/forgot-password", "/reset-password", "/set-password", "/start", "/onboarding",
    "/invite/abc", "/oauth/consent", "/admin", "/acme", "/acme/p/MKT", "/acme/settings/claude", "/.well-known/oauth-authorization-server", "/dev/ui",
  ])("keeps %s out of search results", (path) => expect(needsNoindex(path)).toBe(true));
});

describe("robots.txt and sitemap after launch", () => {
  it("disallows nothing (noindex needs a crawlable page) and names the sitemap", async () => {
    const { default: robots } = await import("@/app/robots");
    expect(robots()).toEqual({ rules: [{ userAgent: "*", allow: "/" }], sitemap: "https://inhouseticket.com/sitemap.xml" });
  });

  it("lists only public pages", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const paths = sitemap().map((e) => new URL(e.url).pathname);
    expect(paths).toEqual(["/", "/umziehen", "/impressum", "/datenschutz", "/agb", "/avv"]);
    for (const p of paths) expect(needsNoindex(p)).toBe(false);
  });
});
