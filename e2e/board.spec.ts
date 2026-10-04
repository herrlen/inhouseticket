import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

const column = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name, exact: true }) });
const card = (page: Page, key: string) => page.locator("[data-card]").filter({ hasText: key });

async function openBoard(page: Page, label: string) {
  const path = await createWorkspace(page, `kim@${uniqueDomain(label)}`, `${label} GmbH`);
  await page.goto(`${path}/p/MKT`);
  await waitForHydration(page.getByRole("textbox", { name: /Neues Ticket/ }));
  await expect(async () => {
    await page.keyboard.press("b");
    await expect(page).toHaveURL(/view=board/, { timeout: 300 });
  }).toPass();
  await expect(column(page, "Offen")).toBeVisible();
  return path;
}

test("board shows columns and moves cards with the keyboard and the mouse", async ({ page }) => {
  const path = await openBoard(page, "board");
  await expect(column(page, "Offen").getByText("MKT-1")).toBeVisible();
  await expect(column(page, "Offen")).toContainText("3");

  // Keyboard: Space picks up, → jumps to the next column, Space drops.
  await card(page, "MKT-1").focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined),
    page.keyboard.press("Space"),
  ]);
  await expect(column(page, "In Arbeit").getByText("MKT-1")).toBeVisible();
  await page.waitForLoadState("load");

  // Mouse: drag MKT-2 into "Erledigt". The board scrolls horizontally, so aim at the visible part.
  const from = await card(page, "MKT-2").boundingBox();
  const to = await column(page, "Erledigt").boundingBox();
  const viewport = page.viewportSize()!;
  await page.mouse.move(from!.x + 20, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(from!.x + 40, from!.y + 30, { steps: 5 });
  await page.mouse.move(Math.min(to!.x + 40, viewport.width - 10), to!.y + 120, { steps: 15 });
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined),
    page.mouse.up(),
  ]);
  await expect(column(page, "Erledigt").getByText("MKT-2")).toBeVisible();

  await page.reload();
  await expect(column(page, "In Arbeit").getByText("MKT-1")).toBeVisible();
  await expect(column(page, "Erledigt").getByText("MKT-2")).toBeVisible();
  await expect(page.getByRole("link", { name: /Marketing 2 offen/ })).toBeVisible();
  expect(path).toBeTruthy();
});

test("quick add in a column, Enter opens the detail, L returns to the list", async ({ page }) => {
  await openBoard(page, "colquick");
  await column(page, "Review").getByRole("button", { name: "Neues Ticket in Review" }).click();
  const input = page.getByRole("textbox", { name: "Neues Ticket in Review" });
  await input.fill("Freigabe Kampagne einholen");
  await input.press("Enter");
  await expect(column(page, "Review").getByText("MKT-4")).toBeVisible();

  await card(page, "MKT-4").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Titel" })).toHaveValue("Freigabe Kampagne einholen");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(card(page, "MKT-4")).toBeFocused();

  await page.keyboard.press("l");
  await expect(page).not.toHaveURL(/view=board/);
  await expect(page.getByRole("table", { name: /Tickets in/ })).toBeVisible();
});

test("WIP limit warns when exceeded; confetti can be switched off", async ({ page }) => {
  const path = await openBoard(page, "wip");
  await page.goto(`${path}/p/MKT/settings`);
  const statuses = page.getByRole("region", { name: "Status" });
  const offenRow = statuses.locator("ol > li").first();
  await offenRow.getByRole("spinbutton").fill("2");
  await offenRow.getByRole("button", { name: "Speichern" }).click();
  await expect(offenRow.getByText("Gespeichert.")).toBeVisible();

  await page.goto(`${path}/p/MKT?view=board`);
  await expect(column(page, "Offen")).toContainText("3/2");
  await expect(column(page, "Offen").getByRole("status")).toHaveText("WIP-Limit von 2 überschritten");

  await page.getByRole("button", { name: /^Konto von/ }).click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes("confetti")),
    page.getByRole("menuitem", { name: "Konfetti ausschalten" }).click(),
  ]);
  await page.reload();
  await page.getByRole("button", { name: /^Konto von/ }).click();
  await expect(page.getByRole("menuitem", { name: "Konfetti einschalten" })).toBeVisible();
});
