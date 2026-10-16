import { describe, expect, it } from "vitest";
import { magicLinkConfirmUrl } from "./magic-link-url";

describe("magicLinkConfirmUrl", () => {
  it("points the mail at the confirm page and keeps token and targets", () => {
    const url = new URL(
      magicLinkConfirmUrl(
        "https://inhouseticket.com/api/auth/magic-link/verify?token=abc&callbackURL=%2Fstart&errorCallbackURL=%2Flogin%3Ferror%3Dlink",
      ),
    );
    expect(url.origin + url.pathname).toBe("https://inhouseticket.com/login/link");
    expect(url.searchParams.get("token")).toBe("abc");
    expect(url.searchParams.get("callbackURL")).toBe("/start");
    expect(url.searchParams.get("errorCallbackURL")).toBe("/login?error=link");
  });
});
