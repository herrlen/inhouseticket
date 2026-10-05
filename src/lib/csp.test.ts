import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

describe("contentSecurityPolicy", () => {
  it("allows only nonce scripts and forbids framing in production", () => {
    const csp = contentSecurityPolicy("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("never combines a style nonce with 'unsafe-inline' (browsers would ignore the latter)", () => {
    expect(contentSecurityPolicy("abc", false)).toMatch(/style-src 'self' 'unsafe-inline'(;|$)/);
  });

  it("allows eval and websockets only in development", () => {
    const csp = contentSecurityPolicy("abc", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
