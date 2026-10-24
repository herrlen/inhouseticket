import { describe, expect, it } from "vitest";
import { hostname, sharedCookieDomain, siteRedirect, trustedOrigins } from "./hosts";

const HOSTS = { appUrl: "https://app.inhouseticket.com", siteUrl: "https://inhouseticket.com" };
const req = (pathname: string, opts: { host?: string; method?: string; search?: string } = {}) => ({
  host: opts.host ?? "inhouseticket.com",
  pathname,
  search: opts.search ?? "",
  method: opts.method ?? "GET",
});

describe("siteRedirect", () => {
  it.each(["/", "/umziehen", "/impressum", "/datenschutz/", "/agb", "/avv", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/icon.svg", "/apple-icon.png", "/landing/board-light.jpg", "/opengraph-image", "/.well-known/oauth-protected-resource/mcp", "/stat"])(
    "keeps %s on the site host",
    (path) => {
      expect(siteRedirect(req(path), HOSTS)).toBeNull();
    },
  );

  it.each(["/login", "/register", "/start", "/acme", "/acme/p/WEB", "/acme/dashboard", "/invite/abc", "/admin", "/oauth/consent"])("moves %s to the app host", (path) => {
    expect(siteRedirect(req(path), HOSTS)).toEqual({ url: `https://app.inhouseticket.com${path}`, status: 301 });
  });

  it("keeps the query string", () => {
    expect(siteRedirect(req("/login/link", { search: "?token=x&next=%2Fstart" }), HOSTS)?.url).toBe("https://app.inhouseticket.com/login/link?token=x&next=%2Fstart");
  });

  it("moves sign-in links under /api/auth with GET, not token or MCP calls", () => {
    expect(siteRedirect(req("/api/auth/oauth2/authorize", { search: "?client_id=c" }), HOSTS)).toEqual({ url: "https://app.inhouseticket.com/api/auth/oauth2/authorize?client_id=c", status: 301 });
    expect(siteRedirect(req("/api/auth/oauth2/token", { method: "POST" }), HOSTS)).toBeNull();
    expect(siteRedirect(req("/mcp", { method: "POST" }), HOSTS)).toBeNull();
    expect(siteRedirect(req("/mcp"), HOSTS)).toBeNull();
    expect(siteRedirect(req("/api/health"), HOSTS)).toBeNull();
  });

  it("keeps the method of a page POST (308)", () => {
    expect(siteRedirect(req("/login", { method: "POST" }), HOSTS)?.status).toBe(308);
  });

  it("does nothing on the app host, with a port or in upper case only on the site host", () => {
    expect(siteRedirect(req("/login", { host: "app.inhouseticket.com" }), HOSTS)).toBeNull();
    expect(siteRedirect(req("/login", { host: "InhouseTicket.com:443" }), HOSTS)?.status).toBe(301);
  });

  it("does nothing without a separate site host (local, E2E)", () => {
    expect(siteRedirect(req("/login", { host: "localhost:3100" }), { appUrl: "http://localhost:3100", siteUrl: undefined })).toBeNull();
    expect(siteRedirect(req("/login"), { appUrl: "https://inhouseticket.com", siteUrl: "https://inhouseticket.com" })).toBeNull();
  });
});

describe("sharedCookieDomain", () => {
  it("is the site host when the app host is its subdomain", () => {
    expect(sharedCookieDomain(HOSTS)).toBe("inhouseticket.com");
  });

  it.each([
    [{ appUrl: "http://localhost:3100", siteUrl: undefined }],
    [{ appUrl: "https://inhouseticket.com", siteUrl: "https://inhouseticket.com" }],
    [{ appUrl: "https://app.example.org", siteUrl: "https://inhouseticket.com" }],
    [{ appUrl: "https://notinhouseticket.com", siteUrl: "https://inhouseticket.com" }],
  ])("stays host-only for %j", (hosts) => {
    expect(sharedCookieDomain(hosts)).toBeUndefined();
  });
});

describe("trustedOrigins", () => {
  it("allows the app and the site origin", () => {
    expect(trustedOrigins(HOSTS)).toEqual(["https://app.inhouseticket.com", "https://inhouseticket.com"]);
    expect(trustedOrigins({ appUrl: "http://localhost:3100/", siteUrl: undefined })).toEqual(["http://localhost:3100"]);
  });
});

describe("hostname", () => {
  it("drops the port and lower-cases", () => {
    expect(hostname("App.Inhouseticket.com:3000")).toBe("app.inhouseticket.com");
    expect(hostname(null)).toBe("");
  });
});
