import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, INVITE_LINK, linkFromMail, signIn, uniqueDomain } from "./helpers/auth";

async function acceptInvite(page: Page, email: string, since: Date) {
  const invite = await linkFromMail(email, INVITE_LINK, since);
  await signIn(page, email, new URL(invite).pathname);
  await page.getByRole("button", { name: "Annehmen" }).click();
  await expect(page.getByRole("heading", { name: /^Willkommen bei/ })).toBeVisible();
}

test("owner manages members: invite, role change, removal", async ({ browser }) => {
  const domain = uniqueDomain("members");
  const owner = await browser.newPage();
  const path = await createWorkspace(owner, `owner@${domain}`, "Members GmbH");

  await owner.getByRole("link", { name: "Mitglieder" }).click();
  await expect(owner.getByText("1 von 100 Plätzen belegt.")).toBeVisible();

  const since = new Date(Date.now() - 1000);
  await owner.getByRole("textbox", { name: /Firmen-E-Mails/ }).fill(`mia@${domain}, max@gmail.com`);
  await owner.getByRole("button", { name: "Einladen", exact: true }).click();
  await expect(owner.getByText(/Keine gültige Firmen-E-Mail: max@gmail.com/)).toBeVisible();

  await owner.getByRole("textbox", { name: /Firmen-E-Mails/ }).fill(`mia@${domain}`);
  await owner.getByRole("button", { name: "Einladen", exact: true }).click();
  await expect(owner.getByText("1 Einladung verschickt.")).toBeVisible();
  await expect(owner.getByRole("heading", { name: "Offene Einladungen (1)" })).toBeVisible();

  const mia = await browser.newPage();
  await acceptInvite(mia, `mia@${domain}`, since);

  // A member cannot open the members page.
  const denied = await mia.goto(`${path}/settings/members`);
  expect(denied?.status()).toBe(404);

  // Owner promotes Mia to admin – she now sees the members page.
  await owner.reload();
  await expect(owner.getByText("2 von 100 Plätzen belegt.")).toBeVisible();
  await owner.getByRole("combobox", { name: "Rolle von Mia" }).selectOption("admin");
  await owner.getByRole("button", { name: "Speichern" }).click();
  await expect(owner.getByText("Rolle geändert.")).toBeVisible();
  await mia.goto(path);
  await expect(mia.getByRole("link", { name: "Mitglieder" })).toBeVisible();

  // Owner removes Mia – she loses access immediately.
  await owner.getByRole("button", { name: "Mia entfernen" }).click();
  await expect(owner.getByText("1 von 100 Plätzen belegt.")).toBeVisible();
  const gone = await mia.goto(path);
  expect(gone?.status()).toBe(404);
});

test("with auto-join enabled, colleagues of the same domain can join", async ({ browser }) => {
  const domain = uniqueDomain("autojoin");
  const owner = await browser.newPage();
  const path = await createWorkspace(owner, `owner@${domain}`, "Autojoin AG");
  await owner.goto(`${path}/settings/members`);
  await expect(owner.getByText("Aus – nur mit Einladung")).toBeVisible();
  await owner.getByRole("button", { name: "Einschalten" }).click();
  await expect(owner.getByText("Aktiv", { exact: true })).toBeVisible();

  const colleague = await browser.newPage();
  await signIn(colleague, `kollegin@${domain}`);
  await colleague.getByRole("button", { name: "Beitreten" }).click();
  await expect(colleague).toHaveURL(new RegExp(`${path}$`));
});

test("invitation link for someone else is refused", async ({ browser }) => {
  const domain = uniqueDomain("wronguser");
  const owner = await browser.newPage();
  const since = new Date(Date.now() - 1000);
  await createWorkspace(owner, `owner@${domain}`, "Wrong AG", `richtig@${domain}`);
  const invite = await linkFromMail(`richtig@${domain}`, INVITE_LINK, since);

  // The owner opens the colleague's link while signed in as themselves.
  await owner.goto(invite);
  await expect(owner.getByText(/Diese Einladung gilt für richtig@/)).toBeVisible();
  await expect(owner.getByRole("button", { name: "Annehmen" })).toHaveCount(0);
});
