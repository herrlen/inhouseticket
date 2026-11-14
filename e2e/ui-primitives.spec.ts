import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers/hydration";

test("landing page: claim, screenshots, start and Claude section", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Tickets für dein Team/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("img", { name: /Listenansicht eines Projekts/ })).toBeVisible();
  await page.getByRole("link", { name: "Mit Claude arbeiten" }).click();
  await expect(page.getByRole("heading", { name: "Frag einfach." })).toBeInViewport();
  await page.getByRole("link", { name: "Kostenlos starten" }).first().click();
  await expect(page).toHaveURL(/\/register$/);
});

test.describe("UI primitives preview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
    // Handlers exist only after hydration; under load that can take a moment.
    await waitForHydration(page.getByRole("button", { name: "Priorität ▾" }));
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
    expect(await bg()).toBe("rgb(250, 247, 243)");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await bg()).toBe("rgb(35, 29, 25)");
  });
});

test("closed beta: search engines stay out, link preview image exists", async ({ request, page }) => {
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("<loc>");
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
});
