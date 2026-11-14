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
 * Sign-in link requested for an address without an account (Len, 2026-10-19): instead of a link,
 * a hint to register – at most one mail per address in this window.
 */
export const NO_ACCOUNT_MAILS_PER_EMAIL = 1;
export const NO_ACCOUNT_MAIL_WINDOW_MS = 15 * 60_000;
/** Longest address the registration page takes over from its query (RFC 5321 path limit). */
export const MAX_EMAIL = 254;

/**
 * Self-chosen name of a dynamically registered OAuth client (connector). Longer names are cut at
 * registration and on the consent page – a long name could push the redirect host out of view.
 * Set 2026-10-17 (security review).
 */
export const MAX_OAUTH_CLIENT_NAME = 60;

/** Display name of a person (registration and the name suggested from the address). */
export const MAX_NAME = 100;

/**
 * Registration with name, address and password (Len, 2026-10-18, ADR 005): the account only
 * exists after the confirmation link. The pending registration lives this long.
 */
export const REGISTRATION_TTL_MS = 24 * 60 * 60_000;
/** Wrong passwords on the confirm page before the link is dead (the person registers again). */
export const MAX_REGISTRATION_ATTEMPTS = 5;
/** Registration requests per IP and per address (mails to one inbox) in this window. */
export const REGISTRATIONS_PER_IP = 10;
export const REGISTRATIONS_PER_EMAIL = 3;
export const REGISTRATION_WINDOW_MS = 15 * 60_000;
/** "You already have an account" mails per address and window (silently skipped above). */
export const ACCOUNT_EXISTS_MAILS_PER_EMAIL = 1;
/** Confirm attempts per IP and window, on top of the per-link counter. */
export const REGISTRATION_CONFIRMS_PER_IP = 20;
/** Longest stored continuation path (e.g. a connector's OAuth authorize URL). */
export const MAX_NEXT_PATH = 2000;

/** Onboarding wizard (docs/ONBOARDING.md §3): free text for "Woher kennst du uns? – Andere". */
export const MAX_SOURCE_OTHER = 100;
/** IANA time zone name, e.g. "America/Argentina/Buenos_Aires" (stored in user.timezone). */
export const MAX_TIMEZONE = 64;
/** Addresses in one paste of the wizard's invite step (the seat limit above still applies). */
export const MAX_INVITES_PER_STEP = 50;

/**
 * ClickUp CSV import (workspace export, 2026-11-14): a real export had 12.8 MB and 17,806 rows;
 * these leave room for larger teams. The file waits in Postgres (`import_upload`) until the
 * background run is through, at most IMPORT_UPLOAD_TTL_MS. Other tools keep their own, smaller
 * limits in src/lib/import/plan.ts (one project, written in one transaction).
 */
export const MAX_CLICKUP_CSV_BYTES = 50 * 1024 * 1024;
export const MAX_CLICKUP_CSV_ROWS = 50_000;
export const IMPORT_UPLOAD_TTL_MS = 24 * 60 * 60_000;
