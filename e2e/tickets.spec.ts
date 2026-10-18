import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";
import { ticketSaved } from "./helpers/saved";

const table = (page: Page) => page.getByRole("table", { name: /Tickets in/ });
const row = (page: Page, key: string) => table(page).locator("tr", { has: page.getByText(key, { exact: true }) });
const detail = (page: Page) => page.getByRole("dialog");

async function openProject(page: Page, label: string) {
  const path = await createWorkspace(page, `lea@${uniqueDomain(label)}`, `${label} GmbH`);
  await page.goto(`${path}/p/MKT`);
  await waitForHydration(page.getByRole("textbox", { name: /Neues Ticket/ }));
  return path;
}

test("create with C, counter, inline edits persist", async ({ page }) => {
  const path = await openProject(page, "tix");

  // The shortcut listener attaches right after hydration; retry the key until it lands.
  const quick = page.getByRole("textbox", { name: /Neues Ticket/ });
  await expect(async () => {
    await page.keyboard.press("c");
    await expect(quick).toBeFocused({ timeout: 300 });
  }).toPass();
  await expect(quick).toHaveValue("");
  await quick.fill("Banner für Q4 gestalten");
  await expect(page.getByText("23/500")).toBeVisible();
  await quick.press("Enter");
  await expect(row(page, "MKT-6")).toContainText("Banner für Q4 gestalten");
  await expect(quick).toHaveValue("");

  // New tickets are on top of their status group.
  const firstKey = table(page).locator("tbody").first().locator("tr").nth(1).locator("td").nth(1);
  await expect(firstKey).toHaveText("MKT-6");

  // Inline: priority and assignee.
  await page.getByRole("button", { name: /^Priorität von MKT-6/ }).click();
  await page.getByRole("menuitem", { name: "Dringend" }).click();
  await expect(page.getByRole("button", { name: "Priorität von MKT-6: Dringend" })).toBeVisible();
  await page.getByRole("button", { name: /^Zuständig für MKT-6/ }).click();
  await page.getByRole("menuitem", { name: /Lea \(du\)/ }).click();
  await page.getByRole("textbox", { name: "Fälligkeit von MKT-6" }).fill("2030-01-15");

  // Status change moves the ticket to another group and updates the sidebar count.
  await page.getByRole("button", { name: /^Status von MKT-6/ }).click();
  await Promise.all([ticketSaved(page), page.getByRole("menuitem", { name: "Erledigt" }).click()]);
  // Done tickets are hidden in the list until switched on (docs/ONBOARDING.md §4).
  await expect(row(page, "MKT-6")).toHaveCount(0);
  await expect(page.getByText("1 erledigtes Ticket ausgeblendet.")).toBeVisible();
  await page.getByRole("button", { name: "Erledigte anzeigen" }).click();
  await expect(page).toHaveURL(/done=1/);
  await expect(page.getByRole("button", { name: "Status von MKT-6: Erledigt" })).toBeVisible();
  // Everything saved before leaving (the page shows "Speichert …" while requests are in flight).
  await expect(page.getByText("Speichert …")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Marketing 5 offen/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Priorität von MKT-6: Dringend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zuständig für MKT-6: Lea" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Fälligkeit von MKT-6" })).toHaveValue("2030-01-15");
  await expect(page.getByRole("button", { name: "Status von MKT-6: Erledigt" })).toBeVisible();
  expect(path).toBeTruthy();
});

test("rapid successive edits are all saved (no queueing, no loss)", async ({ page }) => {
  await openProject(page, "rapid");
  // Five changes on one ticket without waiting in between.
  await page.getByRole("button", { name: /^Priorität von MKT-1/ }).click();
  await page.getByRole("menuitem", { name: "Dringend" }).click();
  await page.getByRole("button", { name: /^Zuständig für MKT-1/ }).click();
  await page.getByRole("menuitem", { name: /Lea \(du\)/ }).click();
  await page.getByRole("textbox", { name: "Fälligkeit von MKT-1" }).fill("2031-03-01");
  await page.getByRole("button", { name: /^Status von MKT-1/ }).click();
  await page.getByRole("menuitem", { name: "Review" }).click();
  await page.getByRole("button", { name: /^Priorität von MKT-2/ }).click();
  await Promise.all([ticketSaved(page), page.getByRole("menuitem", { name: "Niedrig" }).click()]); // MKT-2 starts as "Mittel"
  await expect(page.getByText("Speichert …")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Priorität von MKT-1: Dringend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zuständig für MKT-1: Lea" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Fälligkeit von MKT-1" })).toHaveValue("2031-03-01");
  await expect(page.getByRole("button", { name: "Status von MKT-1: Review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Priorität von MKT-2: Niedrig" })).toBeVisible();
});

