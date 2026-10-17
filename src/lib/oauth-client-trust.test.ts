import { describe, expect, it } from "vitest";
import { MAX_OAUTH_CLIENT_NAME } from "./limits";
import { consentRedirectUri, redirectTrust, sanitizeClientName } from "./oauth-client-trust";

describe("redirectTrust", () => {
  it.each([
    ["https://claude.ai/api/mcp/auth_callback", { host: "claude.ai", kind: "known" }],
    ["https://claude.com/api/mcp/auth_callback", { host: "claude.com", kind: "known" }],
    ["http://localhost:6274/oauth/callback", { host: "localhost:6274", kind: "loopback" }],
    ["http://127.0.0.1:33418/callback", { host: "127.0.0.1:33418", kind: "loopback" }],
    ["http://[::1]:8080/cb", { host: "[::1]:8080", kind: "loopback" }],
    // Look-alikes and variants of the known hosts are unknown.
    ["https://claude.ai.evil.example/cb", { host: "claude.ai.evil.example", kind: "unknown" }],
    ["https://evil-claude.ai/cb", { host: "evil-claude.ai", kind: "unknown" }],
    ["https://x.claude.ai/cb", { host: "x.claude.ai", kind: "unknown" }],
    ["http://claude.ai/cb", { host: "claude.ai", kind: "unknown" }],
    ["https://claude.ai:8443/cb", { host: "claude.ai:8443", kind: "unknown" }],
    ["https://user@evil.example/cb", { host: "evil.example", kind: "unknown" }],
    ["cursor://anysphere.cursor-mcp/oauth/callback", { host: "cursor://anysphere.cursor-mcp", kind: "unknown" }],
  ])("%s", (uri, expected) => {
    expect(redirectTrust(uri)).toEqual(expected);
  });

  it("rejects missing and relative URIs", () => {
    expect(redirectTrust(null)).toBeNull();
    expect(redirectTrust("")).toBeNull();
    expect(redirectTrust("/callback")).toBeNull();
  });
});

describe("consentRedirectUri", () => {
  const registered = ["https://claude.ai/api/mcp/auth_callback", "https://evil.example/cb"];
  it("takes the requested URI only if it is registered", () => {
    expect(consentRedirectUri("https://evil.example/cb", registered)).toBe("https://evil.example/cb");
    expect(consentRedirectUri("https://other.example/cb", registered)).toBeNull();
  });
  it("falls back to the only registered URI", () => {
    expect(consentRedirectUri(null, ["https://claude.ai/api/mcp/auth_callback"])).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(consentRedirectUri(null, registered)).toBeNull();
  });
});

describe("sanitizeClientName", () => {
  it("keeps ordinary names", () => {
    expect(sanitizeClientName("Claude")).toBe("Claude");
    expect(sanitizeClientName("  MCP   Inspector ")).toBe("MCP Inspector");
  });
  it("strips control and bidi characters", () => {
    expect(sanitizeClientName("Cla\u0000ude\n‮evil")).toBe("Cla ude evil");
  });
  it(`cuts names at ${MAX_OAUTH_CLIENT_NAME} characters`, () => {
    const cut = sanitizeClientName(`Claude ${"x".repeat(200)}`);
    expect(Array.from(cut ?? "").length).toBe(MAX_OAUTH_CLIENT_NAME);
    expect(cut?.endsWith("…")).toBe(true);
  });
  it("returns undefined for empty or non-string names", () => {
    expect(sanitizeClientName("   ")).toBeUndefined();
    expect(sanitizeClientName(42)).toBeUndefined();
  });
});
