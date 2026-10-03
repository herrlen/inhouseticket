// Single source of truth for all product limits (CLAUDE.md, rule 2).
// Mirrored by DB constraints/triggers – change both together.

export const MAX_USERS_PER_WORKSPACE = 100;
/** From this many active users on, the owner sees a warning. */
export const USER_WARNING_THRESHOLD = 90;

export const MAX_TITLE = 500;
export const MAX_DESCRIPTION = 5000;
export const MAX_COMMENT = 5000;

/** Subtasks per ticket; only one level deep. */
export const MAX_SUBTASKS = 5;

export const MAX_ATTACHMENT_BYTES = 100 * 1024;
export const ALLOWED_MIME = ["image/webp", "image/jpeg", "image/png"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MAX_PROJECT_KEY = 10;
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
