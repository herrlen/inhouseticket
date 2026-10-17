import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pageviews", () => ({ recordPageView: vi.fn() }));
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
