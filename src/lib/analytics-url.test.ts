import { describe, expect, it } from "vitest";
import { analyticsPath, analyticsReferrer, analyticsTitle, analyticsUrl } from "./analytics-url";

describe("analyticsPath", () => {
  it("keeps fixed routes", () => {
    expect(analyticsPath("/")).toBe("/");
    expect(analyticsPath("/login/")).toBe("/login");
    expect(analyticsPath("/login/link")).toBe("/login/link");
    expect(analyticsPath("/register/confirm")).toBe("/register/confirm");
    expect(analyticsPath("/oauth/consent")).toBe("/oauth/consent");
    expect(analyticsPath("/umziehen")).toBe("/umziehen");
    expect(analyticsPath("/admin")).toBe("/admin");
  });

  it("replaces workspace slugs, project keys, tokens and ids with :id", () => {
    expect(analyticsPath("/mueller-gmbh")).toBe("/:id");
    expect(analyticsPath("/mueller-gmbh/inbox")).toBe("/:id/inbox");
    expect(analyticsPath("/acme/p/MKT")).toBe("/:id/p/:id");
    expect(analyticsPath("/acme/p/me")).toBe("/:id/p/:id");
    expect(analyticsPath("/acme/p/MKT/settings")).toBe("/:id/p/:id/settings");
    expect(analyticsPath("/acme/settings/data/import")).toBe("/:id/settings/data/import");
    expect(analyticsPath("/invite/abc123secret")).toBe("/invite/:id");
    expect(analyticsPath("/acme/MKT-12")).toBe("/:id/:id");
    expect(analyticsPath("/acme/x/0b6c2c1e-4f1a-4e8e-9d55-3f0d2b7c9a10/42")).toBe("/:id/:id/:id/:id");
    // A slug that looks like a fixed segment is still a slug in first position.
    expect(analyticsPath("/settings")).toBe("/:id");
  });
});

describe("analyticsUrl", () => {
  it("drops ticket keys, search terms, tokens, addresses and codes", () => {
    expect(analyticsUrl("/acme/p/MKT", "?t=MKT-12")).toBe("/:id/p/:id");
    expect(analyticsUrl("/acme/p/MKT", "?q=geheim&assignee=me&label=x")).toBe("/:id/p/:id");
    expect(analyticsUrl("/login", "?next=%2Facme%2Fp%2FMKT&error=link")).toBe("/login");
    expect(analyticsUrl("/login/link", "?token=abc&callbackURL=%2Fstart")).toBe("/login/link");
    expect(analyticsUrl("/register/confirm", "?token=abc&email=a%40firma.de")).toBe("/register/confirm");
    expect(analyticsUrl("/reset-password", "?token=abc")).toBe("/reset-password");
    expect(analyticsUrl("/oauth/consent", "?client_id=x&code=y&state=z")).toBe("/oauth/consent");
  });

  it("keeps view=board on project pages only", () => {
    expect(analyticsUrl("/acme/p/MKT", "?view=board&t=MKT-3")).toBe("/:id/p/:id?view=board");
    expect(analyticsUrl("/acme/p/MKT", "?view=list")).toBe("/:id/p/:id");
    expect(analyticsUrl("/acme/inbox", "?view=board")).toBe("/:id/inbox");
  });

  it("keeps UTM parameters on public pages only, and only plain labels", () => {
    expect(analyticsUrl("/", "?utm_source=linkedin&utm_campaign=launch-2026&fbclid=x")).toBe("/?utm_source=linkedin&utm_campaign=launch-2026");
    expect(analyticsUrl("/umziehen", "?utm_medium=email")).toBe("/umziehen?utm_medium=email");
    expect(analyticsUrl("/", "?utm_source=max%40firma.de")).toBe("/");
    expect(analyticsUrl("/login", "?utm_source=linkedin")).toBe("/login");
    expect(analyticsUrl("/acme/p/MKT", "?utm_source=linkedin")).toBe("/:id/p/:id");
  });

  it("never contains an e-mail address, token or ticket key", () => {
    const urls = [
      analyticsUrl("/acme/p/MKT", "?t=MKT-12&q=max%40firma.de"),
      analyticsUrl("/invite/tok_9f8e7d", "?email=max%40firma.de"),
      analyticsUrl("/", "?utm_content=MKT-12%40x"),
    ];
    for (const url of urls) expect(url).not.toMatch(/@|MKT|tok_|acme/);
  });
});

describe("analyticsTitle", () => {
  it("maps routes to generic titles", () => {
    expect(analyticsTitle("/acme/p/MKT", "")).toBe("Liste");
    expect(analyticsTitle("/acme/p/MKT", "?view=board")).toBe("Board");
    expect(analyticsTitle("/acme/p/MKT", "?view=board&t=MKT-12")).toBe("Ticket Detail");
    expect(analyticsTitle("/acme/dashboard", "")).toBe("Dashboard");
    expect(analyticsTitle("/acme/settings/members", "")).toBe("Einstellungen/Mitglieder");
    expect(analyticsTitle("/", "")).toBe("Startseite");
    expect(analyticsTitle("/register", "")).toBe("Registrierung");
    expect(analyticsTitle("/invite/abc", "")).toBe("Einladung");
    expect(analyticsTitle("/acme/geheim/tief", "")).toBe("Sonstige");
  });
});

describe("analyticsReferrer", () => {
  const origin = "https://inhouseticket.com";
  it("normalises own pages and cuts foreign ones to the origin", () => {
    expect(analyticsReferrer("https://inhouseticket.com/acme/p/MKT?t=MKT-1", origin)).toBe("https://inhouseticket.com/:id/p/:id");
    expect(analyticsReferrer("https://www.linkedin.com/feed/?trk=abc", origin)).toBe("https://www.linkedin.com/");
    expect(analyticsReferrer("", origin)).toBe("");
    expect(analyticsReferrer("android-app://com.google", origin)).toBe("");
    expect(analyticsReferrer("kaputt", origin)).toBe("");
  });
});