test("ticket write endpoints reject foreign origins (CSRF)", async ({ page }) => {
  await openProject(page, "csrf");
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.method() === "PATCH" && /\/api\/w\/[^/]+\/tickets\/[^/]+$/.test(r.url())),
    (async () => {
      await page.getByRole("button", { name: /^Priorität von MKT-1/ }).click();
      await page.getByRole("menuitem", { name: "Dringend" }).click(); // tutorial ticket MKT-1 starts as "Hoch"
    })(),
  ]);
  const evil = await page.request.patch(request.url(), { headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: { priority: 0 } });
  expect(evil.status()).toBe(403);
  const none = await page.request.patch(request.url(), { headers: { "Content-Type": "application/json" }, data: { priority: 0 } });
  expect(none.status()).toBe(403);
});

test("detail: edit title and description, labels, activity, keyboard navigation", async ({ page }) => {
  await openProject(page, "detail");

  await page.getByRole("button", { name: /^MKT-2 öffnen/ }).click();
  await expect(page).toHaveURL(/\?t=MKT-2$/);
  const title = detail(page).getByRole("textbox", { name: "Titel" });
  await expect(title).toHaveValue("Ändere meinen Status per Klick");

  await title.fill("Newsletter Oktober planen");
  await title.press("Enter");
  await detail(page).getByRole("button", { name: "Beschreibung hinzufügen …" }).click();
  const description = detail(page).getByRole("textbox", { name: "Beschreibung" });
  await description.fill("Themen: Herbstaktion, Messe.");
  await expect(detail(page).getByText("28/5000")).toBeVisible();
  await description.blur();
  await expect(detail(page).getByText("Themen: Herbstaktion, Messe.")).toBeVisible();

  // Labels: create on Enter, shown in the list.
  const labelInput = detail(page).getByRole("combobox", { name: "Label hinzufügen" });
  await labelInput.fill("Newsletter");
  await labelInput.press("Enter");
  await expect(detail(page).getByRole("button", { name: "Label Newsletter entfernen" })).toBeVisible();

  // Activity shows what happened.
  await detail(page).getByRole("tab", { name: "Aktivität" }).click();
  await expect(detail(page).getByText(/hat den Titel geändert in „Newsletter Oktober planen“/)).toBeVisible();
  await expect(detail(page).getByText("hat die Beschreibung geändert")).toBeVisible();
  await expect(detail(page).getByText(/Labels hinzugefügt: Newsletter/)).toBeVisible();

  // ↓ goes to the next ticket in list order, ↑ back.
  await detail(page).getByRole("heading", { name: "Unteraufgaben" }).click();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\?t=MKT-3$/);
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/\?t=MKT-2$/);

  // Esc closes and returns focus to the row.
  await page.keyboard.press("Escape");
  await expect(detail(page)).toBeHidden();
  await expect(page).not.toHaveURL(/\?t=/);
  await expect(page.getByRole("button", { name: /^MKT-2 öffnen/ })).toBeFocused();
  await expect(row(page, "MKT-2")).toContainText("Newsletter Oktober planen");
  await expect(row(page, "MKT-2")).toContainText("Newsletter");

  // A shared link opens the ticket directly.
  await page.goto(page.url() + "?t=MKT-2");
  await expect(detail(page).getByRole("button", { name: "Beschreibung bearbeiten" })).toContainText("Themen: Herbstaktion, Messe.");
});

test("bulk change, grouping and sorting", async ({ page }) => {
  await openProject(page, "bulk");

  await page.getByRole("checkbox", { name: "MKT-2 auswählen" }).check();
  await page.getByRole("checkbox", { name: "MKT-3 auswählen" }).check();
  const bar = page.getByRole("region", { name: "Sammel-Aktionen" });
  await expect(bar).toContainText("2 ausgewählt");
  await bar.getByRole("button", { name: "Priorität ▾" }).click();
  await page.getByRole("menuitem", { name: "Dringend" }).click();
  await expect(page.getByText("2 Tickets geändert.")).toBeVisible();
  await expect(bar).toBeHidden();

  await page.getByRole("combobox", { name: "Gruppieren" }).selectOption("priority");
  await expect(page).toHaveURL(/group=priority/);
  const groupHeaders = await table(page).locator("th[scope=rowgroup]").allInnerTexts();
  // Tutorial tickets: MKT-1 "Hoch", MKT-4/MKT-5 "Mittel".
  expect(groupHeaders.map((h) => h.split("\n")[0])).toEqual(["Dringend", "Hoch", "Mittel"]);
  await expect(table(page).locator("th[scope=rowgroup]").first()).toContainText("2");

  await page.getByRole("combobox", { name: "Gruppieren" }).selectOption("none");
  await page.getByRole("combobox", { name: "Sortieren" }).selectOption("number");
  const keys = await table(page).locator("tbody tr td:nth-child(2)").allInnerTexts();
  expect(keys).toEqual(["MKT-5", "MKT-4", "MKT-3", "MKT-2", "MKT-1"]);

  // Group "select all" + reload keeps the URL view state.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Sortieren" })).toHaveValue("number");
});

