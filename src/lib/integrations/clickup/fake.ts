// In-memory stand-in for the ClickUp API v2 – for unit/DB tests (as a fetch function) and the
// E2E mock server (as a request handler). Only the endpoints the connector uses, with the
// filters it sends. Fixture data is invented: no real names, tasks or comments.
// Self-contained (no imports) so the E2E test can load it as is.

export type FakeTask = {
  id: string;
  name: string;
  status: string;
  statusType?: string;
  listId: string;
  parent?: string | null;
  assignees?: number[];
  priority?: 1 | 2 | 3 | 4 | null;
  tags?: string[];
  updated: number;
  created?: number;
  due?: number | null;
  description?: string;
  milestone?: boolean;
  checklist?: Array<{ name: string; resolved: boolean }>;
};

export type FakeComment = { id: string; text: string; userId: number; date: number };

export type FakeData = {
  token: string;
  team: { id: string; name: string };
  members: Array<{ id: number; username: string; email: string }>;
  spaces: Array<{
    id: string;
    name: string;
    statuses: Array<{ status: string; type: string; color: string }>;
    folders: Array<{ id: string; name: string; lists: Array<{ id: string; name: string }> }>;
    lists: Array<{ id: string; name: string }>;
  }>;
  tasks: FakeTask[];
  comments: Record<string, FakeComment[]>;
};

export type FakeOptions = {
  /** Answer these request numbers (1-based) with 429. */
  rateLimitOn?: number[];
  pageSize?: number;
};

export type FakeResponse = { status: number; headers: Record<string, string>; body: unknown };

/** A webhook registered with the fake (POST /team/{id}/webhook). `status`/`failCount` can be set by tests. */
export type FakeWebhook = { id: string; endpoint: string; events: string[]; spaceId: number | null; secret: string; status: string; failCount: number };

export function sampleData(): FakeData {
  const statuses = [
    { status: "to do", type: "open", color: "#87909e" },
    { status: "in progress", type: "custom", color: "#5f55ee" },
    { status: "wartet auf freigabe", type: "custom", color: "#f9d900" },
    { status: "complete", type: "closed", color: "#008844" },
  ];
  return {
    token: "pk_test_0000000000_FAKEFAKEFAKEFAKE1234",
    team: { id: "9001", name: "Beispiel GmbH" },
    members: [
      { id: 101, username: "Person A", email: "person.a@beispiel.example" },
      { id: 102, username: "Person B", email: "person.b@extern.example" },
    ],
    spaces: [
      {
        id: "s-1",
        name: "Marketing",
        statuses,
        folders: [{ id: "f-1", name: "Kampagnen", lists: [{ id: "l-1", name: "Frühjahr" }] }],
        lists: [{ id: "l-2", name: "Allgemein" }],
      },
      { id: "s-2", name: "Vertrieb", statuses, folders: [], lists: [{ id: "l-3", name: "Angebote" }] },
    ],
    tasks: [
      { id: "t-1", name: "Kampagne planen", status: "in progress", listId: "l-1", assignees: [101], priority: 2, tags: ["Planung"], updated: 1_760_000_000_000, due: 1_767_200_000_000, description: "Ziele **festlegen**", checklist: [{ name: "Budget", resolved: true }, { name: "Zeitplan", resolved: false }] },
      { id: "t-2", name: "Texte schreiben", status: "to do", listId: "l-1", parent: "t-1", assignees: [102], priority: 3, updated: 1_760_000_100_000 },
      { id: "t-3", name: "Korrektur lesen", status: "complete", statusType: "closed", listId: "l-1", parent: "t-2", priority: null, updated: 1_760_000_200_000 },
      { id: "t-4", name: "Newsletter", status: "wartet auf freigabe", listId: "l-2", priority: 1, milestone: true, updated: 1_760_000_300_000 },
      { id: "t-5", name: "Angebot Beispielkunde", status: "to do", listId: "l-3", priority: 4, updated: 1_760_000_400_000 },
    ],
    comments: {
      "t-1": [
        { id: "c-1", text: "Bitte bis Freitag", userId: 101, date: 1_760_000_050_000 },
        { id: "c-2", text: "Erledige ich", userId: 102, date: 1_760_000_060_000 },
      ],
    },
  };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): FakeResponse => ({ status, headers: { "content-type": "application/json", ...headers }, body });

