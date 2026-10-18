import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createWorkspace, linkFromMail, RESET_LINK, uniqueDomain } from "./helpers/auth";
import { waitForHydration } from "./helpers/hydration";

// The MCP endpoint end to end: token from the settings page, JSON-RPC over Streamable HTTP.

let rpcId = 0;
async function rpc(request: APIRequestContext, token: string | null, method: string, params: Record<string, unknown> = {}) {
  const res = await request.post("/mcp", {
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    data: { jsonrpc: "2.0", id: ++rpcId, method, params },
  });
  return { status: res.status(), headers: res.headers(), body: res.status() === 200 ? await res.json() : await res.text() };
}

const call = async (request: APIRequestContext, token: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(request, token, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  return res.body.result as { content: Array<{ text: string }>; structuredContent?: Record<string, unknown>; isError?: boolean };
};

async function newToken(page: Page, path: string, name: string) {
  await page.goto(`${path}/settings/claude`);
  const input = page.getByRole("textbox", { name: "Name des Tokens" });
  await waitForHydration(input);
  await input.fill(name);
  await page.getByRole("button", { name: "Token erstellen" }).click();
  const value = page.getByRole("textbox", { name: "Dein neues Token" });
  await expect(value).toHaveValue(/^iht_/);
  return value.inputValue();
}

test("connect Claude: token, tools, writes show up 'via Claude', revoke", async ({ page, browser }) => {
  const path = await createWorkspace(page, `lea@${uniqueDomain("mcp")}`, "Mcp GmbH");
  const token = await newToken(page, path, "Claude Code Laptop");
  // The config snippet contains the fresh token.
  await expect(page.getByLabel("Claude Code", { exact: true })).toContainText(`Bearer ${token}`);
  await expect(page.getByLabel("Claude Desktop", { exact: true })).toContainText(token);
  await expect(page.getByRole("region", { name: /Deine Tokens/ })).toContainText("Claude Code Laptop");
  await expect(page.getByRole("region", { name: /Deine Tokens/ })).toContainText("läuft ab"); // default: 90 days

  const api = (await browser.newContext()).request; // no cookies: the token alone authenticates

  const init = await rpc(api, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  expect(init.status).toBe(200);
  expect(init.body.result.serverInfo.name).toBe("inhouseticket-mcp-server");

  const tools = await rpc(api, token, "tools/list");
  const names = (tools.body.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
  expect(names).toEqual([
    "inhouseticket_add_comment",
    "inhouseticket_create_ticket",
    "inhouseticket_get_ticket",
    "inhouseticket_get_workload",
    "inhouseticket_list_members",
    "inhouseticket_list_projects",
    "inhouseticket_search_tickets",
    "inhouseticket_toggle_subtask",
    "inhouseticket_update_ticket",
  ]);

  const projects = await call(api, token, "inhouseticket_list_projects");
  expect(projects.structuredContent?.projects).toEqual([{ key: "MKT", name: "Marketing", open_tickets: 5 }]);

  const created = await call(api, token, "inhouseticket_create_ticket", {
    project_key: "mkt",
    title: "Herbstkampagne briefen",
    description: "Ziele und **Budget** klären.",
    priority: "hoch",
    assignee: "me",
    due_date: "2030-10-10",
    subtasks: ["Zielgruppe", "Kanäle"],
  });
  expect(created.isError).toBeFalsy();
  expect(created.structuredContent?.key).toBe("MKT-6");

  const updated = await call(api, token, "inhouseticket_update_ticket", { key: "MKT-6", status: "in arbeit" });
  expect(updated.content[0]?.text).toContain("In Arbeit");
  await call(api, token, "inhouseticket_toggle_subtask", { key: "MKT-6", subtask: 2, done: true });
  await call(api, token, "inhouseticket_add_comment", { key: "MKT-6", body: "Freigabe ist da." });

  const detail = await call(api, token, "inhouseticket_get_ticket", { key: "mkt-6" });
  expect(detail.structuredContent).toMatchObject({ key: "MKT-6", status: "In Arbeit", priority: "hoch", assignee: "Lea", due_date: "2030-10-10" });
  expect(detail.content[0]?.text).toContain("2. [x] Kanäle");
  expect(detail.content[0]?.text).toContain("Freigabe ist da.");

  // Lea's own: the new ticket and the onboarding's "Drück C …" tutorial ticket (Hoch).
  const search = await call(api, token, "inhouseticket_search_tickets", { assignee: "me" });
  expect(search.structuredContent).toMatchObject({ total: 2, has_more: false });

  const workload = await call(api, token, "inhouseticket_get_workload");
  expect(workload.structuredContent?.people).toEqual([expect.objectContaining({ name: "Lea", open: 2, points: 6 })]);

  // Actionable errors instead of exceptions.
  const missing = await call(api, token, "inhouseticket_update_ticket", { key: "MKT-6", status: "Gibt es nicht" });
  expect(missing.isError).toBe(true);
  expect(missing.content[0]?.text).toMatch(/Offen.*In Arbeit.*Review.*Erledigt/);
  const tooMany = await call(api, token, "inhouseticket_create_ticket", { project_key: "MKT", title: "x", subtasks: ["1", "2", "3", "4", "5", "6"] });
  expect(tooMany.isError).toBe(true);

  // The web app shows the change "via Claude".
  await page.goto(`${path}/p/MKT?t=MKT-6`);
  await page.getByRole("dialog").getByRole("tab", { name: "Aktivität" }).click();
  await expect(page.getByRole("dialog").getByText("(via Claude)").first()).toBeVisible();

  // Revoke → the token stops working immediately.
  await page.goto(`${path}/settings/claude`);
  await page.getByRole("button", { name: "Token Claude Code Laptop widerrufen" }).click();
  await expect(page.getByText("widerrufen", { exact: true })).toBeVisible();
  const fresh = (await browser.newContext()).request; // the old socket may have idled out meanwhile
  expect((await rpc(fresh, token, "tools/list")).status).toBe(401);
});

test("MCP endpoint rejects missing, unknown and foreign tokens", async ({ browser }) => {
  // Set up both workspaces first: an idle keep-alive socket would be reset by the dev server.
  const a = await browser.newPage();
  const pathA = await createWorkspace(a, `ana@${uniqueDomain("mcpa")}`, "Alpha GmbH");
  const tokenA = await newToken(a, pathA, "A");
  const b = await browser.newPage();
  const pathB = await createWorkspace(b, `ben@${uniqueDomain("mcpb")}`, "Beta GmbH");
  const tokenB = await newToken(b, pathB, "B");

  const api = (await browser.newContext()).request;
  const none = await rpc(api, null, "tools/list");
  expect(none.status).toBe(401);
  expect(none.headers["www-authenticate"]).toContain("Bearer");
  expect((await rpc(api, "iht_doesnotexist", "tools/list")).status).toBe(401);
  expect((await api.get("/mcp")).status()).toBe(401); // unauthenticated probes get the OAuth discovery hint

  // A token only sees its own workspace.
  await call(api, tokenA, "inhouseticket_create_ticket", { project_key: "MKT", title: "Geheim in Alpha" });
  const foreign = await call(api, tokenB, "inhouseticket_search_tickets", { query: "Geheim" });
  expect(foreign.structuredContent?.total).toBe(0);
  const own = await call(api, tokenA, "inhouseticket_search_tickets", { query: "Geheim" });
  expect(own.structuredContent?.total).toBe(1);
  const cross = await call(api, tokenB, "inhouseticket_get_ticket", { key: "MKT-6" });
  expect(cross.isError).toBe(true);
});

test("token expiry is chosen by the user: custom date, validation, no expiry", async ({ page }) => {
  const path = await createWorkspace(page, `ute@${uniqueDomain("expiry")}`, "Ablauf GmbH");
  await page.goto(`${path}/settings/claude`);
  const name = page.getByRole("textbox", { name: "Name des Tokens" });
  await waitForHydration(name);
  const tokens = page.getByRole("region", { name: /Deine Tokens/ });

  await name.fill("Bis Weihnachten");
  await page.getByRole("combobox", { name: "Gültig" }).selectOption("custom");
  const date = page.getByLabel("Gültig bis einschließlich");
  await date.fill("2020-01-01");
  await page.getByRole("button", { name: "Token erstellen" }).click();
  await expect(page.getByText(/Ablaufdatum in der Zukunft/)).toBeVisible();

  const next = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  await date.fill(next);
  await page.getByRole("button", { name: "Token erstellen" }).click();
  await expect(page.getByRole("textbox", { name: "Dein neues Token" })).toHaveValue(/^iht_/);
  const [y, m, d] = next.split("-");
  await expect(tokens).toContainText(`läuft ab ${d}.${m}.${y}`);

  await name.fill("Dauerhaft");
  await page.getByRole("combobox", { name: "Gültig" }).selectOption("never");
  await page.getByRole("button", { name: "Token erstellen" }).click();
  await expect(tokens).toContainText("ohne Ablauf");
});

test("'Alle Verbindungen trennen' in the account settings revokes every API token at once", async ({ page, browser }) => {
  const path = await createWorkspace(page, `toni@${uniqueDomain("disconnectall")}`, "Trenn GmbH");
  const first = await newToken(page, path, "Laptop");
  const second = await newToken(page, path, "CI");
  const api = (await browser.newContext()).request;
  expect((await rpc(api, first, "tools/list")).status).toBe(200);

  await page.goto(`${path}/settings/account`);
  const start = page.getByRole("button", { name: "Alle Verbindungen trennen" });
  await waitForHydration(start);
  await start.click();
  await page.getByRole("button", { name: "Ja, alle trennen" }).click();
  await expect(page.getByText("Getrennt: 2 API-Tokens, 0 Apps.")).toBeVisible();
  await expect(start).toBeFocused();

  expect((await rpc(api, first, "tools/list")).status).toBe(401);
  expect((await rpc(api, second, "tools/list")).status).toBe(401);
});

test("a password reset revokes the person's API tokens", async ({ page, browser }) => {
  const email = `rolf@${uniqueDomain("resettokens")}`;
  const path = await createWorkspace(page, email, "Reset Token GmbH");
  const token = await newToken(page, path, "Skript");
  const api = (await browser.newContext()).request;
  expect((await rpc(api, token, "tools/list")).status).toBe(200);

  const other = await (await browser.newContext()).newPage();
  await other.goto("/forgot-password");
  const since = new Date(Date.now() - 1000);
  await other.getByRole("textbox", { name: "Firmen-E-Mail" }).fill(email);
  await other.getByRole("button", { name: "Link zum Zurücksetzen senden" }).click();
  await expect(other.getByText(/Falls es für rolf@/)).toBeVisible();
  await other.goto(await linkFromMail(email, RESET_LINK, since));
  await other.getByLabel("Neues Passwort").fill("frisch-gesetzt-88");
  await other.getByLabel("Passwort wiederholen").fill("frisch-gesetzt-88");
  await other.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(other.getByText(/Dein Passwort ist gespeichert/)).toBeVisible();

  expect((await rpc(api, token, "tools/list")).status).toBe(401);
});
