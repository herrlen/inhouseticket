// Single source of truth for all product limits (CLAUDE.md, rule 2).
// Mirrored by DB constraints/triggers – change both together.

export const MAX_USERS_PER_WORKSPACE = 100;
/** From this many active users on, the owner sees a warning. */
export const USER_WARNING_THRESHOLD = 90;

export const MAX_TITLE = 500;
export const MAX_DESCRIPTION = 5000;
export const MAX_COMMENT = 5000;
export const MAX_FILE_NAME = 255;

/** Subtasks per ticket; only one level deep. */
export const MAX_SUBTASKS = 5;

export const MAX_ATTACHMENT_BYTES = 100 * 1024;
/** Protects storage of the free service; not part of KONZEPT, set 2026-10-04. */
export const MAX_ATTACHMENTS_PER_TICKET = 20;
export const ALLOWED_MIME = ["image/webp", "image/jpeg", "image/png"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export const MAX_PROJECT_KEY = 10;
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/** Password length (Better Auth enforces the same values, see src/lib/auth.ts). Set 2026-10-16. */
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

/**
 * Automatic sign-in link after a failed password sign-in of an account without a password
 * (Len, 2026-10-17): at most one mail per address in this window.
 */
export const NO_PASSWORD_LINKS_PER_EMAIL = 1;
export const NO_PASSWORD_LINK_WINDOW_MS = 15 * 60_000;

/**
 * Self-chosen name of a dynamically registered OAuth client (connector). Longer names are cut at
 * registration and on the consent page – a long name could push the redirect host out of view.
 * Set 2026-10-17 (security review).
 */
export const MAX_OAUTH_CLIENT_NAME = 60;
