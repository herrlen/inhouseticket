import { describe, expect, it } from "vitest";
import { INVITE_MAILS_PER_HOUR, takeInviteMails } from "./invite-limit";

describe("takeInviteMails", () => {
  it("shares one hourly budget between onboarding and settings invitations", () => {
    const ws = `ws-${Math.random()}`;
    const now = Date.now();
    expect(takeInviteMails(ws, 50, now)).toBe(true); // onboarding
    expect(takeInviteMails(ws, INVITE_MAILS_PER_HOUR - 50, now + 1000)).toBe(true); // settings
    expect(takeInviteMails(ws, 1, now + 2000)).toBe(false);
    expect(takeInviteMails(ws, 1, now + 3_600_001)).toBe(true); // next hour
  });

  it("does not count an empty batch", () => {
    const ws = `ws-${Math.random()}`;
    expect(takeInviteMails(ws, 0)).toBe(true);
    expect(takeInviteMails(ws, INVITE_MAILS_PER_HOUR)).toBe(true);
  });
});
