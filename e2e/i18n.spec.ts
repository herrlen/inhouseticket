import { expect, test } from "@playwright/test";
import { linkFromMail, MAGIC_LINK, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

test("landing page switches to English and back, by keyboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  const en = page.getByRole("button", { name: /^EN/ });
  await expect(en).toHaveAttribute("aria-pressed", "false");
  await waitForHydration(en);
  await en.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tickets for your team – fast, simple, free.");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: /^EN/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();

  // The choice is a cookie: it survives a reload, without any redirect.
  await page.reload();
  await expect(page).toHaveURL("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.getByRole("button", { name: /^DE/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tickets für dein Team – schnell, schlicht, kostenlos.");
});

test("legal pages stay German with an English note", async ({ page, context }) => {
  await context.addCookies([{ name: "lang", value: "en", url: "http://localhost:3100" }]);
  await page.goto("/impressum");
  await expect(page.getByRole("note")).toHaveText(/German version is the legally binding one/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Impressum");
});

test("the app works in English", async ({ page, context }) => {
  await context.addCookies([{ name: "lang", value: "en", url: "http://localhost:3100" }]);
  const email = `lea@${uniqueDomain("english")}`;
  const since = new Date(Date.now() - 1000);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Company email" }).fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await page.goto(await linkFromMail(email, MAGIC_LINK, since));

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("textbox", { name: "Workspace name" }).fill("English Ltd");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to English Ltd" })).toBeVisible();

  // Sample project and default statuses are created in English.
  await page.getByRole("link", { name: /Marketing/ }).first().click();
  await expect(page.getByText("Plan next month's newsletter")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Status of MKT-1: Open/ })).toBeVisible();

  const quickAdd = page.getByRole("textbox", { name: "New ticket – type a title and press Enter" });
  await waitForHydration(quickAdd);
  await quickAdd.fill("Ship it !high ^tomorrow");
  await expect(page.getByText("Priority: High")).toBeVisible();
  await quickAdd.press("Enter");
  await expect(page.getByText("Ship it")).toBeVisible();

  // Back to German from the app header.
  await page.getByRole("button", { name: /^DE/ }).click();
  await expect(page.getByRole("textbox", { name: "Neues Ticket – Titel eingeben und Enter drücken" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});
