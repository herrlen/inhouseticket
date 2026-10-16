import { describe, expect, it } from "vitest";
import { changePasswordSchema, fieldErrors, newPasswordSchema, resetPasswordSchema, setPasswordSchema } from "./password";

describe("newPasswordSchema", () => {
  it("accepts 10 to 128 characters and keeps spaces", () => {
    expect(newPasswordSchema.parse(" zehn zeichen ")).toBe(" zehn zeichen ");
    expect(newPasswordSchema.safeParse("x".repeat(128)).success).toBe(true);
  });

  it("rejects too short and too long with German messages", () => {
    expect(newPasswordSchema.safeParse("neun-zchn").error?.issues[0]?.message).toBe("Mindestens 10 Zeichen.");
    expect(newPasswordSchema.safeParse("x".repeat(129)).error?.issues[0]?.message).toBe("Höchstens 128 Zeichen.");
    expect(newPasswordSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("setPasswordSchema", () => {
  it("requires the confirmation to match", () => {
    expect(setPasswordSchema.safeParse({ password: "ein-langes-passwort", confirm: "ein-langes-passwort" }).success).toBe(true);
    const r = setPasswordSchema.safeParse({ password: "ein-langes-passwort", confirm: "anders" });
    expect(r.success).toBe(false);
    expect(fieldErrors(r.error!)).toEqual({ confirm: "Die Passwörter stimmen nicht überein." });
  });
});

describe("resetPasswordSchema", () => {
  it("needs a token", () => {
    const r = resetPasswordSchema.safeParse({ token: "", password: "ein-langes-passwort", confirm: "ein-langes-passwort" });
    expect(fieldErrors(r.error!)).toEqual({ token: "Ungültiger Link." });
    expect(resetPasswordSchema.safeParse({ token: "abc", password: "ein-langes-passwort", confirm: "ein-langes-passwort" }).success).toBe(true);
  });
});

describe("changePasswordSchema", () => {
  it("requires the current password and a different new one", () => {
    expect(fieldErrors(changePasswordSchema.safeParse({ current: "", password: "ein-langes-passwort", confirm: "ein-langes-passwort" }).error!)).toEqual({
      current: "Bitte das aktuelle Passwort eingeben.",
    });
    expect(
      fieldErrors(changePasswordSchema.safeParse({ current: "ein-langes-passwort", password: "ein-langes-passwort", confirm: "ein-langes-passwort" }).error!),
    ).toEqual({ password: "Das neue Passwort muss sich vom aktuellen unterscheiden." });
    expect(changePasswordSchema.safeParse({ current: "altes-passwort", password: "ein-langes-passwort", confirm: "ein-langes-passwort" }).success).toBe(true);
  });
});
