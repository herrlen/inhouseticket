import { describe, expect, it } from "vitest";
import { RateLimiter, type Clock } from "../rate-limiter";
import { ConnectorError, type ExternalComment, type PullPage } from "../types";
import { buildUrl } from "./client";
import { clickUpDate, ClickUpConnector, pullQueries, toExternalTask } from "./connector";
import { createFakeClickUp, sampleData, type FakeData } from "./fake";

function setup(data: FakeData = sampleData(), rateLimitOn?: number[], token = data.token) {
  const fake = createFakeClickUp(data, { rateLimitOn });
  let now = Date.now();
  const waits: number[] = [];
  const clock: Clock = { now: () => now, sleep: async (ms) => void (waits.push(ms), (now += ms)) };
  const connector = new ClickUpConnector({ token, baseUrl: "https://clickup.test/api/v2", fetch: fake.fetch, clock, limiter: new RateLimiter(90, clock) });
  return { fake, connector, waits, data };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe("ClickUp connector", () => {
  it("builds query strings with repeated array brackets", () => {
    expect(buildUrl("https://x/api/v2", "/team/1/task", { list_ids: ["a", "b"], page: 0, include_closed: true, since: undefined })).toBe(
      "https://x/api/v2/team/1/task?list_ids%5B%5D=a&list_ids%5B%5D=b&page=0&include_closed=true",
    );
  });

  it("tests the token and lists the workspace with its people", async () => {
    const { connector } = setup();
    expect(await connector.testConnection()).toEqual({ accounts: [{ id: "9001", name: "Beispiel GmbH" }] });
    expect(await connector.listPeople("9001")).toEqual([
      { id: "101", name: "Person A", email: "person.a@beispiel.example" },
      { id: "102", name: "Person B", email: "person.b@extern.example" },
    ]);
  });

  it("answers a wrong token with unauthorized – without the token in the error", async () => {
    const { connector } = setup(sampleData(), undefined, "pk_wrong_token_0000");
    const error = await connector.testConnection().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectorError);
    expect((error as ConnectorError).code).toBe("unauthorized");
    expect(String((error as Error).message)).not.toContain("pk_");
  });

  it("lists spaces, folders and lists as a tree", async () => {
    const { connector, fake } = setup();
    const tree = await connector.listContainers("9001");
    expect(tree.map((s) => [s.name, s.children.map((c) => `${c.kind}:${c.name}:${c.children.map((l) => l.name).join("|")}`)])).toEqual([
      ["Marketing", ["folder:Kampagnen:Frühjahr", "list:Allgemein:"]],
      ["Vertrieb", ["list:Angebote:"]],
    ]);
    expect(tree[0]!.statuses!.map((s) => s.name)).toContain("wartet auf freigabe");
    const before = fake.requests();
    const shallow = await connector.listContainers("9001", { shallow: true });
    expect(shallow.map((s) => s.children.length)).toEqual([0, 0]);
    expect(fake.requests() - before).toBe(1);
  });

  it("pages through tasks (100 per page) with the filters the reference names", async () => {
    const data = sampleData();
    data.tasks = Array.from({ length: 230 }, (_, i) => ({ id: `t-${i}`, name: `Aufgabe ${i}`, status: "to do", listId: "l-1", updated: 1_760_000_000_000 + i }));
    const { connector, fake } = setup(data);
    const pages: PullPage[] = await collect(connector.pull({ accountId: "9001", spaceIds: ["s-1"], listIds: [] }));
    expect(pages.map((p) => [p.page, p.tasks.length, p.last])).toEqual([[0, 100, false], [1, 100, false], [2, 30, true]]);
    const first = fake.log.find((l) => l.includes("/task?"))!;
    expect(first).toContain("space_ids%5B%5D=s-1");
    expect(first).toContain("include_closed=true");
    expect(first).toContain("subtasks=true");
    expect(first).not.toContain("date_updated_gt");
  });

  it("sends the delta and resumes at a page", async () => {
    const data = sampleData();
    const { connector, fake } = setup(data);
    const pages = await collect(connector.pull({ accountId: "9001", spaceIds: [], listIds: ["l-1", "l-3"] }, { since: new Date(1_760_000_150_000), startPage: 0 }));
    expect(pages.flatMap((p) => p.tasks.map((t) => t.id))).toEqual(["t-3", "t-5"]);
    expect(fake.log.at(-1)).toContain("date_updated_gt=1760000150000");
    const resumed = await collect(connector.pull({ accountId: "9001", spaceIds: ["s-1"], listIds: ["l-3"] }, { startQuery: 1, startPage: 0 }));
    expect(resumed.map((p) => p.query)).toEqual([1]);
  });

  it("waits on 429 until the reset and then goes on", async () => {
    const { connector, waits } = setup(sampleData(), [1]);
    expect((await connector.testConnection()).accounts).toHaveLength(1);
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
  });

  it("gives up after repeated 429 with rate_limited", async () => {
    const { connector } = setup(sampleData(), [1, 2, 3, 4, 5]);
    await expect(connector.testConnection()).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("maps a task: priority 1–4 → 4–1, first assignee, labels, dates, milestone", async () => {
    const { connector } = setup();
    const [page] = await collect(connector.pull({ accountId: "9001", spaceIds: ["s-1", "s-2"], listIds: [] }));
    const byId = new Map(page!.tasks.map((t) => [t.id, t]));
    expect(byId.get("t-1")).toMatchObject({ priority: 3, parentId: null, folderName: "Kampagnen", listName: "Frühjahr", description: "Ziele **festlegen**", tags: ["Planung"] });
    expect(byId.get("t-1")!.assignees[0]!.email).toBe("person.a@beispiel.example");
    expect(byId.get("t-2")).toMatchObject({ priority: 2, parentId: "t-1" });
    expect(byId.get("t-3")).toMatchObject({ priority: 0, status: { name: "complete", type: "closed" } });
    expect(byId.get("t-3")!.doneAt).toBeInstanceOf(Date);
    expect(byId.get("t-4")).toMatchObject({ priority: 4, milestone: true, folderName: null });
    expect(byId.get("t-5")).toMatchObject({ priority: 1 });
  });

  it("reads comments newest first over several pages", async () => {
    const data = sampleData();
    data.comments["t-1"] = Array.from({ length: 30 }, (_, i) => ({ id: `c-${i}`, text: `Kommentar ${i}`, userId: 101, date: 1_760_000_000_000 + i }));
    const { connector } = setup(data);
    const comments: ExternalComment[] = await collect(connector.pullComments("t-1"));
    expect(comments).toHaveLength(30);
    expect(new Set(comments.map((c) => c.id)).size).toBe(30);
    expect(comments[0]).toMatchObject({ id: "c-29", body: "Kommentar 29", author: { id: "101" } });
  });

  it("parses dates and odd payloads without throwing", () => {
    expect(clickUpDate("1760000000000")?.toISOString()).toBe("2025-10-09T08:53:20.000Z");
    expect(clickUpDate("1760000000")?.toISOString()).toBe("2025-10-09T08:53:20.000Z");
    expect(clickUpDate(null)).toBeNull();
    expect(clickUpDate("null")).toBeNull();
    expect(toExternalTask({})).toBeNull();
    expect(toExternalTask({ id: "x", url: "javascript:alert(1)" })).toMatchObject({ id: "x", title: "", url: null, priority: 0 });
  });

  it("splits large selections into stable queries", () => {
    const q = pullQueries({ accountId: "1", spaceIds: ["b", "a", "a"], listIds: Array.from({ length: 25 }, (_, i) => `l${i}`) });
    expect(q[0]).toEqual({ space_ids: ["a", "b"] });
    expect(q.slice(1).map((x) => x.list_ids!.length)).toEqual([20, 5]);
  });
});
