import { createHash, randomBytes } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { completeOwnerWizard, confirmRegistration, linkFromMail, ONBOARDING_URL, REGISTER_LINK, submitRegistration, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// Inventory of everything the site stores on or reads from the device, with Matomo switched on
// (playwright.config.ts): crawls public pages, sign-in and the app – anonymous and signed in – and
// asserts that only technically necessary storage exists (§ 25 Abs. 2 Nr. 2 TDDDG, privacy policy
// section 7) and that no request leaves our own origin. A new cookie or storage key fails here
// until it is classified and listed in the privacy policy.

/** Cookie names → why they are necessary. Keep in sync with the table in /datenschutz. */
const ALLOWED_COOKIES = new Set([
  "better-auth.session_token", // sign-in session
  "better-auth.session_data", // 5-minute cache of the session (saves a DB round trip)
  "lang", // language chosen with DE | EN
  "iht_optout", // "Messung auf diesem Gerät deaktivieren"
]);
/** Browser storage keys (localStorage / sessionStorage). None today. */
const ALLOWED_STORAGE = new Set<string>([]);

type Inventory = {
  cookies: Map<string, { domain: string; httpOnly: boolean; secure: boolean; sameSite: string; expires: string }>;
  storage: Set<string>;
  indexedDb: Set<string>;
  hosts: Set<string>;
};

function watch(context: BrowserContext): Inventory {
  const inv: Inventory = { cookies: new Map(), storage: new Set(), indexedDb: new Set(), hosts: new Set() };
  context.on("request", (req) => {
    const url = new URL(req.url());
    if (url.protocol === "http:" || url.protocol === "https:") inv.hosts.add(url.host);
  });
  return inv;
}

/** Visits `path` and records cookies, Web Storage and IndexedDB after the page has settled. */
async function visit(page: Page, inv: Inventory, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await snapshot(page, inv);
}

async function snapshot(page: Page, inv: Inventory) {
  for (const c of await page.context().cookies()) {
    const seconds = c.expires - Date.now() / 1000;
    const expires = c.expires < 0 ? "session" : seconds < 86400 ? `${Math.round(seconds / 60)} min` : `${Math.round(seconds / 86400)} d`;
    inv.cookies.set(c.name, { domain: c.domain, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, expires });
  }
  const found = await page.evaluate(async () => ({
    local: Object.keys(localStorage).map((k) => `localStorage:${k}`),
    session: Object.keys(sessionStorage).map((k) => `sessionStorage:${k}`),
    idb: (await indexedDB.databases()).map((d) => d.name ?? "?"),
  }));
  for (const k of [...found.local, ...found.session]) inv.storage.add(k);
  for (const k of found.idb) inv.indexedDb.add(k);
}

function report(inv: Inventory) {
  const lines = [
    "cookies:",
    ...[...inv.cookies].map(([name, c]) => `  ${name} domain=${c.domain} httpOnly=${c.httpOnly} secure=${c.secure} sameSite=${c.sameSite} expires=${c.expires}`),
    `storage: ${[...inv.storage].join(", ") || "-"}`,
    `indexedDB: ${[...inv.indexedDb].join(", ") || "-"}`,
    `hosts: ${[...inv.hosts].join(", ")}`,
  ];
  return lines.join("\n");
}

function assertAllowed(inv: Inventory) {
  const text = report(inv);
  console.log(text);
  for (const name of inv.cookies.keys()) expect(ALLOWED_COOKIES, `unlisted cookie ${name}\n${text}`).toContain(name);
  for (const key of inv.storage) expect(ALLOWED_STORAGE, `unlisted storage ${key}\n${text}`).toContain(key);
  // Next.js dev tools keep a debug channel in IndexedDB (next/dist/client/dev, not in production builds).
  expect([...inv.indexedDb].filter((name) => name !== "__next_debug_channel"), text).toEqual([]);
  expect([...inv.hosts], text).toEqual(["localhost:3100"]);
  // Matomo's own cookies (_pk_*, mtm_*) never appear – it runs cookieless.
  for (const name of inv.cookies.keys()) expect(name).not.toMatch(/^(_pk_|mtm_|MATOMO)/i);
}

const PUBLIC = ["/", "/umziehen", "/impressum", "/datenschutz", "/agb", "/avv"];
const AUTH = ["/login", "/register", "/forgot-password", "/reset-password", "/invite/abc", "/oauth/consent"];

test("anonymous: public and sign-in pages store nothing but what is necessary", async ({ page }) => {
  const inv = watch(page.context());
  for (const path of [...PUBLIC, ...AUTH]) await visit(page, inv, path);
  // No cookie at all for an anonymous visitor who does not touch the language toggle.
  expect([...inv.cookies.keys()]).toEqual([]);
  // The language toggle sets `lang`.
  await page.goto("/");
  const en = page.getByRole("button", { name: /^EN/ });
  await waitForHydration(en);
  await en.click();
  await expect.poll(async () => (await page.context().cookies()).map((c) => c.name)).toContain("lang");
  await snapshot(page, inv);
  // The measurement opt-out on the privacy page sets `iht_optout`.
  await page.goto("/datenschutz");
  await page.getByRole("button", { name: "Messung auf diesem Gerät deaktivieren" }).click();
  await expect.poll(async () => (await page.context().cookies()).map((c) => c.name)).toContain("iht_optout");
  await snapshot(page, inv);
  assertAllowed(inv);
  expect([...inv.cookies.keys()].sort()).toEqual(["iht_optout", "lang"]);
});

test("signed in: onboarding, app pages, settings and OAuth consent store nothing but what is necessary", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const inv = watch(page.context());
  const email = `ina@${uniqueDomain("inventory")}`;
  const since = new Date(Date.now() - 1000);
  await submitRegistration(page, { name: "Ina Inventar", email });
  await confirmRegistration(page, await linkFromMail(email, REGISTER_LINK, since));
  await expect(page).toHaveURL(ONBOARDING_URL);
  await snapshot(page, inv);
  // The wizard keeps its state on the server (user_pref.onboarding_step), never in the browser.
  await completeOwnerWizard(page, "Inventar GmbH");
  await snapshot(page, inv);
  const ws = `/${new URL(page.url()).pathname.split("/")[1]}`;

  for (const path of [
    ws,
    `${ws}/p/MKT`,
    `${ws}/p/MKT?view=board`,
    `${ws}/p/MKT?t=MKT-1`,
    `${ws}/p/MKT/settings`,
    `${ws}/inbox`,
    `${ws}/me`,
    `${ws}/dashboard`,
    `${ws}/settings/members`,
    `${ws}/settings/account`,
    `${ws}/settings/claude`,
    `${ws}/settings/data`,
    `${ws}/settings/data/import`,
    ...PUBLIC,
  ]) {
    await visit(page, inv, path);
  }

  // OAuth consent as claude.ai would start it (dynamic client registration + PKCE).
  const api = (await browser.newContext()).request;
  const asMeta = await (await api.get("/.well-known/oauth-authorization-server/api/auth")).json();
  const reg = await api.post(new URL(asMeta.registration_endpoint).pathname, {
    data: { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" },
  });
  expect(reg.status()).toBe(201);
  const url = new URL(asMeta.authorization_endpoint);
  const challenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");
  const q = { response_type: "code", client_id: (await reg.json()).client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: challenge, code_challenge_method: "S256", state: "s", scope: "openid profile email offline_access", resource: `${new URL(asMeta.issuer).origin}/mcp` };
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  await page.goto(url.pathname + url.search);
  await expect(page.getByRole("heading", { name: "Zugriff erlauben?" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await snapshot(page, inv);

  assertAllowed(inv);
  expect([...inv.cookies.keys()]).toEqual(expect.arrayContaining(["better-auth.session_token"]));
});
