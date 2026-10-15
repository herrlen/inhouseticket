import { describe, expect, it } from "vitest";
import { isBot, normalizePath, referrerHost } from "./pageview-path";

describe("normalizePath", () => {
  it("keeps public pages", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/login/")).toBe("/login");
    expect(normalizePath("/impressum")).toBe("/impressum");
    expect(normalizePath("/umziehen")).toBe("/umziehen");
  });

  it("never stores workspace slugs, keys or tokens", () => {
    expect(normalizePath("/mueller-gmbh")).toBe("/[workspace]");
    expect(normalizePath("/mueller-gmbh/inbox")).toBe("/[workspace]/inbox");
    expect(normalizePath("/mueller-gmbh/p/MKT")).toBe("/[workspace]/p/[key]");
    expect(normalizePath("/mueller-gmbh/p/MKT/settings")).toBe("/[workspace]/p/[key]/settings");
    expect(normalizePath("/mueller-gmbh/settings/claude")).toBe("/[workspace]/settings/claude");
    expect(normalizePath("/invite/abc123secret")).toBe("/invite/[token]");
    expect(normalizePath("/mueller-gmbh/geheim/tief")).toBe("/[workspace]/…");
  });
});

describe("referrerHost", () => {
  it("keeps external hosts only", () => {
    expect(referrerHost("https://www.linkedin.com/feed/", "inhouseticket.com")).toBe("linkedin.com");
    expect(referrerHost("https://inhouseticket.com/login", "inhouseticket.com")).toBe("");
    expect(referrerHost(null, "inhouseticket.com")).toBe("");
    expect(referrerHost("kaputt", "inhouseticket.com")).toBe("");
  });
});

describe("isBot", () => {
  it("skips crawlers, headless browsers and missing user agents", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/140")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36")).toBe(false);
  });
});