export function createFakeClickUp(data: FakeData, options: FakeOptions = {}) {
  let requests = 0;
  const log: string[] = [];
  const webhooks: FakeWebhook[] = [];
  const pageSize = options.pageSize ?? 100;

  function listInfo(listId: string) {
    for (const s of data.spaces) {
      const folder = s.folders.find((f) => f.lists.some((l) => l.id === listId));
      if (folder) return { space: s, folder, list: folder.lists.find((l) => l.id === listId)! };
      const list = s.lists.find((l) => l.id === listId);
      if (list) return { space: s, folder: null, list };
    }
    return null;
  }

  function taskJson(t: FakeTask) {
    const info = listInfo(t.listId)!;
    const member = (id: number) => data.members.find((m) => m.id === id)!;
    const words = { 1: "urgent", 2: "high", 3: "normal", 4: "low" } as const;
    return {
      id: t.id,
      custom_id: null,
      name: t.name,
      text_content: t.description ?? "",
      markdown_description: t.description ?? "",
      status: { status: t.status, type: t.statusType ?? info.space.statuses.find((s) => s.status === t.status)?.type ?? "custom", color: "#87909e" },
      priority: t.priority ? { id: String(t.priority), priority: words[t.priority] } : null,
      assignees: (t.assignees ?? []).map(member).map((m) => ({ id: m.id, username: m.username, email: m.email })),
      tags: (t.tags ?? []).map((name) => ({ name })),
      parent: t.parent ?? null,
      date_created: String(t.created ?? t.updated - 1000),
      date_updated: String(t.updated),
      date_done: t.status === "complete" ? String(t.updated) : null,
      date_closed: null,
      due_date: t.due ? String(t.due) : null,
      url: `https://app.clickup.com/t/${t.id}`,
      list: { id: info.list.id, name: info.list.name },
      folder: info.folder ? { id: info.folder.id, name: info.folder.name, hidden: false } : { id: "hidden", name: "hidden", hidden: true },
      space: { id: info.space.id },
      custom_item_id: t.milestone ? 1 : null,
      checklists: t.checklist ? [{ name: "Checkliste", items: t.checklist }] : [],
    };
  }

  function handle(method: string, rawUrl: string, headers: Record<string, string | undefined>, body?: string): FakeResponse {
    requests++;
    const url = new URL(rawUrl);
    log.push(`${method} ${url.pathname}${url.search}`);
    if (options.rateLimitOn?.includes(requests)) return json(429, { err: "Rate limit reached" }, { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1) });
    if (headers.authorization !== data.token) return json(401, { err: "Token invalid", ECODE: "OAUTH_025" });
    const path = url.pathname.replace(/^.*\/api\/v2/, "");
    let m: RegExpExecArray | null;

    if (path === "/team") {
      return json(200, { teams: [{ id: data.team.id, name: data.team.name, color: "#000", avatar: null, members: data.members.map((u) => ({ user: u })) }] });
    }
    if ((m = /^\/team\/([^/]+)\/space$/.exec(path)) && m[1] === data.team.id) {
      return json(200, { spaces: data.spaces.map((s) => ({ id: s.id, name: s.name, private: false, statuses: s.statuses, multiple_assignees: true, features: {} })) });
    }
    if ((m = /^\/space\/([^/]+)\/folder$/.exec(path))) {
      const s = data.spaces.find((x) => x.id === m![1]);
      return s ? json(200, { folders: s.folders }) : json(404, { err: "not found" });
    }
    if ((m = /^\/space\/([^/]+)\/list$/.exec(path))) {
      const s = data.spaces.find((x) => x.id === m![1]);
      return s ? json(200, { lists: s.lists }) : json(404, { err: "not found" });
    }
    if ((m = /^\/team\/([^/]+)\/task$/.exec(path)) && m[1] === data.team.id) {
      const spaceIds = url.searchParams.getAll("space_ids[]");
      const listIds = url.searchParams.getAll("list_ids[]");
      const since = Number(url.searchParams.get("date_updated_gt") ?? 0);
      const page = Number(url.searchParams.get("page") ?? 0);
      const matching = data.tasks
        .filter((t) => {
          const info = listInfo(t.listId)!;
          return (!spaceIds.length || spaceIds.includes(info.space.id)) && (!listIds.length || listIds.includes(t.listId)) && t.updated > since;
        })
        .sort((a, b) => (a.created ?? a.updated) - (b.created ?? b.updated));
      return json(200, { tasks: matching.slice(page * pageSize, (page + 1) * pageSize).map(taskJson) });
    }
    if ((m = /^\/team\/([^/]+)\/webhook$/.exec(path)) && m[1] === data.team.id) {
      if (method === "GET") {
        return json(200, {
          webhooks: webhooks.map((w) => ({ id: w.id, endpoint: w.endpoint, events: w.events, space_id: w.spaceId, health: { status: w.status, fail_count: w.failCount }, secret: w.secret })),
        });
      }
      if (method === "POST") {
        let input: { endpoint?: unknown; events?: unknown; space_id?: unknown };
        try {
          input = JSON.parse(body ?? "") as typeof input;
        } catch {
          return json(400, { err: "Invalid JSON" });
        }
        if (typeof input.endpoint !== "string" || !Array.isArray(input.events) || !input.events.length) return json(400, { err: "Endpoint and events required" });
        const id = `wh-${webhooks.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
        const secret = `FAKESECRET${Math.random().toString(36).slice(2).toUpperCase()}`;
        const hook: FakeWebhook = { id, endpoint: input.endpoint, events: input.events.map(String), spaceId: typeof input.space_id === "number" ? input.space_id : null, secret, status: "active", failCount: 0 };
        webhooks.push(hook);
        return json(200, { id, webhook: { id, userid: 101, team_id: Number(data.team.id) || 0, endpoint: hook.endpoint, events: hook.events, space_id: hook.spaceId, health: { status: "active", fail_count: 0 }, secret } });
      }
    }
    if ((m = /^\/webhook\/([^/]+)$/.exec(path)) && method === "DELETE") {
      const i = webhooks.findIndex((w) => w.id === m![1]);
      if (i < 0) return json(404, { err: "Webhook not found" });
      webhooks.splice(i, 1);
      return json(200, {});
    }
    if ((m = /^\/task\/([^/]+)$/.exec(path))) {
      const t = data.tasks.find((x) => x.id === m![1]);
      return t ? json(200, taskJson(t)) : json(404, { err: "Task not found", ECODE: "ITEM_013" });
    }
    if ((m = /^\/task\/([^/]+)\/comment$/.exec(path))) {
      const all = [...(data.comments[m[1]!] ?? [])].sort((a, b) => b.date - a.date);
      const startId = url.searchParams.get("start_id");
      const from = startId ? all.findIndex((c) => c.id === startId) + 1 : 0;
      return json(200, {
        comments: all.slice(from, from + 25).map((c) => {
          const u = data.members.find((x) => x.id === c.userId)!;
          return { id: c.id, comment_text: c.text, user: { id: u.id, username: u.username, email: u.email }, date: String(c.date), resolved: false };
        }),
      });
    }
    return json(404, { err: "Route not found" });
  }

  /** A fetch implementation backed by this fake. */
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const h = new Headers(init?.headers);
    const res = handle(init?.method ?? "GET", url, { authorization: h.get("authorization") ?? undefined }, typeof init?.body === "string" ? init.body : undefined);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
  }) as typeof fetch;

  return { handle, fetch: fetchImpl, log, webhooks, requests: () => requests };
}
