// Database schema – see docs/KONZEPT.md §6 and docs/adr/001-datenmodell.md.
// Column names are snake_case in Postgres (drizzle `casing: "snake_case"`), camelCase in TS.
// Every tenant table carries `workspaceId`; children reference their parent via
// (id, workspace_id) so a row can never point into another workspace.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_COMMENT,
  MAX_DESCRIPTION,
  MAX_NAME,
  MAX_NEXT_PATH,
  MAX_PROJECT_KEY,
  MAX_REGISTRATION_ATTEMPTS,
  MAX_SOURCE_OTHER,
  MAX_TIMEZONE,
  MAX_TITLE,
} from "../lib/limits";
import { PREVIOUS_TOOLS, SOURCES, TEAM_TYPES, VIEWS } from "../lib/onboarding/options";

/** `col IN ('a', 'b', …)` for CHECK constraints from a constant list (no user input). */
const oneOf = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Auth (Better Auth core tables – field names must match Better Auth)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  /** Avatar URL (KONZEPT: avatar_url). */
  image: text(),
  /** IANA time zone from the onboarding profile step (browser's Intl value, changeable). */
  timezone: varchar({ length: MAX_TIMEZONE }).notNull().default("Europe/Berlin"),
  /** Set when the person finished (or postponed) the onboarding wizard; null → /onboarding. */
  onboardedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Workspace & membership
// ---------------------------------------------------------------------------

/**
 * Registration with name, address and password that is not confirmed yet (ADR 005). No user
 * exists until the link in the mail is opened and the same password is entered again. One row per
 * address – a new registration replaces the older one. Token and password only as hashes.
 */
export const pendingRegistration = pgTable(
  "pending_registration",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    name: text().notNull(),
    /** Better Auth's scrypt hash, moved into the credential account on confirmation. */
    passwordHash: text().notNull(),
    /** SHA-256 of the link token. */
    tokenHash: text().notNull().unique(),
    /** Same-origin path to continue to after confirmation (invitation, connector login). */
    next: text(),
    failedAttempts: smallint().notNull().default(0),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.expiresAt),
    check("pending_registration_email_lower", sql`${t.email} = lower(${t.email})`),
    check("pending_registration_name_len", sql`char_length(${t.name}) between 1 and ${sql.raw(String(MAX_NAME))}`),
    check("pending_registration_next_len", sql`${t.next} is null or char_length(${t.next}) <= ${sql.raw(String(MAX_NEXT_PATH))}`),
    check("pending_registration_attempts", sql`${t.failedAttempts} between 0 and ${sql.raw(String(MAX_REGISTRATION_ATTEMPTS))}`),
  ],
);

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const memberStatus = pgEnum("member_status", ["active", "invited", "disabled"]);

export const workspace = pgTable("workspace", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 100 }).notNull(),
  /** Verified company e-mail domain, lowercase. One workspace per domain. */
  domain: varchar({ length: 253 }).notNull().unique(),
  /** URL segment, e.g. "firma" for /firma/… */
  slug: varchar({ length: 63 }).notNull().unique(),
  color: varchar({ length: 7 }).notNull().default("#5B5BF7"),
  autoJoin: boolean().notNull().default(false),
  /** Weighted open-ticket score from which a person counts as overloaded (dashboard). */
  workloadThreshold: smallint().notNull().default(12),
  /** Set by the platform operator (/admin): members, API tokens and digests are shut out. */
  lockedAt: timestamp({ withTimezone: true }),
  /** Team area chosen in the onboarding wizard (step 3) – decides the project template. */
  teamType: text(),
  /** Set when the owner finished the wizard (template project created); null → banner. */
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  check("workspace_slug_format", sql`${t.slug} ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'`),
  check("workspace_team_type", sql`${t.teamType} is null or ${t.teamType} in (${oneOf(TEAM_TYPES)})`),
]);

export const membership = pgTable(
  "membership",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole().notNull().default("member"),
    status: memberStatus().notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.workspaceId, t.userId), index().on(t.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: memberRole().notNull().default("member"),
    tokenHash: text().notNull().unique(),
    invitedBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.workspaceId, t.email)],
);

// ---------------------------------------------------------------------------
// Explorer: folders & projects
// ---------------------------------------------------------------------------

export const folder = pgTable(
  "folder",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: varchar({ length: 100 }).notNull(),
    sort: text().notNull(),
  },
  (t) => [unique().on(t.id, t.workspaceId)],
);

