import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createWorkspace, E2E_PASSWORD, linkFromMail, MAGIC_LINK, openMagicLink, setPassword, uniqueDomain } from "./helpers/auth";

// The connector flow of claude.ai, step by step: discovery, dynamic client registration,
// authorization code + PKCE with consent, token, MCP call, refresh, disconnect.

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const b64url = (b: Buffer) => b.toString("base64url");

async function discover(api: APIRequestContext) {
  const probe = await api.post("/mcp", { headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, data: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } });
  expect(probe.status()).toBe(401);
  const metaUrl = /resource_metadata="([^"]+)"/.exec(probe.headers()["www-authenticate"] ?? "")?.[1];
  expect(metaUrl).toBeTruthy();
  const resourceMeta = await (await api.get(new URL(metaUrl!).pathname)).json();
  const issuer = new URL(resourceMeta.authorization_servers[0]);
  const asMeta = await (await api.get(`/.well-known/oauth-authorization-server${issuer.pathname}`)).json();
  expect(asMeta.issuer).toBe(resourceMeta.authorization_servers[0]);
  return { resource: resourceMeta.resource as string, as: asMeta as { authorization_endpoint: string; token_endpoint: string; registration_endpoint: string } };
}

async function register(api: APIRequestContext, endpoint: string) {
  const res = await api.post(new URL(endpoint).pathname, {
    data: { client_name: "Claude", redirect_uris: [CALLBACK], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).client_id as string;
}

function authorizeUrl(endpoint: string, clientId: string, resource: string) {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const url = new URL(endpoint);
  const q = { response_type: "code", client_id: clientId, redirect_uri: CALLBACK, code_challenge: challenge, code_challenge_method: "S256", state: "st4te", scope: "openid profile email offline_access", resource };
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  return { path: url.pathname + url.search, verifier };
}

/** Clicks "Erlauben" and returns the code from the redirect to Claude (intercepted). */
async function allow(page: Page) {
  const redirected = new Promise<URL>((resolve) => {
    void page.route("https://claude.ai/**", async (route) => {
      resolve(new URL(route.request().url()));
      await route.fulfill({ status: 200, body: "ok" });
    });
  });
  await page.getByRole("button", { name: "Erlauben" }).click();
  const url = await redirected;
  expect(url.searchParams.get("state")).toBe("st4te");
  return url.searchParams.get("code")!;
}

async function token(api: APIRequestContext, endpoint: string, form: Record<string, string>) {
  const res = await api.post(new URL(endpoint).pathname, { form });
  expect(res.status(), await res.text()).toBe(200);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

const rpc = (api: APIRequestContext, accessToken: string, name: string) =>
  api.post("/mcp", {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } },
  });

test("claude.ai connector: discovery, registration, consent, MCP call, refresh, disconnect", async ({ page, browser }) => {
  const path = await createWorkspace(page, `oli@${uniqueDomain("oauth")}`, "OAuth GmbH");
  const api = (await browser.newContext()).request;
  const { resource, as } = await discover(api);
  const clientId = await register(api, as.registration_endpoint);

  const { path: authPath, verifier } = authorizeUrl(as.authorization_endpoint, clientId, resource);
  await page.goto(authPath);
  await expect(page.getByRole("heading", { name: "Zugriff erlauben?" })).toBeVisible();
  await expect(page.getByText("Claude möchte in deinem Namen")).toBeVisible();
  await expect(page.getByText("Workspace: OAuth GmbH")).toBeVisible();
  const code = await allow(page);

  const tokens = await token(api, as.token_endpoint, { grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: clientId, code_verifier: verifier, resource });
  expect(tokens.refresh_token).toBeTruthy();

  const call = await rpc(api, tokens.access_token, "inhouseticket_list_projects");
  expect(call.status()).toBe(200);
  expect((await call.json()).result.structuredContent.projects).toEqual([{ key: "MKT", name: "Marketing", open_tickets: 3 }]);

  const refreshed = await token(api, as.token_endpoint, { grant_type: "refresh_token", refresh_token: tokens.refresh_token!, client_id: clientId, resource });
  expect((await rpc(api, refreshed.access_token, "inhouseticket_list_members")).status()).toBe(200);

  // Shown under "Verbundene Apps"; disconnecting kills the tokens at once.
  await page.goto(`${path}/settings/claude`);
  const apps = page.getByRole("region", { name: "Verbundene Apps" });
  await expect(apps).toContainText("Claude");
  await apps.getByRole("button", { name: "Claude trennen" }).click();
  await expect(apps).toContainText("Keine App");
  const fresh = (await browser.newContext()).request;
  expect((await rpc(fresh, refreshed.access_token, "inhouseticket_list_projects")).status()).toBe(401);
});

test("connector login: not signed in → magic link → consent; deny returns an error to Claude", async ({ browser }) => {
  const email = `pia@${uniqueDomain("oauthlogin")}`;
  const setup = await browser.newPage();
  await createWorkspace(setup, email, "Login GmbH");

  const page = await (await browser.newContext()).newPage();
  const api = page.context().request;
  const { resource, as } = await discover(api);
  const clientId = await register(api, as.registration_endpoint);
  const { path: authPath } = authorizeUrl(as.authorization_endpoint, clientId, resource);

  await page.goto(authPath);
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByText("Melde dich an, um Claude mit inhouseticket zu verbinden.")).toBeVisible();
  const since = new Date(Date.now() - 1000);
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByRole("button", { name: "Anmeldelink per E-Mail senden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  await openMagicLink(page, await linkFromMail(email, MAGIC_LINK, since));
  await expect(page.getByRole("heading", { name: "Zugriff erlauben?" })).toBeVisible();

  const denied = new Promise<URL>((resolve) => {
    void page.route("https://claude.ai/**", async (route) => {
      resolve(new URL(route.request().url()));
      await route.fulfill({ status: 200, body: "ok" });
    });
  });
  await page.getByRole("button", { name: "Ablehnen" }).click();
  expect((await denied).searchParams.get("error")).toBe("access_denied");
});

test("connector login of a person without a password: link → set password → consent", async ({ browser }) => {
  const email = `pit@${uniqueDomain("oauthnew")}`;
  const page = await (await browser.newContext()).newPage();
  const api = page.context().request;
  const { resource, as } = await discover(api);
  const clientId = await register(api, as.registration_endpoint);
  const { path: authPath } = authorizeUrl(as.authorization_endpoint, clientId, resource);

  await page.goto(authPath);
  await expect(page).toHaveURL(/\/login\?/);
  const since = new Date(Date.now() - 1000);
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByRole("button", { name: "Anmeldelink per E-Mail senden" }).click();
  await expect(page.getByRole("heading", { name: "Schau in dein Postfach" })).toBeVisible();
  await openMagicLink(page, await linkFromMail(email, MAGIC_LINK, since));
  // The authorize endpoint itself sends the person to set a password first, then continues.
  await expect(page).toHaveURL(/\/set-password\?next=%2Fapi%2Fauth%2Foauth2%2Fauthorize/);
  await setPassword(page);
  await expect(page.getByRole("heading", { name: "Zugriff erlauben?" })).toBeVisible();
});

test("connector login with email and password", async ({ browser }) => {
  const email = `pola@${uniqueDomain("oauthpw")}`;
  await createWorkspace(await browser.newPage(), email, "Passwort GmbH");

  const page = await (await browser.newContext()).newPage();
  const api = page.context().request;
  const { resource, as } = await discover(api);
  const clientId = await register(api, as.registration_endpoint);
  const { path: authPath } = authorizeUrl(as.authorization_endpoint, clientId, resource);

  await page.goto(authPath);
  await expect(page).toHaveURL(/\/login\?/);
  await page.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Zugriff erlauben?" })).toBeVisible();
});
