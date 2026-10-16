import { expect, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

type MailpitMessage = { ID: string; Created: string };

/** Waits for the newest mail to `to` (after `since`) and returns the first link matching `pattern`. */
export async function linkFromMail(to: string, pattern: RegExp, since: Date): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: MailpitMessage[] };
    const fresh = messages.find((m) => new Date(m.Created) >= since);
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text: string };
      const link = msg.Text.match(pattern)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No mail for ${to} matching ${pattern}`);
}

export const MAGIC_LINK = /http:\/\/localhost:3100\/login\/link\?\S+/;

/** Opens the link from the sign-in mail and confirms on the page it lands on (mail scanners don't). */
export async function openMagicLink(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await page.locator('form[action="/api/auth/magic-link/verify"] button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/login/link");
}
export const INVITE_LINK = /http:\/\/localhost:3100\/invite\/[\w-]+/;

/** Unique company domain per test run, so tests never share workspaces. */
export function uniqueDomain(label: string): string {
  return `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.de`;
}

export const RESET_LINK = /http:\/\/localhost:3100\/api\/auth\/reset-password\/\S+/;

/** Password the helpers give every new test account. */
export const E2E_PASSWORD = "e2e-Passwort-2026";

/** Asks for a magic link on the login page and returns it from the mail. */
export async function requestMagicLink(page: Page, email: string, next?: string): Promise<string> {
  const since = new Date(Date.now() - 1000);
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByRole("button", { name: "Anmeldelink per E-Mail senden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  return linkFromMail(email, MAGIC_LINK, since);
}

/** Fills the forced set-password page (first sign-in by link) and continues. */
export async function setPassword(page: Page, password = E2E_PASSWORD) {
  await expect(page.getByRole("heading", { name: "Passwort festlegen" })).toBeVisible();
  await page.getByLabel("Neues Passwort").fill(password);
  await page.getByLabel("Passwort wiederholen").fill(password);
  await page.getByRole("button", { name: "Passwort speichern und weiter" }).click();
  await expect(page).not.toHaveURL(/\/set-password/);
}

/** Signs in through the real magic-link flow; a new account sets its password on the way. */
export async function signIn(page: Page, email: string, next?: string) {
  const link = await requestMagicLink(page, email, next);
  await openMagicLink(page, link);
  if (new URL(page.url()).pathname === "/set-password") await setPassword(page);
  return link;
}

/** Signs in with email and password on the login page. */
export async function signInWithPassword(page: Page, email: string, password = E2E_PASSWORD, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
}

/** Signs in a new user and creates a workspace via onboarding; returns the workspace URL path. */
export async function createWorkspace(page: Page, email: string, name: string, invites = "") {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("textbox", { name: "Name des Workspace" }).fill(name);
  if (invites) await page.getByRole("textbox", { name: /Kollegen einladen/ }).fill(invites);
  await page.getByRole("button", { name: "Workspace anlegen" }).click();
  await expect(page.getByRole("heading", { name: `Willkommen bei ${name}` })).toBeVisible();
  return new URL(page.url()).pathname;
}
