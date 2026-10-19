import { expect, test } from "@playwright/test";
import {
  completeJoinerWizard,
  confirmRegistration,
  createWorkspace,
  E2E_PASSWORD,
  INVITE_LINK,
  mailCount,
  mailText,
  NO_ACCOUNT_LINK,
  ONBOARDING_URL,
  linkFromMail,
  openMagicLink,
  REGISTER_LINK,
  registerAccount,
  requestMagicLink,
  signIn,
  uniqueDomain,
} from "./helpers/auth";
import { userCount } from "./helpers/db";

test("freemail addresses are rejected with a friendly message", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill("max@gmail.com");
  await page.getByRole("button", { name: "Ohne Passwort per Link anmelden" }).click();
  await expect(page.getByText(/Bitte nutze deine Firmen-E-Mail-Adresse/)).toBeVisible();
});

test("first user creates a workspace with the template project", async ({ page }) => {
  const domain = uniqueDomain("onboard");
  await createWorkspace(page, `lea.owner@${domain}`, "Onboard GmbH");
  await expect(page.getByRole("heading", { name: /Marketing/ })).toBeVisible();
  await expect(page.getByText("MKT-1", { exact: true })).toBeVisible();
  await expect(page.getByText("MKT-5", { exact: true })).toBeVisible();
});

test("a link for an address without an account creates nothing: same screen, a mail pointing to the registration", async ({ page }) => {
  const email = `niemand@${uniqueDomain("noaccount")}`;
  const since = new Date(Date.now() - 1000);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByRole("button", { name: "Ohne Passwort per Link anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();

  const text = await mailText(email, since);
  expect(text).toContain("Für diese Adresse gibt es aber noch kein Konto");
  expect(text).not.toMatch(/\/login\/link|magic-link/);
  const link = text.match(NO_ACCOUNT_LINK)?.[0];
  expect(link).toBeTruthy();
  expect(await userCount(email)).toBe(0);

  // Asking again shows the same screen, but no second mail (one per address and 15 minutes).
  await page.getByRole("button", { name: "Andere Adresse verwenden" }).click();
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByRole("button", { name: "Ohne Passwort per Link anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(await mailCount(email, since)).toBe(1);
  expect(await userCount(email)).toBe(0);

  // The mail's link opens the registration with the address filled in.
  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "Konto erstellen" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Firmen-E-Mail" })).toHaveValue(email);
});

test("a used magic link cannot be used again", async ({ page, context }) => {
  const domain = uniqueDomain("reuse");
  await registerAccount(page, `paul@${domain}`);
  await context.clearCookies();
  const link = await signIn(page, `paul@${domain}`);
  await expect(page).toHaveURL(ONBOARDING_URL);
  await context.clearCookies();
  // Opening the link alone (as a mail scanner does) consumes nothing; the confirm click would.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Anmeldung bestätigen" })).toBeVisible();
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await expect(page.getByText(/abgelaufen oder wurde schon benutzt/)).toBeVisible();
});

test("a mail scanner opening the link first does not use it up", async ({ page, request }) => {
  const email = `scan@${uniqueDomain("scan")}`;
  await registerAccount(page, email);
  await page.context().clearCookies();
  const link = await requestMagicLink(page, email);
  // What scanners and link previews do: fetch the address from the mail, follow redirects.
  expect((await request.get(link)).ok()).toBe(true);
  await openMagicLink(page, link);
  await expect(page).toHaveURL(ONBOARDING_URL);
});

test("an invited colleague joins via the invitation link", async ({ browser }) => {
  const domain = uniqueDomain("invite");
  const owner = await browser.newPage();
  const since = new Date(Date.now() - 1000);
  const path = await createWorkspace(owner, `owner@${domain}`, "Invite AG", `kollege@${domain}`);

  const colleague = await browser.newPage();
  const invite = await linkFromMail(`kollege@${domain}`, INVITE_LINK, since);
  await colleague.goto(invite);
  await expect(colleague.getByRole("heading", { name: "Einladung zu Invite AG" })).toBeVisible();
  // No account yet: register from the invitation (address prefilled) and land back on it.
  await colleague.getByRole("link", { name: "Registrieren und annehmen" }).click();
  await expect(colleague).toHaveURL(/\/register\?/);
  await expect(colleague.getByRole("textbox", { name: "Firmen-E-Mail" })).toHaveValue(`kollege@${domain}`);
  const registered = new Date(Date.now() - 1000);
  await colleague.getByRole("textbox", { name: "Name" }).fill("Karl Kollege");
  await colleague.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await colleague.getByLabel("Passwort wiederholen").fill(E2E_PASSWORD);
  await colleague.getByRole("button", { name: "Registrieren" }).click();
  await expect(colleague.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  await confirmRegistration(colleague, await linkFromMail(`kollege@${domain}`, REGISTER_LINK, registered));
  await expect(colleague).toHaveURL(new RegExp(`${new URL(invite).pathname}$`));
  await colleague.getByRole("button", { name: "Annehmen" }).click();
  await completeJoinerWizard(colleague);
  await expect(colleague).toHaveURL(new RegExp(`${path}/me$`));
  await colleague.goto(path);
  await expect(colleague.getByRole("heading", { name: "Willkommen bei Invite AG" })).toBeVisible();
  // Members cannot see the admin-only members page link.
  await expect(colleague.getByRole("link", { name: "Mitglieder" })).toHaveCount(0);
});

test("same-domain colleague without invitation must ask for one (auto-join is off)", async ({ browser }) => {
  const domain = uniqueDomain("nojoin");
  await createWorkspace(await browser.newPage(), `chefin@${domain}`, "Nojoin KG");

  const page = await browser.newPage();
  await signIn(page, `neu@${domain}`);
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.getByText(/Bitte jemanden aus deinem Team, dich einzuladen/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Beitreten" })).toHaveCount(0);
});

test("two workspaces cannot see each other's data", async ({ browser }) => {
  const a = await browser.newPage();
  const pathA = await createWorkspace(a, `anna@${uniqueDomain("tenant-a")}`, "Tenant A");

  const b = await browser.newPage();
  const pathB = await createWorkspace(b, `ben@${uniqueDomain("tenant-b")}`, "Tenant B");

  const res = await b.goto(pathA);
  expect(res?.status()).toBe(404);
  await expect(b.getByText("Tenant A")).toHaveCount(0);

  const resA = await a.goto(pathB);
  expect(resA?.status()).toBe(404);
});
