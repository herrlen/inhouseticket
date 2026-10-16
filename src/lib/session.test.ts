import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getSessionMock = vi.fn();
const hasPasswordMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: (...a: unknown[]) => getSessionMock(...a) } } }));
vi.mock("@/db/queries/credentials", () => ({ userHasPassword: (id: string) => hasPasswordMock(id) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// redirect() throws in Next.js; the test records the target the same way.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
// React's cache() only dedupes inside a server request; outside it each call runs anew.
vi.mock("react", async () => ({ ...(await vi.importActual<typeof import("react")>("react")), cache: <T,>(fn: T) => fn }));

const { requireUser, safeNext } = await import("./session");

describe("safeNext", () => {
  it.each([
    ["/firma/settings", "/firma/settings"],
    ["/invite/abc", "/invite/abc"],
    [undefined, "/start"],
    ["https://evil.example", "/start"],
    ["//evil.example", "/start"],
    ["/\\evil.example", "/start"],
    ["javascript:alert(1)", "/start"],
  ])("%j → %j", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("requireUser – every account has a password", () => {
  const user = { id: "u1", email: "a@firma.de", name: "A" };
  beforeEach(() => {
    getSessionMock.mockReset();
    hasPasswordMock.mockReset();
  });

  it("sends signed-out visitors to the login page", async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireUser("/firma")).rejects.toThrow("REDIRECT /login?next=%2Ffirma");
  });

  it("sends a person without a password to the set-password page, keeping the target", async () => {
    getSessionMock.mockResolvedValue({ user });
    hasPasswordMock.mockResolvedValue(false);
    await expect(requireUser("/firma")).rejects.toThrow("REDIRECT /set-password?next=%2Ffirma");
    await expect(requireUser()).rejects.toThrow("REDIRECT /set-password");
    expect(hasPasswordMock).toHaveBeenCalledWith("u1");
  });

  it("lets the set-password page itself through", async () => {
    getSessionMock.mockResolvedValue({ user });
    hasPasswordMock.mockResolvedValue(false);
    await expect(requireUser("/set-password", { allowWithoutPassword: true })).resolves.toEqual(user);
    expect(hasPasswordMock).not.toHaveBeenCalled();
  });

  it("returns the user once a password is set", async () => {
    getSessionMock.mockResolvedValue({ user });
    hasPasswordMock.mockResolvedValue(true);
    await expect(requireUser("/firma")).resolves.toEqual(user);
  });
});
