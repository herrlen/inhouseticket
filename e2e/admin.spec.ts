import { expect, test, type Page } from "@playwright/test";
import { completeOwnerWizard, createWorkspace, signIn, uniqueDomain } from "./helpers/auth";

// Platform operator (SUPERADMIN_EMAILS in .env / CI): freemail exception, personal workspace, /admin.
const OPERATOR = "e2e-operator@gmail.com";

async function signInOperator(page: Page) {
  await signIn(page, OPERATOR);
  // /start only redirects onward (to onboarding or the workspace); don't mistake it for a slug.
  await page.waitForURL((url) => /^\/(onboarding|[a-z0-9-]+)$/.test(url.pathname) && url.pathname !== "/start");
  if (new URL(page.url()).pathname === "/onboarding") {
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.getByText(/Persönlicher Workspace/)).toBeVisible();
    // No company domain → no auto-join switch.
    await expect(page.getByRole("checkbox", { name: /dürfen beitreten/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Zurück" }).click();
    await completeOwnerWizard(page, "Operator");
    await page.goto(`/${new URL(page.url()).pathname.split("/")[1]}`);
    await expect(page.getByRole("heading", { name: "Willkommen bei Operator" })).toBeVisible();
  }
}

test("operator signs in with freemail, others with the same provider stay out", async ({ page, browser }) => {
  await signInOperator(page);
  // Personal workspace: no auto-join by domain on the members page.
  await page.goto(new URL(page.url()).pathname + "/settings/members");
  await expect(page.getByRole("heading", { name: /Mitglieder/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /automatisch beitreten/i })).toHaveCount(0);

  const other = await browser.newPage();
  await other.goto("/login");
  await other.getByRole("textbox", { name: "Firmen-E-Mail" }).fill("someone-else@gmail.com");
  await other.getByRole("button", { name: "Ohne Passwort per Link anmelden" }).click();
  await expect(other.getByText(/Firmen-E-Mail/).last()).toBeVisible();
  await expect(other.getByRole("heading", { name: "Schau in dein Postfach" })).toHaveCount(0);
});

test("/admin: metrics only, lock and delete a workspace; hidden from everyone else", async ({ page, browser }) => {
  const customer = await browser.newPage();
  const path = await createWorkspace(customer, `kai@${uniqueDomain("kunde")}`, "Kunde GmbH");
  const slug = path.slice(1);
  // Customers do not even learn that /admin exists – and signed-out visitors get no login redirect.
  expect((await customer.goto("/admin"))?.status()).toBe(404);
  const anonymous = await (await browser.newContext()).newPage();
  const res = await anonymous.goto("/admin");
  expect(res?.status()).toBe(404);
  expect(new URL(anonymous.url()).pathname).toBe("/admin");

  await signInOperator(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Betreiber-Übersicht" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Workspaces durchsuchen" }).fill(slug);
  await page.getByRole("button", { name: "Suchen" }).click();
  await expect(page.getByText("1 Workspace", { exact: true })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`/${slug}`) });
  await expect(row).toContainText("Kunde GmbH");
  await expect(row).toContainText(`kai@`);
  await expect(row).toContainText("5 (5)"); // tutorial tickets, counts only
  await expect(page.getByText("Newsletter November planen")).toHaveCount(0); // no ticket content

  // Lock → the customer is shut out, unlock → back in.
  await row.getByRole("button", { name: "Kunde GmbH sperren" }).click();
  await expect(row.getByText("gesperrt")).toBeVisible();
  expect((await customer.goto(path))?.status()).toBe(404);
  await row.getByRole("button", { name: "Kunde GmbH entsperren" }).click();
  await expect(row.getByText("gesperrt")).toHaveCount(0);
  expect((await customer.goto(path))?.status()).toBe(200);

  // Delete needs the exact slug.
  await row.getByText("Löschen …").click();
  await row.getByRole("textbox", { name: "Kürzel von Kunde GmbH zur Bestätigung" }).fill("falsch");
  await row.getByRole("button", { name: "Kunde GmbH endgültig löschen" }).click();
  await expect(page.getByText("Das Kürzel stimmt nicht – nichts gelöscht.")).toBeVisible();
  const again = page.getByRole("row", { name: new RegExp(`/${slug}`) });
  await again.getByText("Löschen …").click();
  await again.getByRole("textbox", { name: "Kürzel von Kunde GmbH zur Bestätigung" }).fill(slug);
  await again.getByRole("button", { name: "Kunde GmbH endgültig löschen" }).click();
  await expect(page.getByText("Workspace gelöscht.")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`/${slug}`) })).toHaveCount(0);
});
