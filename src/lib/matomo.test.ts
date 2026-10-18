import { beforeEach, describe, expect, it, vi } from "vitest";

const requestHeaders = new Headers();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => fn() }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://inhouseticket.com", MATOMO_URL: "https://analytics.example", MATOMO_SITE_ID: "4", MATOMO_TOKEN: "secret" },
}));

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
vi.stubGlobal("fetch", fetchMock);
const { trackServerEvent } = await import("./matomo");

beforeEach(() => {
  fetchMock.mockClear();
  for (const key of [...requestHeaders.keys()]) requestHeaders.delete(key);
  requestHeaders.set("x-forwarded-for", "203.0.113.77, 10.0.0.1");
  requestHeaders.set("user-agent", "Mozilla/5.0");
});

const sentBody = () => new URLSearchParams(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));

describe("trackServerEvent", () => {
  it("forwards the event with normalised URL and truncated IP", async () => {
    await trackServerEvent({ category: "Team", action: "Member invited", name: "onboarding", value: 3, path: "/acme/settings/members" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = sentBody();
    expect(body.get("e_c")).toBe("Team");
    expect(body.get("e_a")).toBe("Member invited");
    expect(body.get("e_n")).toBe("onboarding");
    expect(body.get("e_v")).toBe("3");
    expect(body.get("url")).toBe("https://inhouseticket.com/:id/settings/members");
    expect(body.get("cip")).toBe("203.0.0.0");
    expect(body.get("idsite")).toBe("4");
  });

  it("respects Do Not Track", async () => {
    requestHeaders.set("dnt", "1");
    await trackServerEvent({ category: "Workspace", action: "Created", path: "/onboarding" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Global Privacy Control", "sec-gpc", "1"],
    ["the opt-out cookie", "cookie", "lang=en; iht_optout=1"],
  ])("respects %s", async (_, header, value) => {
    requestHeaders.set(header, value);
    await trackServerEvent({ category: "Workspace", action: "Created", path: "/onboarding" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
