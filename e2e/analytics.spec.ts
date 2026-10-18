import { expect, test, type Page } from "@playwright/test";
import { completeOwnerWizard, confirmRegistration, linkFromMail, REGISTER_LINK, submitRegistration, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// Matomo is switched on for the e2e dev server (playwright.config.ts). Every request the tracker
// sends to /stat is recorded here and checked: page views per route change without duplicates,
// normalised URLs and generic titles, events – and never an address, slug, token or ticket key.

type Hit = Record<string, string>;

function recordHits(page: Page): Hit[] {
  const hits: Hit[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname !== "/stat") return;
    const params = new URLSearchParams(url.search);
    for (const [k, v] of new URLSearchParams(req.postData() ?? "")) params.append(k, v);
    hits.push(Object.fromEntries(params));
  });
  return hits;
}

const pageViews = (hits: Hit[]) => hits.filter((h) => !h.e_c && !h.ping);
const events = (hits: Hit[]) => hits.filter((h) => h.e_c).map((h) => [h.e_c, h.e_a, h.e_n].filter(Boolean).join("/"));

test("public pages: one normalised page view per route, CTA goes to /register and is counted", async ({ page }) => {
  const hits = recordHits(page);
  await page.goto("/?utm_source=linkedin&email=max%40firma.de");
  await expect.poll(() => pageViews(hits).length).toBe(1);
  expect(pageViews(hits)[0]).toMatchObject({ url: "http://localhost:3100/?utm_source=linkedin", action_name: "localhost/Startseite" });

  const hero = page.locator('[data-cta="hero"]');
  await expect(hero).toHaveAttribute("href", "/register");
  await expect(page.locator('[data-cta="bottom"]')).toHaveAttribute("href", "/register");
  await waitForHydration(page.getByRole("link", { name: "Anmelden" }));
  await hero.click();
  await expect(page).toHaveURL(/\/register$/);
  await expect.poll(() => pageViews(hits).length).toBe(2);
  expect(events(hits)).toContain("Marketing/CTA Click/hero");
  expect(pageViews(hits)[1]).toMatchObject({ url: "http://localhost:3100/register", action_name: "localhost/Registrierung" });

  await page.goto("/umziehen");
  await expect(page.locator('[data-cta="umziehen"]')).toHaveAttribute("href", "/register");
  await expect.poll(() => pageViews(hits).length).toBe(3);
  await page.waitForTimeout(500);
  expect(pageViews(hits)).toHaveLength(3);
  for (const hit of hits) expect(JSON.stringify(hit)).not.toMatch(/firma\.de|%40|@/);
});

test("app: page views on route changes without duplicates, events without personal data", async ({ page }) => {
  const domain = uniqueDomain("stat");
  const email = `kim@${domain}`;
  const hits = recordHits(page);

  const since = new Date(Date.now() - 1000);
  await submitRegistration(page, { name: "Kim Analytics", email });
  await confirmRegistration(page, await linkFromMail(email, REGISTER_LINK, since));
  await completeOwnerWizard(page, "Statistik GmbH");
  const ws = `/${new URL(page.url()).pathname.split("/")[1]}`;
  await expect.poll(() => events(hits)).toContain("Account/Signup completed");
  // Wizard steps and the end: only step keys and the team area, nothing personal.
  await expect.poll(() => events(hits)).toContain("Onboarding/Completed/marketing");
  for (const step of ["profile", "workspace", "team", "view", "questions", "invite"]) expect(events(hits)).toContain(`Onboarding/Step completed/${step}`);
  expect(pageViews(hits).filter((h) => h.url?.endsWith("/onboarding")).map((h) => h.action_name)).toEqual(["localhost/Onboarding"]);

  // The wizard ends in the project list – wait for that view before counting.
  await expect.poll(() => pageViews(hits).at(-1)?.action_name).toBe("localhost/Liste");
  const beforeSearch = pageViews(hits).length;

  // Search terms never leave the browser: the page view carries the bare pattern.
  await page.goto(`${ws}/p/MKT?q=geheim`);
  const quickAdd = page.getByRole("textbox", { name: /Neues Ticket/ });
  await waitForHydration(quickAdd);
  await expect.poll(() => pageViews(hits).length).toBe(beforeSearch + 1);
  expect(pageViews(hits).at(-1)?.action_name).toBe("localhost/Liste");
  expect(pageViews(hits).at(-1)?.url).toBe("http://localhost:3100/:id/p/:id");

  const loaded = pageViews(hits).length;
  await page.goto(`${ws}/p/MKT`);
  await waitForHydration(quickAdd);
  await expect.poll(() => pageViews(hits).length).toBe(loaded + 1);
  await page.waitForTimeout(500);
  expect(pageViews(hits)).toHaveLength(loaded + 1); // one per load, also with React's double effects in dev

  await expect(async () => {
    await page.keyboard.press("b");
    await expect(page).toHaveURL(/view=board/, { timeout: 300 });
  }).toPass();
  await expect.poll(() => pageViews(hits).at(-1)?.action_name).toBe("localhost/Board");
  expect(pageViews(hits).at(-1)?.url).toBe("http://localhost:3100/:id/p/:id?view=board");
  expect(events(hits)).toContain("View/Kanban");

  await page.locator("[data-card]").filter({ hasText: "MKT-1" }).click();
  await expect(page).toHaveURL(/t=MKT-1/);
  await expect.poll(() => pageViews(hits).at(-1)?.action_name).toBe("localhost/Ticket Detail");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/t=MKT-1/);
  await expect.poll(() => pageViews(hits).at(-1)?.action_name).toBe("localhost/Board");

  await page.keyboard.press("l");
  await expect.poll(() => events(hits)).toContain("View/List");
  await quickAdd.fill("Analytics-Ticket mit geheimem Titel");
  await quickAdd.press("Enter");
  await expect.poll(() => events(hits)).toContain("Ticket/Created");

  // Within one page load no two successive page views are the same.
  const views = pageViews(hits).slice(loaded).map((h) => `${h.url} ${h.action_name}`);
  expect(views).toEqual([
    "http://localhost:3100/:id/p/:id localhost/Liste",
    "http://localhost:3100/:id/p/:id?view=board localhost/Board",
    "http://localhost:3100/:id/p/:id?view=board localhost/Ticket Detail",
    "http://localhost:3100/:id/p/:id?view=board localhost/Board",
    "http://localhost:3100/:id/p/:id localhost/Liste",
  ]);
  for (let i = 1; i < views.length; i++) expect(views[i]).not.toBe(views[i - 1]);
  // Nothing personal or identifying in any hit.
  const slug = ws.slice(1);
  for (const hit of hits) {
    const text = decodeURIComponent(JSON.stringify(hit));
    expect(text).not.toContain(domain);
    expect(text).not.toContain(slug);
    expect(text).not.toMatch(/MKT|Kim|Statistik|geheim|token|@/);
  }
});

