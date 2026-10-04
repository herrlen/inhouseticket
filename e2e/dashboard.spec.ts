import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, INVITE_LINK, linkFromMail, signIn, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

/** Resolves when a ticket PATCH has been answered by the server. */
const patched = (page: Page) => page.waitForResponse((r) => r.request().method() === "PATCH" && /\/api\/w\/[^/]+\/tickets\/[^/]+$/.test(r.url()));

const berlinDate = (offsetDays: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + offsetDays * 86_400_000));

async function setTicket(page: Page, key: string, opts: { prio?: string; me?: boolean; due?: string }) {
  if (opts.prio) {
    await page.getByRole("button", { name: new RegExp(`^Priorität von ${key}`) }).click();
    await page.getByRole("menuitem", { name: opts.prio }).click();
  }
  if (opts.me) {
    await page.getByRole("button", { name: new RegExp(`^Zuständig für ${key}`) }).click();
    await page.getByRole("menuitem", { name: /\(du\)/ }).click();
  }
  if (opts.due) await Promise.all([patched(page), page.getByRole("textbox", { name: `Fälligkeit von ${key}` }).fill(opts.due)]);
}

test("dashboard: workload, health, due heatmap, threshold and drill-down", async ({ page }) => {
  const path = await createWorkspace(page, `lea.becker@${uniqueDomain("dash")}`, "Dash GmbH");
  await page.goto(`${path}/p/MKT`);
  await waitForHydration(page.getByRole("textbox", { name: /Neues Ticket/ }));
  await setTicket(page, "MKT-1", { prio: "Dringend", me: true, due: berlinDate(-1) });
  await setTicket(page, "MKT-2", { prio: "Hoch", me: true, due: berlinDate(2) });
  await expect(page.getByText("Speichert …")).toHaveCount(0);

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // Lea: Dringend 4 + Hoch 3 = 7 points, 2 open, 1 overdue.
  const lea = page.getByRole("link", { name: /^Lea Becker: 7 Punkte, 2 offen, 1 überfällig – OK/ });
  await expect(lea).toBeVisible();
  await expect(page.locator("main span", { hasText: /^Überfällig$/ }).first().locator("..")).toContainText("1");
  await expect(page.getByRole("link", { name: /^Marketing: 3 offen, 0 in Arbeit, 0 erledigt, 1 überfällig/ })).toBeVisible();
  await expect(page.locator(`[aria-label^="${new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${berlinDate(2)}T00:00:00Z`))}"]`).first()).toHaveAttribute("aria-label", /1 Ticket fällig/);

  // Table view exists for each chart.
  await page.getByText("Als Tabelle anzeigen").first().click();
  await expect(page.getByRole("table").first()).toContainText("Lea Becker");

  // Lower the threshold → Lea is overloaded.
  await page.getByRole("spinbutton", { name: "Überlast ab Punkten:" }).fill("7");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("link", { name: /^Lea Becker: 7 Punkte.*Überlastet/ })).toBeVisible();

  // Drill down: person → their tasks, project scope.
  await page.getByRole("link", { name: /^Lea Becker: 7 Punkte/ }).click();
  await expect(page).toHaveURL(/\/me\?user=/);
  await expect(page.getByText("MKT-1")).toBeVisible();
  await page.goto(`${path}/dashboard?project=MKT`);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard – Marketing" })).toBeVisible();
});

test("inbox: assignment notifies the colleague, badge, mark read, digest switch", async ({ browser }) => {
  const domain = uniqueDomain("inbox");
  const owner = await browser.newPage();
  const since = new Date(Date.now() - 1000);
  const path = await createWorkspace(owner, `owner@${domain}`, "Inbox AG", `kim@${domain}`);
  const kim = await browser.newPage();
  const invite = await linkFromMail(`kim@${domain}`, INVITE_LINK, since);
  await signIn(kim, `kim@${domain}`, new URL(invite).pathname);
  await kim.getByRole("button", { name: "Annehmen" }).click();
  await expect(kim.getByRole("heading", { name: "Willkommen bei Inbox AG" })).toBeVisible();

  await owner.goto(`${path}/p/MKT`);
  await waitForHydration(owner.getByRole("textbox", { name: /Neues Ticket/ }));
  await owner.getByRole("button", { name: /^Zuständig für MKT-2/ }).click();
  await Promise.all([patched(owner), owner.getByRole("menuitem", { name: "Kim" }).click()]);

  await kim.goto(path);
  await expect(kim.getByRole("link", { name: "Inbox, 1 ungelesen" })).toBeVisible();
  await kim.getByRole("link", { name: "Inbox, 1 ungelesen" }).click();
  const item = kim.getByRole("link", { name: /Owner hat dir MKT-2 „Social-Media-Posts für die Woche vorbereiten“ zugewiesen/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(kim).toHaveURL(/\?t=MKT-2$/);
  await expect(kim.getByRole("link", { name: "Inbox", exact: true })).toBeVisible();

  await kim.goto(`${path}/inbox`);
  await expect(kim.getByText("Digest ist an")).toBeVisible();
  await kim.getByRole("button", { name: "Ausschalten" }).click();
  await expect(kim.getByText("Digest ist aus")).toBeVisible();
  await kim.reload();
  await expect(kim.getByText("Digest ist aus")).toBeVisible();
});
