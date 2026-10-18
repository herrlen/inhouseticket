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

/** Number of mails to `to` that arrived after `since`. */
export async function mailCount(to: string, since: Date): Promise<number> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const { messages } = (await res.json()) as { messages: MailpitMessage[] };
  return messages.filter((m) => new Date(m.Created) >= since).length;
}

/** Text of the newest mail to `to` after `since`. */
export async function mailText(to: string, since: Date): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: MailpitMessage[] };
    const fresh = messages.find((m) => new Date(m.Created) >= since);
    if (fresh) return ((await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json()) as { Text: string }).Text;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No mail for ${to}`);
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
  await page.getByRole("button", { name: "Ohne Passwort per Link anmelden" }).click();
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

/** URL of the onboarding wizard, with or without the step the wizard keeps in the query string. */
export const ONBOARDING_URL = /\/onboarding(\?step=\d)?$/;

export type WizardOptions = {
  /** Addresses for step 6 (comma separated); empty = "Überspringen". */
  invites?: string;
  /** Auto-join switch in step 2 – pre-selected on in the wizard, the helper's default is off. */
  autoJoin?: boolean;
  /** Team area pill in step 3 (German label). */
  team?: string;
  /** Start view in step 4. */
  view?: "Liste" | "Board";
};

/** Clicks through the owner wizard (docs/ONBOARDING.md §2.1) from step 1; ends in the template project. */
export async function completeOwnerWizard(page: Page, workspaceName: string, opts: WizardOptions = {}) {
  await expect(page).toHaveURL(ONBOARDING_URL);
  await expect(page.getByRole("heading", { name: "Willkommen! Wie heißt du?" })).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();

  await expect(page.getByRole("heading", { name: "Dein Workspace" })).toBeVisible();
  await page.getByRole("textbox", { name: "Name des Workspace" }).fill(workspaceName);
  const autoJoin = page.getByRole("checkbox", { name: /dürfen beitreten/ });
  // The step slides in (180 ms); retry until the click lands on the settled checkbox.
  if (await autoJoin.count()) await expect(async () => autoJoin.setChecked(opts.autoJoin ?? false, { timeout: 1000 })).toPass();
  await page.getByRole("button", { name: "Weiter" }).click();

  await expect(page.getByRole("heading", { name: "Wofür nutzt ihr inhouseticket?" })).toBeVisible();
  await page.getByRole("radio", { name: opts.team ?? "Marketing" }).click();
  await page.getByRole("button", { name: "Weiter" }).click();

  await expect(page.getByRole("heading", { name: "Wie möchtest du deine Tickets sehen?" })).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(`^${opts.view ?? "Liste"}`) }).click();
  await page.getByRole("button", { name: "Weiter" }).click();

  await expect(page.getByRole("heading", { name: "Zwei kurze Fragen" })).toBeVisible();
  await page.getByRole("button", { name: "Überspringen" }).click();

  await expect(page.getByRole("heading", { name: "Lade dein Team ein" })).toBeVisible();
  if (opts.invites) {
    await page.getByRole("textbox", { name: "E-Mail-Adressen" }).fill(opts.invites);
    await page.getByRole("button", { name: "Los geht's" }).click();
  } else {
    await page.getByRole("button", { name: "Überspringen" }).click();
  }
  await page.waitForURL((url) => /^\/[a-z0-9-]+\/p\/[A-Z0-9]+$/.test(url.pathname));
}

/** Signs in a new user and creates a workspace via the wizard; returns the workspace URL path (overview open). */
export async function createWorkspace(page: Page, email: string, name: string, invites = "", opts: Omit<WizardOptions, "invites"> = {}) {
  await signIn(page, email);
  await completeOwnerWizard(page, name, { ...opts, invites });
  const path = `/${new URL(page.url()).pathname.split("/")[1]}`;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: `Willkommen bei ${name}` })).toBeVisible();
  return path;
}

/** The short wizard of an invited or auto-joined person: profile and start view → "Meine Aufgaben". */
export async function completeJoinerWizard(page: Page, view: "Liste" | "Board" = "Liste") {
  await expect(page).toHaveURL(ONBOARDING_URL);
  await expect(page.getByRole("heading", { name: "Willkommen! Wie heißt du?" })).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByRole("heading", { name: "Wie möchtest du deine Tickets sehen?" })).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(`^${view}`) }).click();
  await page.getByRole("button", { name: "Los geht's" }).click();
  await page.waitForURL((url) => /^\/[a-z0-9-]+\/me$/.test(url.pathname));
}

export const REGISTER_LINK = /http:\/\/localhost:3100\/register\/confirm\?token=[\w-]+/;

/** Fills the registration form and waits for the neutral "check your inbox" answer. */
export async function submitRegistration(page: Page, opts: { name: string; email: string; password?: string; next?: string }) {
  await page.goto(opts.next ? `/register?next=${encodeURIComponent(opts.next)}` : "/register");
  await page.getByRole("textbox", { name: "Name" }).fill(opts.name);
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(opts.email);
  await page.getByLabel("Passwort", { exact: true }).fill(opts.password ?? E2E_PASSWORD);
  await page.getByLabel("Passwort wiederholen").fill(opts.password ?? E2E_PASSWORD);
  await page.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
}

/** Opens the confirmation link and completes it with the registration password. */
export async function confirmRegistration(page: Page, link: string, password = E2E_PASSWORD) {
  await page.goto(link);
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Bestätigen und anmelden" }).click();
  await expect(page).not.toHaveURL(/\/register\/confirm/);
}
