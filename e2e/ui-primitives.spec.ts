import { expect, test } from "@playwright/test";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "inhouseticket" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test.describe("UI primitives preview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
  });

  test("dropdown works with the keyboard only", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Priorität ▾" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Dringend" })).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown"); // skips disabled "Mittel"
    await expect(page.getByRole("menuitem", { name: "Niedrig" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("h"); // typeahead
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Priorität: Hoch" })).toBeVisible();
  });

  test("error toast offers a retry and stays until dismissed", async ({ page }) => {
    await page.getByRole("button", { name: "Fehler" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Status konnte nicht geändert werden." });
    await expect(alert).toContainText("Status konnte nicht geändert werden.");
    await alert.getByRole("button", { name: "Erneut versuchen" }).click();
    await expect(alert).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "Erneut gesendet" })).toBeVisible();
  });

  test("tooltip appears on keyboard focus and hides on Escape", async ({ page }) => {
    const button = page.getByRole("button", { name: "+ Ticket" });
    await button.focus();
    await expect(page.getByRole("tooltip", { name: "Neues Ticket (C)" })).toBeVisible();
    await expect(button).toHaveAccessibleDescription("Neues Ticket (C)");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toBeHidden();
  });

  test("title input shows a live counter", async ({ page }) => {
    const input = page.getByRole("textbox", { name: "Titel" });
    await input.fill("Banner Q4");
    await expect(page.getByText("9/500")).toBeVisible();
  });

  test("dark mode follows the OS setting", async ({ page }) => {
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await bg()).toBe("rgb(250, 250, 249)");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await bg()).toBe("rgb(14, 14, 17)");
  });
});
