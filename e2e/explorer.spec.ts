import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Seitenleiste" });

/** Resolves when a server action whose payload contains `field` has answered (prefs are saved fire-and-forget). */
const saved = (page: Page, field: string) =>
  page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined && (r.request().postData() ?? "").includes(field),
  );

async function newProject(page: Page, name: string, opts: { key?: string } = {}) {
  await sidebar(page).getByRole("button", { name: "Neues Projekt" }).click();
  const dialog = page.getByRole("dialog", { name: "Neues Projekt" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  if (opts.key) await dialog.getByRole("textbox", { name: "Kürzel" }).fill(opts.key);
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("projects, folders, favorites and collapse persist", async ({ page }) => {
  const path = await createWorkspace(page, `lea@${uniqueDomain("explorer")}`, "Explorer GmbH");

  // Key is suggested from the name.
  await sidebar(page).getByRole("button", { name: "Neues Projekt" }).click();
  const dialog = page.getByRole("dialog", { name: "Neues Projekt" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Social Media");
  await expect(dialog.getByRole("textbox", { name: "Kürzel" })).toHaveValue("SM");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}/p/SM$`));
  await expect(page.getByRole("navigation", { name: "Pfad" })).toContainText("Social Media");

  // Folder + move via menu.
  await sidebar(page).getByRole("button", { name: "Neuer Ordner" }).click();
  await page.getByRole("dialog", { name: "Neuer Ordner" }).getByRole("textbox", { name: "Name des Ordners" }).fill("Kommunikation");
  await page.getByRole("dialog", { name: "Neuer Ordner" }).getByRole("button", { name: "Anlegen" }).click();
  const folderToggle = sidebar(page).getByRole("button", { name: "Kommunikation", exact: true });
  await expect(folderToggle).toHaveAttribute("aria-expanded", "true");

  await sidebar(page).getByRole("button", { name: "Aktionen für Social Media" }).click();
  await page.getByRole("menuitem", { name: "Nach „Kommunikation“ verschieben" }).click();
  const folderList = sidebar(page).locator("ul[id^='folder-']");
  await expect(folderList.getByRole("link", { name: "Social Media" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pfad" })).toContainText("Kommunikation");

  // Favorite.
  await sidebar(page).getByRole("button", { name: "Aktionen für Marketing" }).click();
  await Promise.all([saved(page, "favorites"), page.getByRole("menuitem", { name: "Zu Favoriten" }).click()]);
  await expect(sidebar(page).getByRole("region", { name: "Favoriten" }).getByRole("link", { name: /Marketing/ })).toBeVisible();

  // Collapse folder, then reload – everything persisted.
  await Promise.all([saved(page, "expandedFolders"), folderToggle.click()]);
  await expect(folderToggle).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(sidebar(page).getByRole("button", { name: "Kommunikation", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(sidebar(page).getByRole("region", { name: "Favoriten" })).toBeVisible();
  await Promise.all([saved(page, "expandedFolders"), sidebar(page).getByRole("button", { name: "Kommunikation", exact: true }).click()]);
  await expect(sidebar(page).locator("ul[id^='folder-']").getByRole("link", { name: "Social Media" })).toBeVisible();

  // Cmd/Ctrl+B collapses the sidebar and the state survives a reload.
  await Promise.all([saved(page, "sidebarCollapsed"), page.keyboard.press("ControlOrMeta+b")]);
  await expect(sidebar(page).getByRole("button", { name: "Seitenleiste ausklappen" })).toBeVisible();
  await page.reload();
  await expect(sidebar(page).getByRole("button", { name: "Seitenleiste ausklappen" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+b");
  await expect(sidebar(page).getByRole("button", { name: "Einklappen" })).toBeVisible();
});

test("projects can be reordered with the keyboard", async ({ page }) => {
  await createWorkspace(page, `kim@${uniqueDomain("dnd")}`, "Dnd AG");
  await newProject(page, "Zweites", { key: "ZWO" });
  const links = () => sidebar(page).locator("section[aria-labelledby='projects-heading'] a").allInnerTexts();
  await expect.poll(links).toEqual(["📣\nMarketing\n3", "Zweites"]);

  const handle = sidebar(page).getByRole("button", { name: "Zweites verschieben" });
  await handle.focus();
  // dnd-kit measures positions between key presses; give it a frame or two.
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(200);
  await Promise.all([saved(page, "projectId"), page.keyboard.press("Space")]);
  await expect.poll(links).toEqual(["Zweites", "📣\nMarketing\n3"]);
  await page.reload();
  await expect.poll(links).toEqual(["Zweites", "📣\nMarketing\n3"]);
});

test("project settings: rename, statuses, archive with undo", async ({ page }) => {
  const path = await createWorkspace(page, `ole@${uniqueDomain("settings")}`, "Settings KG");
  await page.goto(`${path}/p/MKT/settings`);

  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Marketing & PR");
  await page.getByRole("button", { name: "Speichern" }).first().click();
  await expect(page.getByText("Gespeichert.").first()).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: /Marketing & PR/ })).toBeVisible();

  // Add a status: it goes before "Erledigt".
  const statuses = page.getByRole("region", { name: "Status" });
  await statuses.getByRole("textbox", { name: "Name des Status" }).last().fill("Wartet");
  await statuses.getByRole("button", { name: "Status hinzufügen" }).click();
  const rows = statuses.locator("ol > li");
  await expect(rows).toHaveCount(5);
  const names = await rows.getByRole("textbox", { name: "Name des Status" }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(names).toEqual(["Offen", "In Arbeit", "Review", "Wartet", "Erledigt"]);

  // "Offen" holds the 3 example tickets → deleting moves them.
  await statuses.getByRole("combobox", { name: "Tickets verschieben nach" }).first().selectOption({ label: "In Arbeit" });
  await statuses.getByRole("button", { name: "Status Offen löschen" }).click();
  await expect(rows).toHaveCount(4);
  await expect(rows.first().getByText("3 Tickets")).toBeVisible();

  // The last "done" status cannot be deleted.
  await statuses.getByRole("button", { name: "Status Erledigt löschen" }).click();
  await expect(statuses.getByText(/mindestens einen Status der Art „Erledigt“/)).toBeVisible();

  // Archive from the sidebar menu, then undo.
  await sidebar(page).getByRole("button", { name: "Aktionen für Marketing & PR" }).click();
  await page.getByRole("menuitem", { name: "Archivieren" }).click();
  await expect(sidebar(page).getByRole("link", { name: /Marketing & PR/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("„Marketing & PR“ archiviert.")).toBeHidden();
  await expect(sidebar(page).getByRole("link", { name: /Marketing & PR/ })).toBeVisible();

  // Archive again, restore from the overview.
  await sidebar(page).getByRole("button", { name: "Aktionen für Marketing & PR" }).click();
  await page.getByRole("menuitem", { name: "Archivieren" }).click();
  await expect(sidebar(page).getByRole("link", { name: /Marketing & PR/ })).toHaveCount(0);
  await expect(page.getByText("„Marketing & PR“ archiviert.")).toBeVisible();
  await page.goto(path);
  await page.getByRole("button", { name: "Marketing & PR wiederherstellen" }).click();
  await expect(sidebar(page).getByRole("link", { name: /Marketing & PR/ })).toBeVisible();
});

test("on mobile the sidebar opens as a drawer", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await createWorkspace(page, `mo@${uniqueDomain("mobile")}`, "Mobil GmbH");
  await expect(sidebar(page)).toBeHidden();
  await page.getByRole("button", { name: "Menü öffnen" }).click();
  const drawer = page.getByRole("dialog", { name: "Seitenleiste" });
  await expect(drawer.getByRole("link", { name: /Marketing/ })).toBeVisible();
  await drawer.getByRole("link", { name: /Marketing/ }).click();
  await expect(page).toHaveURL(/\/p\/MKT$/);
  await expect(drawer).toBeHidden();
});

test("main pages render without console errors (e.g. hydration mismatches)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const path = await createWorkspace(page, `clean@${uniqueDomain("console")}`, "Console GmbH");
  for (const sub of ["", "/p/MKT", "/p/MKT/settings", "/settings/members"]) {
    await page.goto(path + sub);
    await expect(page.getByRole("main")).toBeVisible();
    await waitForHydration(page.getByRole("button", { name: /^Konto von/ }));
  }
  expect(errors).toEqual([]);
});
