import { describe, expect, it } from "vitest";
import { canChangeRole, canInviteAs, canRemove } from "./member-permissions";

const owner = { role: "owner" as const, userId: "o" };
const admin = { role: "admin" as const, userId: "a" };
const admin2 = { role: "admin" as const, userId: "a2" };
const member = { role: "member" as const, userId: "m" };

describe("canChangeRole", () => {
  it("lets only the owner change roles of others", () => {
    expect(canChangeRole(owner, admin)).toBe(true);
    expect(canChangeRole(owner, member)).toBe(true);
    expect(canChangeRole(admin, member)).toBe(false);
    expect(canChangeRole(member, member)).toBe(false);
  });

  it("never touches the owner or oneself", () => {
    expect(canChangeRole(owner, owner)).toBe(false);
    expect(canChangeRole(admin, owner)).toBe(false);
  });
});

describe("canRemove", () => {
  it("owner removes admins and members", () => {
    expect(canRemove(owner, admin)).toBe(true);
    expect(canRemove(owner, member)).toBe(true);
  });

  it("admins remove members but not other admins or the owner", () => {
    expect(canRemove(admin, member)).toBe(true);
    expect(canRemove(admin, admin2)).toBe(false);
    expect(canRemove(admin, owner)).toBe(false);
  });

  it("members remove nobody, nobody removes themselves", () => {
    expect(canRemove(member, { role: "member", userId: "x" })).toBe(false);
    expect(canRemove(admin, admin)).toBe(false);
  });
});

describe("canInviteAs", () => {
  it.each([
    ["owner", "admin", true],
    ["owner", "member", true],
    ["admin", "member", true],
    ["admin", "admin", false],
    ["member", "member", false],
  ] as const)("%s inviting %s → %s", (actor, role, ok) => {
    expect(canInviteAs(actor, role)).toBe(ok);
  });
});