test("opt-out on the privacy page: nothing is sent until measurement is switched on again", async ({ page }) => {
  const hits = recordHits(page);
  await page.goto("/datenschutz");
  await expect.poll(() => pageViews(hits).length).toBe(1);
  const status = page.getByRole("status").filter({ hasText: "Messung" });
  await expect(status).toHaveText("Die Messung ist auf diesem Gerät aktiv.");
  const off = page.getByRole("button", { name: "Messung auf diesem Gerät deaktivieren" });
  await waitForHydration(off);
  await off.focus();
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Die Messung ist auf diesem Gerät deaktiviert.");
  const cookie = (await page.context().cookies()).find((c) => c.name === "iht_optout");
  expect(cookie).toMatchObject({ value: "1", httpOnly: false, sameSite: "Lax" });
  await expect(page.getByRole("button", { name: "Messung auf diesem Gerät aktivieren" })).toBeFocused();

  // Client navigation and full loads: no tracker, no hit.
  await page.getByRole("link", { name: "inhouseticket" }).first().click();
  await expect(page).toHaveURL("http://localhost:3100/");
  await page.goto("/umziehen");
  await page.goto("/login");
  await page.waitForTimeout(500);
  expect(hits).toHaveLength(1);
  expect(await page.evaluate(() => typeof (window as unknown as { _paq?: unknown })._paq)).toBe("undefined");
  // /stat drops anything that still arrives with the cookie.
  expect((await page.request.post("/stat", { form: { url: "http://localhost:3100/", action_name: "x" } })).status()).toBe(204);

  await page.goto("/datenschutz");
  await page.getByRole("button", { name: "Messung auf diesem Gerät aktivieren" }).click();
  await expect(status).toHaveText("Die Messung ist auf diesem Gerät aktiv.");
  expect((await page.context().cookies()).map((c) => c.name)).not.toContain("iht_optout");
  await page.goto("/umziehen");
  await expect.poll(() => pageViews(hits).length).toBe(2);
});

test("Global Privacy Control: no tracker, no hit", async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }));
  const page = await context.newPage();
  const hits = recordHits(page);
  await page.goto("/");
  await page.goto("/datenschutz");
  await expect(page.getByRole("status").filter({ hasText: "Global Privacy Control" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(hits).toEqual([]);
  expect(await page.evaluate(() => typeof (window as unknown as { _paq?: unknown })._paq)).toBe("undefined");
  await context.close();
});

test("X-Robots-Tag: noindex on app, auth, API and MCP – not on public pages", async ({ request }) => {
  for (const path of ["/login", "/register", "/forgot-password", "/onboarding", "/invite/abc", "/oauth/consent", "/admin", "/some-workspace", "/api/health", "/.well-known/oauth-authorization-server"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
  }
  const mcp = await request.post("/mcp", { data: {}, maxRedirects: 0 });
  expect(mcp.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  for (const path of ["/", "/umziehen", "/impressum", "/datenschutz", "/agb", "/avv", "/robots.txt", "/sitemap.xml"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.headers()["x-robots-tag"], path).toBeUndefined();
  }
});

test("auth pages carry meta robots noindex", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});
