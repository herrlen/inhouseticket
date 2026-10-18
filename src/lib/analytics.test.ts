import { beforeEach, describe, expect, it, vi } from "vitest";

type Command = [string, ...unknown[]];

async function load(referrer = "") {
  vi.resetModules();
  const paq: Command[] = [];
  vi.stubGlobal("window", { _paq: paq, location: { origin: "https://inhouseticket.com", hostname: "inhouseticket.com", pathname: "/", search: "" } });
  vi.stubGlobal("document", { referrer });
  return { paq, ...(await import("./analytics")) };
}

beforeEach(() => vi.unstubAllGlobals());

describe("trackPage", () => {
  it("sends normalised URL, generic title and previous page as referrer", async () => {
    const { paq, trackPage } = await load("https://www.google.com/search?q=ticket");
    trackPage("/acme/p/MKT", "?t=MKT-12&q=geheim");
    trackPage("/acme/p/MKT", "?view=board");
    expect(paq).toEqual([
      ["setReferrerUrl", "https://www.google.com/"],
      ["setCustomUrl", "https://inhouseticket.com/:id/p/:id"],
      ["setDocumentTitle", "inhouseticket.com/Ticket Detail"],
      ["trackPageView"],
      ["setReferrerUrl", "https://inhouseticket.com/:id/p/:id"],
      ["setCustomUrl", "https://inhouseticket.com/:id/p/:id?view=board"],
      ["setDocumentTitle", "inhouseticket.com/Board"],
      ["trackPageView"],
    ]);
  });

  it("skips a repeated view (filters, double effects)", async () => {
    const { paq, trackPage } = await load();
    trackPage("/acme/p/MKT", "");
    trackPage("/acme/p/MKT", "?q=a");
    trackPage("/acme/p/MKT", "?q=ab&assignee=me");
    expect(paq.filter(([c]) => c === "trackPageView")).toHaveLength(1);
  });

  it("does nothing without Matomo", async () => {
    const { trackPage, trackEvent } = await load();
    (window as { _paq?: Command[] })._paq = undefined;
    expect(() => {
      trackPage("/", "");
      trackEvent("Ticket", "Created");
    }).not.toThrow();
  });
});

describe("trackEvent", () => {
  it("pushes category, action, name and value; sets the normalised URL first if no page view yet", async () => {
    const { paq, trackEvent } = await load();
    window.location.pathname = "/acme/settings/members";
    trackEvent("Team", "Member invited", "settings", 3);
    expect(paq).toEqual([
      ["setReferrerUrl", ""],
      ["setCustomUrl", "https://inhouseticket.com/:id/settings/members"],
      ["trackEvent", "Team", "Member invited", "settings", 3],
    ]);
  });
});

describe("initMatomo", () => {
  it("configures cookieless tracking via /stat without a page view", async () => {
    const { initMatomo } = await load();
    const code = initMatomo("4");
    expect(code).toContain("['disableCookies']");
    expect(code).toContain("['setDoNotTrack',true]");
    expect(code).toContain("['setTrackerUrl','/stat']");
    expect(code).toContain("['setSiteId',\"4\"]");
    expect(code).toContain("g.src='/stat.js'");
    expect(code).not.toContain("trackPageView");
    expect(code).not.toContain("setCookieDomain");
  });
});