test("ticket API is workspace-scoped", async ({ browser }) => {
  const a = await browser.newPage();
  await openProject(a, "apia");
  const [request] = await Promise.all([
    a.waitForRequest((r) => /\/api\/w\/[^/]+\/tickets\/[^/]+\/parts$/.test(r.url())),
    a.getByRole("button", { name: /^MKT-1 öffnen/ }).click(),
  ]);
  const url = request.url();
  expect((await a.request.get(url)).status()).toBe(200);

  const b = await browser.newPage();
  await openProject(b, "apib");
  const foreign = await b.request.get(url);
  expect(foreign.status()).toBe(404);
  expect(await foreign.json()).toEqual({ error: { code: "not_found", message: "Nicht gefunden." } });

  const anonymous = await (await browser.newContext()).request.get(url);
  expect(anonymous.status()).toBe(401);
});

test("on phones the list shows status and priority under the title, without sideways scrolling", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  await openProject(page, "phone");
  const row = page.locator("tr", { has: page.getByText("MKT-1", { exact: true }) });
  await expect(row).toContainText("Offen");
  await expect(row).toContainText("Hoch");
  await expect(page.getByRole("button", { name: /^Status von MKT-1/ })).toBeHidden(); // column hidden, edit in the detail
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const tableBox = await page.getByRole("table", { name: /Tickets in/ }).boundingBox();
  expect(tableBox!.width).toBeLessThanOrEqual(390);

  await row.getByRole("button", { name: /^MKT-1 öffnen/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /^Status/ }).first()).toBeVisible();
  await expect(page.getByText(/nächstes Ticket/)).toBeHidden(); // no keyboard hints on touch screens
});

test("list additions: add in a group, subtasks, columns, new status", async ({ page }) => {
  const path = await openProject(page, "listplus");

  // "+ Ticket hinzufügen" at the end of the "Review" group creates the ticket in that status.
  await page.getByRole("button", { name: /^Neues Ticket in „Review“/ }).click();
  const add = page.getByRole("textbox", { name: /^Neues Ticket in „Review“/ });
  await add.fill("Freigabe einholen");
  await Promise.all([ticketSaved(page), add.press("Enter")]);
  await expect(page.getByRole("button", { name: "Status von MKT-6: Review" })).toBeVisible();

  // Subtasks unfold under their ticket (the tutorial ticket MKT-3 has three).
  // The switch reflects the URL (?subtasks=1), which updates right after the click.
  await page.getByRole("checkbox", { name: "Unteraufgaben anzeigen" }).click();
  await expect(page.getByRole("checkbox", { name: "Unteraufgaben anzeigen" })).toBeChecked();
  await expect(page).toHaveURL(/subtasks=1/);
  await expect(page.getByRole("list", { name: "Unteraufgaben von MKT-3" }).getByRole("listitem")).toHaveCount(3);

  // Columns: comments shown as a column; switching "Fällig" off is remembered per person.
  await expect(table(page).getByRole("columnheader", { name: "Kommentare" })).toBeVisible();
  await page.getByText("Spalten ▾").click();
  await page.getByRole("checkbox", { name: "Fällig" }).uncheck();
  await expect(table(page).getByRole("columnheader", { name: "Fällig" })).toHaveCount(0);
  await expect(page.getByText("Speichert …")).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.goto(`${path}/p/MKT`);
  await expect(table(page).getByRole("columnheader", { name: "Fällig" })).toHaveCount(0);
  await expect(table(page).getByRole("columnheader", { name: "Person" })).toBeVisible();

  // "+ Neuer Status" (admins): goes before the done status and gets its own group.
  await page.getByRole("button", { name: "Neuer Status" }).click();
  await page.getByRole("textbox", { name: "Name des neuen Status" }).fill("Wartet");
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(table(page).locator("th[scope=rowgroup]", { hasText: "Wartet" })).toBeVisible();
  const groups = await table(page).locator("th[scope=rowgroup]").allInnerTexts();
  expect(groups.map((g) => g.split("\n")[0]!.trim())).toEqual(["Offen", "In Arbeit", "Review", "Wartet", "Erledigt"]);
});
