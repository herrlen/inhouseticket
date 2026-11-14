// Provider ids and the small constants the schema and the UI share. No imports on purpose: the
// database schema reads these for CHECK constraints, client components for labels.

/** Providers with a working connector. Jira, Slack and Miro follow (shown as "bald" in the UI). */
export const INTEGRATION_PROVIDERS = ["clickup"] as const;
export type ProviderId = (typeof INTEGRATION_PROVIDERS)[number];

export const UPCOMING_PROVIDERS = ["jira", "slack", "miro"] as const;
export type UpcomingProviderId = (typeof UPCOMING_PROVIDERS)[number];

export const PROVIDER_NAMES: Record<ProviderId | UpcomingProviderId, string> = {
  clickup: "ClickUp",
  jira: "Jira",
  slack: "Slack",
  miro: "Miro",
};

export const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && (INTEGRATION_PROVIDERS as readonly string[]).includes(v);

/** setup: token stored, wizard not finished · active: syncs · error: last run failed hard (e.g. token revoked). */
export const INTEGRATION_STATUSES = ["setup", "active", "error"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

/** What an external_ref row points at: a space → project, a task → ticket, a comment → comment. */
export const EXTERNAL_ENTITY_TYPES = ["space", "list", "task", "comment"] as const;
export type ExternalEntityType = (typeof EXTERNAL_ENTITY_TYPES)[number];

export const FIELD_MAPPING_KINDS = ["status", "user", "priority"] as const;
export type FieldMappingKind = (typeof FIELD_MAPPING_KINDS)[number];

export const SYNC_TRIGGERS = ["initial", "manual", "schedule"] as const;
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number];

/** Polling interval for the delta sync (no webhooks yet). */
export const POLL_INTERVAL_MS = 5 * 60_000;
