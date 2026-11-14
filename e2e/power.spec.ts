import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";
import { ticketSaved } from "./helpers/saved";

async function openProject(page: Page, label: string) {
  const path = await createWorkspace(page, `lea.becker@${uniqueDomain(label)}`, `${label} GmbH`);
  await page.goto(`${path}/p/MKT`);
  await waitForHydration(page.getByRole("textbox", { name: /Neues Ticket/ }));
  return path;
}

const berlinDate = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
};

test("command palette: search tickets by text and key, run actions", async ({ page }) => {
  await openProject(page, "palette");
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("combobox", { name: "Suchen oder Befehl eingeben" })).toBeVisible({ timeout: 500 });
  }).toPass();
  const input = page.getByRole("combobox", { name: "Suchen oder Befehl eingeben" });
  await input.fill("newsletter");
  await expect(page.getByRole("option", { name: /Newsletter November planen/ })).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/\?t=MKT-5$/);
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Titel" })).toHaveValue("Newsletter November planen");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // "/" opens the palette as search; exact key.
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  await input.fill("mkt-2");
  await expect(page.getByRole("option", { name: /Ändere meinen Status per Klick/ })).toBeVisible();
  await input.fill("meine auf");
  await page.getByRole("option", { name: /Meine Aufgaben/ }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByRole("heading", { level: 1, name: "Meine Aufgaben" })).toBeVisible();

  // "?" shows the shortcut help.
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Tastenkürzel" })).toBeVisible();
});

test("quick add understands @person !prio ^date", async ({ page }) => {
  await openProject(page, "quickparse");
  const quick = page.getByRole("textbox", { name: /Neues Ticket/ });
  await quick.fill("Messe planen @lea !dringend ^morgen");
  await expect(page.getByText("Person: Lea Becker")).toBeVisible();
  await expect(page.getByText("Priorität: Dringend")).toBeVisible();
  await quick.press("Enter");
  const row = page.locator("tr", { has: page.getByText("MKT-6", { exact: true }) });
  await expect(row).toContainText("Messe planen");
  await expect(page.getByRole("button", { name: "Priorität von MKT-6: Dringend" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zuständig für MKT-6: Lea Becker" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Fälligkeit von MKT-6" })).toHaveValue(berlinDate(1));
});

test("ticket shortcuts 1–4/0 and A in the detail panel", async ({ page }) => {
  const path = await openProject(page, "keys");
  await page.goto(`${path}/p/MKT?t=MKT-2`);
  const dialog = page.getByRole("dialog");
  await waitForHydration(dialog.getByRole("textbox", { name: "Titel" }));
  await dialog.getByRole("heading", { name: "Checkliste" }).click();
  await page.keyboard.press("1");
  await expect(dialog.getByRole("button", { name: /^Priorität von MKT-2: Dringend/ })).toBeVisible();
  await page.keyboard.press("0");
  await expect(dialog.getByRole("button", { name: /^Priorität von MKT-2: Keine/ })).toBeVisible();
  await page.keyboard.press("a");
  await expect(page.getByRole("menuitem", { name: /Lea Becker \(du\)/ })).toBeVisible();
});

test("my tasks across projects, grouped by due date", async ({ page }) => {
  await openProject(page, "mytasks");
  for (const [key, date] of [["MKT-1", berlinDate(-2)], ["MKT-2", berlinDate(0)]] as const) {
    await page.getByRole("button", { name: new RegExp(`^Zuständig für ${key}`) }).click();
    await page.getByRole("menuitem", { name: /Lea Becker \(du\)/ }).click();
    await Promise.all([ticketSaved(page), page.getByRole("textbox", { name: `Fälligkeit von ${key}` }).fill(date)]);
  }
  await expect(page.getByText("Speichert …")).toHaveCount(0);
  await page.getByRole("link", { name: "Meine Aufgaben" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Überfällig/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /Überfällig/ })).toContainText("MKT-1");
  await expect(page.getByRole("region", { name: /Heute/ })).toContainText("MKT-2");
  await expect(page.getByText("MKT-3")).toHaveCount(0);
  await page.getByRole("link", { name: /MKT-2/ }).click();
  await expect(page).toHaveURL(/\/p\/MKT\?t=MKT-2$/);
});

test("filters and saved views", async ({ page }) => {
  await openProject(page, "filters");
  const rows = page.locator("tr[data-ticket-row]");
  await expect(rows).toHaveCount(5); // the tutorial tickets

  // Filters sit in the panel behind "Filter" (closed while nothing is filtered and no view is saved).
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Priorität", exact: true }).click();
  await page.getByRole("menuitem", { name: "Hoch" }).click();
  await expect(page).toHaveURL(/priority=3/);
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("1 von 5 Tickets")).toBeVisible();

  await page.getByRole("button", { name: "Ansicht speichern", exact: true }).click();
  await page.getByRole("textbox", { name: "Name der Ansicht" }).fill("Wichtig");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Ansicht „Wichtig“ gespeichert.")).toBeVisible();

  await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
  await expect(rows).toHaveCount(5);
  await page.getByRole("searchbox", { name: "Tickets filtern" }).fill("newsletter");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("MKT-5");

  await page.reload();
  await page.getByRole("button", { name: "Wichtig", exact: true }).click();
  await expect(page.getByRole("button", { name: "Wichtig", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("MKT-1");

  await page.getByRole("button", { name: "Ansicht Wichtig löschen" }).click();
  await expect(page.getByRole("button", { name: "Wichtig", exact: true })).toHaveCount(0);
});
