import { describe, expect, it } from "vitest";
import { checkNewPassword, setPasswordUrl } from "./password-gate";

describe("setPasswordUrl", () => {
  it("keeps the target as next, omits the default", () => {
    expect(setPasswordUrl("/start")).toBe("/set-password");
    expect(setPasswordUrl("/firma/settings/account")).toBe("/set-password?next=%2Ffirma%2Fsettings%2Faccount");
    expect(setPasswordUrl("/api/auth/oauth2/authorize?client_id=a&x=1")).toBe(
      "/set-password?next=%2Fapi%2Fauth%2Foauth2%2Fauthorize%3Fclient_id%3Da%26x%3D1",
    );
  });
});

describe("checkNewPassword", () => {
  it("requires 10 to 128 characters and a matching confirmation", () => {
    expect(checkNewPassword("123456789", "123456789")).toBe("tooShort");
    expect(checkNewPassword("x".repeat(129), "x".repeat(129))).toBe("tooLong");
    expect(checkNewPassword("lang-genug-1", "lang-genug-2")).toBe("mismatch");
    expect(checkNewPassword("lang-genug-1", "lang-genug-1")).toBeNull();
    expect(checkNewPassword("x".repeat(128), "x".repeat(128))).toBeNull();
  });
});
