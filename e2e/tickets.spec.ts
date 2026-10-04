import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

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
  await expect(row(page, "MKT-4")).toContainText("Banner für Q4 gestalten");
  await expect(quick).toHaveValue("");

  // New tickets are on top of their status group.
  const firstKey = table(page).locator("tbody").first().locator("tr").nth(1).locator("td").nth(1);
  await expect(firstKey).toHaveText("MKT-4");

  // Inline: priority and assignee.
  await page.getByRole("button", { name: /^Priorität von MKT-4/ }).click();
  await page.getByRole("menuitem", { name: "Dringend" }).click();
  await expect(page.getByRole("button", { name: "Priorität von MKT-4: Dringend" })).toBeVisible();
  await page.getByRole("button", { name: /^Zuständig für MKT-4/ }).click();
  await page.getByRole("menuitem", { name: /Lea \(du\)/ }).click();
  await page.getByRole("textbox", { name: "Fälligkeit von MKT-4" }).fill("2030-01-15");

  // Status change moves the ticket to another group and updates the sidebar count.
  await page.getByRole("button", { name: /^Status von MKT-4/ }).click();
  await page.getByRole("menuitem", { name: "Erledigt" }).click();
  await expect(page.getByRole("button", { name: "Status von MKT-4: Erledigt" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Marketing 3 offen/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Priorität von MKT-4: Dringend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zuständig für MKT-4: Lea" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Fälligkeit von MKT-4" })).toHaveValue("2030-01-15");
  await expect(page.getByRole("button", { name: "Status von MKT-4: Erledigt" })).toBeVisible();
  expect(path).toBeTruthy();
});

test("detail: edit title and description, labels, activity, keyboard navigation", async ({ page }) => {
  await openProject(page, "detail");

  await page.getByRole("button", { name: /^MKT-1 öffnen/ }).click();
  await expect(page).toHaveURL(/\?t=MKT-1$/);
  const title = detail(page).getByRole("textbox", { name: "Titel" });
  await expect(title).toHaveValue("Newsletter für nächsten Monat planen");

  await title.fill("Newsletter Oktober planen");
  await title.press("Enter");
  const description = detail(page).getByRole("textbox", { name: "Beschreibung" });
  await description.fill("Themen: Herbstaktion, Messe.");
  await expect(detail(page).getByText("28/5000")).toBeVisible();
  await description.blur();

  // Labels: create on Enter, shown in the list.
  const labelInput = detail(page).getByRole("combobox", { name: "Label hinzufügen" });
  await labelInput.fill("Newsletter");
  await labelInput.press("Enter");
  await expect(detail(page).getByRole("button", { name: "Label Newsletter entfernen" })).toBeVisible();

  // Activity shows what happened.
  await expect(detail(page).getByText(/hat den Titel geändert in „Newsletter Oktober planen“/)).toBeVisible();
  await expect(detail(page).getByText("hat die Beschreibung geändert")).toBeVisible();
  await expect(detail(page).getByText(/Labels hinzugefügt: Newsletter/)).toBeVisible();

  // ↓ goes to the next ticket in list order, ↑ back.
  await detail(page).getByText("Aktivität", { exact: true }).click();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\?t=MKT-2$/);
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/\?t=MKT-1$/);

  // Esc closes and returns focus to the row.
  await page.keyboard.press("Escape");
  await expect(detail(page)).toBeHidden();
  await expect(page).not.toHaveURL(/\?t=/);
  await expect(page.getByRole("button", { name: /^MKT-1 öffnen/ })).toBeFocused();
  await expect(row(page, "MKT-1")).toContainText("Newsletter Oktober planen");
  await expect(row(page, "MKT-1")).toContainText("Newsletter");

  // A shared link opens the ticket directly.
  await page.goto(page.url() + "?t=MKT-1");
  await expect(detail(page).getByRole("textbox", { name: "Beschreibung" })).toHaveValue("Themen: Herbstaktion, Messe.");
});

test("bulk change, grouping and sorting", async ({ page }) => {
  await openProject(page, "bulk");

  await page.getByRole("checkbox", { name: "MKT-1 auswählen" }).check();
  await page.getByRole("checkbox", { name: "MKT-2 auswählen" }).check();
  const bar = page.getByRole("region", { name: "Sammel-Aktionen" });
  await expect(bar).toContainText("2 ausgewählt");
  await bar.getByRole("button", { name: "Priorität ▾" }).click();
  await page.getByRole("menuitem", { name: "Hoch" }).click();
  await expect(page.getByText("2 Tickets geändert.")).toBeVisible();
  await expect(bar).toBeHidden();

  await page.getByRole("combobox", { name: "Gruppieren" }).selectOption("priority");
  await expect(page).toHaveURL(/group=priority/);
  const groupHeaders = await table(page).locator("th[scope=rowgroup]").allInnerTexts();
  expect(groupHeaders.map((h) => h.split("\n")[0])).toEqual(["Hoch"]);
  await expect(table(page).locator("th[scope=rowgroup]").first()).toContainText("3"); // MKT-3 was already "Hoch"

  await page.getByRole("combobox", { name: "Gruppieren" }).selectOption("none");
  await page.getByRole("combobox", { name: "Sortieren" }).selectOption("number");
  const keys = await table(page).locator("tbody tr td:nth-child(2)").allInnerTexts();
  expect(keys).toEqual(["MKT-3", "MKT-2", "MKT-1"]);

  // Group "select all" + reload keeps the URL view state.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Sortieren" })).toHaveValue("number");
});

test("ticket API is workspace-scoped", async ({ browser }) => {
  const a = await browser.newPage();
  await openProject(a, "apia");
  const [request] = await Promise.all([
    a.waitForRequest((r) => /\/api\/w\/[^/]+\/tickets\/[^/]+\/activity$/.test(r.url())),
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
