import { expect, test } from "@playwright/test";
import { createWorkspace, INVITE_LINK, linkFromMail, openMagicLink, requestMagicLink, signIn, uniqueDomain } from "./helpers/auth";

test("freemail addresses are rejected with a friendly message", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill("max@gmail.com");
  await page.getByRole("button", { name: "Anmeldelink per E-Mail senden" }).click();
  await expect(page.getByText(/Bitte nutze deine Firmen-E-Mail-Adresse/)).toBeVisible();
});

test("first user creates a workspace with an example project", async ({ page }) => {
  const domain = uniqueDomain("onboard");
  await createWorkspace(page, `lea.owner@${domain}`, "Onboard GmbH");
  await expect(page.getByRole("heading", { name: /Marketing/ })).toBeVisible();
  await expect(page.getByText("MKT-1", { exact: true })).toBeVisible();
  await expect(page.getByText("MKT-3", { exact: true })).toBeVisible();
});

test("a used magic link cannot be used again", async ({ page, context }) => {
  const domain = uniqueDomain("reuse");
  const link = await signIn(page, `paul@${domain}`);
  await expect(page).toHaveURL(/\/onboarding$/);
  await context.clearCookies();
  // Opening the link alone (as a mail scanner does) consumes nothing; the confirm click would.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Anmeldung bestätigen" })).toBeVisible();
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await expect(page.getByText(/abgelaufen oder wurde schon benutzt/)).toBeVisible();
});

test("a mail scanner opening the link first does not use it up", async ({ page, request }) => {
  const email = `scan@${uniqueDomain("scan")}`;
  const link = await requestMagicLink(page, email);
  // What scanners and link previews do: fetch the address from the mail, follow redirects.
  expect((await request.get(link)).ok()).toBe(true);
  await openMagicLink(page, link);
  await expect(page).toHaveURL(/\/set-password/);
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
  await colleague.getByRole("link", { name: "Anmelden und annehmen" }).click();
  await signIn(colleague, `kollege@${domain}`, new URL(invite).pathname);
  await colleague.getByRole("button", { name: "Annehmen" }).click();
  await expect(colleague).toHaveURL(new RegExp(`${path}$`));
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