export const project = pgTable(
  "project",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    folderId: uuid(),
    name: varchar({ length: 100 }).notNull(),
    /** Ticket key prefix, e.g. "MKT". Fixed after creation. */
    key: varchar({ length: MAX_PROJECT_KEY }).notNull(),
    color: varchar({ length: 7 }).notNull(),
    icon: varchar({ length: 16 }),
    /** Last issued ticket number; incremented atomically. */
    ticketSeq: integer().notNull().default(0),
    sort: text().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.workspaceId, t.key),
    unique().on(t.id, t.workspaceId),
    // FK (folder_id, workspace_id) → folder with ON DELETE SET NULL (folder_id)
    // lives in the custom migration – drizzle cannot express column-list SET NULL.
    check("project_key_format", sql`${t.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`),
    check("project_color_format", sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const statusCategory = pgEnum("status_category", ["open", "active", "done"]);

export const status = pgTable(
  "status",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid().notNull(),
    projectId: uuid().notNull(),
    name: varchar({ length: 50 }).notNull(),
    color: varchar({ length: 7 }).notNull(),
    category: statusCategory().notNull(),
    sort: text().notNull(),
    wipLimit: smallint(),
  },
  (t) => [
    unique().on(t.id, t.projectId),
    foreignKey({
      columns: [t.projectId, t.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("cascade"),
    check("status_wip_limit_positive", sql`${t.wipLimit} IS NULL OR ${t.wipLimit} > 0`),
  ],
);

export const label = pgTable(
  "label",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid().notNull(),
    projectId: uuid().notNull(),
    name: varchar({ length: 50 }).notNull(),
    color: varchar({ length: 7 }).notNull(),
  },
  (t) => [
    unique().on(t.projectId, t.name),
    unique().on(t.id, t.projectId),
    foreignKey({
      columns: [t.projectId, t.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("cascade"),
  ],
);

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

/** Hierarchy like Jira – rules in src/lib/ticket-hierarchy.ts and the trigger enforce_ticket_hierarchy. */
export const ticketType = pgEnum("ticket_type", ["epic", "story", "task", "subtask"]);

export const ticket = pgTable(
  "ticket",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid().notNull(),
    projectId: uuid().notNull(),
    number: integer().notNull(),
    type: ticketType().notNull().default("task"),
    /**
     * Parent ticket in the same project. The FK (parent_id, project_id) → ticket (id, project_id) is
     * DEFERRABLE and lives in the custom migration 0015 together with the hierarchy and delete
     * triggers (deleting a ticket deletes its subtasks and detaches stories/tasks of a deleted epic).
     */
    parentId: uuid(),
    title: varchar({ length: MAX_TITLE }).notNull(),
    description: varchar({ length: MAX_DESCRIPTION }),
    statusId: uuid().notNull(),
    /** 0 = none, 1 = low, 2 = medium, 3 = high, 4 = urgent. */
    priority: smallint().notNull().default(0),
    assigneeId: text().references(() => user.id, { onDelete: "set null" }),
    dueAt: timestamp({ withTimezone: true }),
    /** Fractional index for manual ordering. */
    sort: text().notNull(),
    createdBy: text()
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: timestamp({ withTimezone: true }),
    search: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('german'::regconfig, coalesce(title, '')), 'A') || setweight(to_tsvector('german'::regconfig, coalesce(description, '')), 'B')`,
    ),
  },
  (t) => [
    unique().on(t.projectId, t.number),
    unique().on(t.id, t.workspaceId),
    unique().on(t.id, t.projectId),
    foreignKey({
      columns: [t.projectId, t.workspaceId],
      foreignColumns: [project.id, project.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.statusId, t.projectId],
      foreignColumns: [status.id, status.projectId],
    }),
    check("ticket_priority_range", sql`${t.priority} BETWEEN 0 AND 4`),
    check("ticket_title_not_blank", sql`btrim(${t.title}) <> ''`),
    index().on(t.workspaceId, t.projectId, t.statusId),
    index().on(t.assigneeId, t.dueAt),
    index().on(t.parentId),
    check("ticket_parent_not_self", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
    index("ticket_search_idx").using("gin", t.search),
  ],
);

/** Ticket and label must belong to the same project (enforced by both composite FKs). */
export const ticketLabel = pgTable(
  "ticket_label",
  {
    ticketId: uuid().notNull(),
    labelId: uuid().notNull(),
    projectId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ticketId, t.labelId] }),
    foreignKey({
      columns: [t.ticketId, t.projectId],
      foreignColumns: [ticket.id, ticket.projectId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.labelId, t.projectId],
      foreignColumns: [label.id, label.projectId],
    }).onDelete("cascade"),
    index().on(t.labelId),
  ],
);

export const subtask = pgTable(
  "subtask",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid().notNull(),
    ticketId: uuid().notNull(),
    title: varchar({ length: MAX_TITLE }).notNull(),
    done: boolean().notNull().default(false),
    assigneeId: text().references(() => user.id, { onDelete: "set null" }),
    dueAt: timestamp({ withTimezone: true }),
    sort: text().notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.workspaceId],
      foreignColumns: [ticket.id, ticket.workspaceId],
    }).onDelete("cascade"),
    index().on(t.ticketId),
  ],
);

export const attachment = pgTable(
  "attachment",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid().notNull(),
    ticketId: uuid().notNull(),
    /** Stable public id for URLs (attachments live in Postgres, see ADR 002). */
    key: text().notNull().unique(),
    fileName: varchar({ length: 255 }).notNull(),
    /** Image bytes (≤ MAX_ATTACHMENT_BYTES). Never selected in list queries. */
    data: bytea().notNull(),
    mime: varchar({ length: 32 }).notNull(),
    bytes: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    uploadedBy: text()
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.workspaceId],
      foreignColumns: [ticket.id, ticket.workspaceId],
    }).onDelete("cascade"),
    check(
      "attachment_bytes_limit",
      sql`${t.bytes} > 0 AND ${t.bytes} <= ${sql.raw(String(MAX_ATTACHMENT_BYTES))}`,
    ),
    check("attachment_mime_allowed", sql`${t.mime} IN ('image/webp', 'image/jpeg', 'image/png')`),
    index().on(t.ticketId),
  ],
);

export const comment = pgTable(
  "comment",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid().notNull(),
    ticketId: uuid().notNull(),
    authorId: text()
      .notNull()
      .references(() => user.id),
    body: varchar({ length: MAX_COMMENT }).notNull(),
    createdAt: createdAt(),
    editedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.ticketId, t.workspaceId],
      foreignColumns: [ticket.id, ticket.workspaceId],
    }).onDelete("cascade"),
    index().on(t.ticketId, t.createdAt),
  ],
);

export const activityVia = pgEnum("activity_via", ["web", "mcp", "api"]);

export const activity = pgTable(
  "activity",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    ticketId: uuid().references(() => ticket.id, { onDelete: "cascade" }),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    type: varchar({ length: 50 }).notNull(),
    payload: jsonb().notNull().default({}),
    via: activityVia().notNull().default("web"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.ticketId, t.createdAt), index().on(t.workspaceId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Per-user data
// ---------------------------------------------------------------------------

export const notification = pgTable(
  "notification",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    ticketId: uuid().references(() => ticket.id, { onDelete: "cascade" }),
    /** Who caused it (null for system events like "due tomorrow"). */
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    type: varchar({ length: 50 }).notNull(),
    payload: jsonb().notNull().default({}),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.workspaceId, t.readAt)],
);

export const savedView = pgTable(
  "saved_view",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    projectId: uuid().references(() => project.id, { onDelete: "cascade" }),
    name: varchar({ length: 100 }).notNull(),
    filters: jsonb().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.workspaceId)],
);

export const theme = pgEnum("theme", ["system", "light", "dark"]);

/** UI preferences per user and workspace (favorites and folders are workspace-specific). */
export const userPref = pgTable(
  "user_pref",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    sidebarCollapsed: boolean().notNull().default(false),
    expandedFolders: jsonb().$type<string[]>().notNull().default([]),
    favorites: jsonb().$type<string[]>().notNull().default([]),
    theme: theme().notNull().default("system"),
    confetti: boolean().notNull().default(true),
    /** Daily e-mail digest (KONZEPT §2.8), on by default, can be switched off. */
    emailDigest: boolean().notNull().default(true),
    /** Berlin date of the last digest sent – makes the daily job idempotent. */
    lastDigestOn: varchar({ length: 10 }),
    /** Start view chosen in the onboarding wizard; project links open it. */
    defaultView: text().notNull().default("board"),
    /** Next onboarding step (docs/ONBOARDING.md §2.1 numbering) – the wizard resumes here. */
    onboardingStep: smallint(),
    /** List columns the person switched off (docs/ONBOARDING.md §4), e.g. ["due", "comments"]. */
    hiddenColumns: jsonb().$type<string[]>().notNull().default([]),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.workspaceId] }),
    check("user_pref_default_view", sql`${t.defaultView} in (${oneOf(VIEWS)})`),
    check("user_pref_onboarding_step", sql`${t.onboardingStep} is null or ${t.onboardingStep} between 1 and 6`),
  ],
);

/**
 * Answers to "Zwei kurze Fragen" (onboarding step 5) – optional, first-party, evaluated only in
 * aggregate. Hangs on the workspace: deleting the workspace deletes the answers (GDPR).
 */
export const onboardingAnswer = pgTable(
  "onboarding_answer",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    previousTools: text().array().notNull().default(sql`'{}'::text[]`),
    source: text(),
    sourceOther: varchar({ length: MAX_SOURCE_OTHER }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.workspaceId, t.userId),
    check("onboarding_answer_tools", sql`cardinality(${t.previousTools}) <= ${sql.raw(String(PREVIOUS_TOOLS.length))} and ${t.previousTools} <@ array[${oneOf(PREVIOUS_TOOLS)}]::text[]`),
    check("onboarding_answer_source", sql`${t.source} is null or ${t.source} in (${oneOf(SOURCES)})`),
    check("onboarding_answer_source_other", sql`${t.sourceOther} is null or ${t.source} = 'other'`),
  ],
);

export const apiToken = pgTable(
  "api_token",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: varchar({ length: 100 }).notNull(),
    tokenHash: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    revokedAt: timestamp({ withTimezone: true }),
    /** Chosen by the user when creating the token; null = no expiry. */
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex().on(t.tokenHash), index().on(t.userId, t.workspaceId)],
);

// ---------------------------------------------------------------------------
// OAuth 2.1 provider (@better-auth/oauth-provider) – lets claude.ai connectors sign in.
// Tables as generated by the Better Auth CLI (model names must stay as they are).
// Access tokens are opaque and stored as sha256 hashes (src/lib/auth.ts → storeTokens).
// ---------------------------------------------------------------------------

const ts = () => timestamp({ withTimezone: true });

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text().primaryKey(),
    clientId: text().notNull().unique(),
    clientSecret: text(),
    clientDiscoveryId: text(),
    disabled: boolean().default(false),
    skipConsent: boolean(),
    enableEndSession: boolean(),
    subjectType: text(),
    scopes: text().array(),
    clientCredentialsScopes: text().array().default(sql`'{}'::text[]`),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts(),
    updatedAt: ts(),
    name: text(),
    uri: text(),
    icon: text(),
    contacts: text().array(),
    tos: text(),
    policy: text(),
    softwareId: text(),
    softwareVersion: text(),
    softwareStatement: text(),
    redirectUris: text().array().notNull(),
    postLogoutRedirectUris: text().array(),
    backchannelLogoutUri: text(),
    backchannelLogoutSessionRequired: boolean(),
    tokenEndpointAuthMethod: text(),
    applicationType: text(),
    jwks: text(),
    jwksUri: text(),
    grantTypes: text().array(),
    responseTypes: text().array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean().default(false),
    referenceId: text(),
    metadata: jsonb(),
  },
  (t) => [index().on(t.userId)],
);

export const oauthResource = pgTable("oauth_resource", {
  id: text().primaryKey(),
  identifier: text().notNull().unique(),
  name: text().notNull(),
  accessTokenTtl: integer(),
  refreshTokenTtl: integer(),
  signingAlgorithm: text(),
  signingKeyId: text(),
  allowedScopes: text().array(),
  customClaims: jsonb(),
  dpopBoundAccessTokensRequired: boolean().default(false),
  disabled: boolean().default(false),
  createdAt: ts(),
  updatedAt: ts(),
  policyVersion: integer().default(1),
  metadata: jsonb(),
});

export const oauthClientResource = pgTable(
  "oauth_client_resource",
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text()
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb(),
    createdAt: ts(),
  },
  (t) => [index().on(t.clientId), index().on(t.resourceId), uniqueIndex().on(t.clientId, t.resourceId)],
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    expiresAt: ts(),
    createdAt: ts(),
    revoked: ts(),
    rotatedAt: ts(),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: ts(),
    authTime: ts(),
    confirmation: jsonb(),
    scopes: text().array().notNull(),
  },
  (t) => [index().on(t.clientId), index().on(t.sessionId), index().on(t.userId), index().on(t.authorizationCodeId)],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text().primaryKey(),
    token: text().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    refreshId: text().references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: ts(),
    createdAt: ts(),
    revoked: ts(),
    confirmation: jsonb(),
    scopes: text().array().notNull(),
  },
  (t) => [index().on(t.clientId), index().on(t.sessionId), index().on(t.userId), index().on(t.authorizationCodeId), index().on(t.refreshId)],
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    createdAt: ts(),
    updatedAt: ts(),
  },
  (t) => [index().on(t.clientId), index().on(t.userId)],
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text().primaryKey(),
  expiresAt: ts().notNull(),
});

/** Which workspace an OAuth client (e.g. Claude) acts in for a person – chosen on the consent page. */
export const oauthWorkspace = pgTable(
  "oauth_workspace",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clientId] }), index().on(t.workspaceId)],
);

/**
 * Cookieless page statistics (Sprint 9): views per day, normalized path and referring site.
 * No IP, no user, no workspace names – app paths are stored as patterns like /[workspace]/p/[key].
 */
export const pageViewDaily = pgTable(
  "page_view_daily",
  {
    day: text().notNull(),
    path: varchar({ length: 100 }).notNull(),
    /** Host of an external referrer, "" for direct/internal. */
    referrer: varchar({ length: 253 }).notNull().default(""),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.path, t.referrer] })],
);
