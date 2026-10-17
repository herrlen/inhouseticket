import { rateLimit } from "@/lib/rate-limit";

/** Invitation mails per workspace and hour – protects the shared sender address. */
export const INVITE_MAILS_PER_HOUR = 100;
const HOUR_MS = 3_600_000;

/**
 * Counts `count` invitation mails against the workspace's hourly budget; false (nothing counted)
 * when they don't fit. Every path that sends invitations goes through here – the settings page
 * and the invitations entered while creating the workspace.
 */
export function takeInviteMails(workspaceId: string, count: number, now = Date.now()): boolean {
  if (count <= 0) return true;
  return rateLimit(`invite:${workspaceId}`, INVITE_MAILS_PER_HOUR, HOUR_MS, now, count).ok;
}
