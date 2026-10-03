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

export const MAGIC_LINK = /http:\/\/localhost:3100\/api\/auth\/magic-link\/verify\?\S+/;
export const INVITE_LINK = /http:\/\/localhost:3100\/invite\/[\w-]+/;

/** Unique company domain per test run, so tests never share workspaces. */
export function uniqueDomain(label: string): string {
  return `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.de`;
}

/** Signs in through the real magic-link flow. */
export async function signIn(page: Page, email: string, next?: string) {
  const since = new Date(Date.now() - 1000);
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByRole("button", { name: "Anmeldelink senden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  const link = await linkFromMail(email, MAGIC_LINK, since);
  await page.goto(link);
  return link;
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
