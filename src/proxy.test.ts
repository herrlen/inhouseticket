import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pageviews", () => ({ recordPageView: vi.fn() }));
vi.mock("@/lib/site", () => ({ HOSTS: { appUrl: "https://app.inhouseticket.com", siteUrl: "https://inhouseticket.com" } }));
const { config } = await import("./proxy");

// Same reading as Next.js: the matcher source as an anchored regular expression.
const source = config.matcher[0]!.source;
const matches = (path: string) => new RegExp(`^${source}$`).test(path);

describe("proxy matcher", () => {
  it.each(["/", "/firma", "/firma/board", "/login", "/statistik-gmbh", "/stats", "/firma/stat"])("covers page %s", (path) => {
    expect(matches(path)).toBe(true);
  });

  it.each(["/api/w/x/tickets", "/mcp", "/stat", "/stat.js", "/_next/static/chunks/a.js"])("skips %s (no body buffering, no CSP needed)", (path) => {
    expect(matches(path)).toBe(false);
  });
});

describe("proxy matcher for the site → app redirect", () => {
  const auth = config.matcher[1]!.source;
  it("covers /api/auth (sign-in links on the old address), nothing else under /api", () => {
    expect(auth).toBe("/api/auth/:path*");
  });
});
