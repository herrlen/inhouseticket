// Connector contract: every provider is one module with the same shape, the sync engine only
// talks to this interface. Framework-free (no React, no Next, no database) so the module can move
// into a shared package for emuchat later.

import type { ProviderId } from "./providers";

/** An account the token can see (ClickUp: a Workspace, called "team" in the API). */
export type ExternalAccount = { id: string; name: string };

export type AccountInfo = { accounts: ExternalAccount[] };

export type ExternalStatus = { name: string; type: string; color: string | null };

/** Selectable containers as a tree: space → folder → list (folderless lists sit on the space). */
export type ContainerNode = {
  id: string;
  name: string;
  kind: "space" | "folder" | "list";
  /** Statuses defined on this container (spaces in ClickUp). */
  statuses?: ExternalStatus[];
  children: ContainerNode[];
};

export type ExternalPerson = { id: string; name: string; email: string | null };

export type ExternalChecklist = { name: string; items: Array<{ name: string; done: boolean }> };

/** Provider-neutral task as the engine consumes it. Dates as Date or null. */
export type ExternalTask = {
  id: string;
  /** Human key in the other tool (custom id) or the id. */
  ref: string;
  url: string | null;
  title: string;
  description: string;
  status: ExternalStatus;
  /** 0 = none … 4 = urgent (inhouseticket scale). */
  priority: number;
  assignees: ExternalPerson[];
  tags: string[];
  parentId: string | null;
  spaceId: string;
  listId: string | null;
  listName: string | null;
  /** Null for folderless lists. */
  folderName: string | null;
  milestone: boolean;
  checklists: ExternalChecklist[];
  createdAt: Date | null;
  updatedAt: Date | null;
  doneAt: Date | null;
  dueAt: Date | null;
};

export type ExternalComment = { id: string; body: string; author: ExternalPerson | null; createdAt: Date | null };

/** What to pull: whole spaces and/or single lists of one account. */
export type PullScope = { accountId: string; spaceIds: string[]; listIds: string[] };

/** One page of a pull. `query` and `page` together are the resume position. */
export type PullPage = { query: number; page: number; tasks: ExternalTask[]; last: boolean };

export type PullOptions = {
  /** Delta: only items changed after this instant. */
  since?: Date | null;
  /** Resume: first query (provider-defined sub-request) and page (0-based) to fetch. */
  startQuery?: number;
  startPage?: number;
};

export interface Connector {
  readonly id: ProviderId;
  readonly auth: "token" | "oauth";
  /** Checks the credentials and returns the accounts they reach. Throws ConnectorError. */
  testConnection(): Promise<AccountInfo>;
  /** `shallow`: top level only (names and statuses, one request) – what every sync run needs. */
  listContainers(accountId: string, options?: { shallow?: boolean }): Promise<ContainerNode[]>;
  listPeople(accountId: string): Promise<ExternalPerson[]>;
  /** Pages of tasks, in a stable order so a crashed run can resume at a page. */
  pull(scope: PullScope, options?: PullOptions): AsyncIterable<PullPage>;
  /** Comments of one task (second, lower-priority phase). */
  pullComments(taskId: string): AsyncIterable<ExternalComment>;
  /**
   * TODO(webhooks): verify the provider's signature (ClickUp: X-Signature, HMAC-SHA256 over the
   * raw body with the webhook secret) and return the ids of changed items; the engine then runs a
   * delta for them. Needs a public URL and webhook registration – until then polling every 5 min.
   */
  handleWebhook?(request: Request): Promise<{ changedIds: string[]; deletedIds: string[] }>;
}

export type ConnectorErrorCode = "unauthorized" | "not_found" | "rate_limited" | "unavailable" | "bad_response";

/** Error of a provider call; the message never contains the token or response bodies. */
export class ConnectorError extends Error {
  constructor(
    readonly code: ConnectorErrorCode,
    readonly status?: number,
  ) {
    super(`connector_${code}${status ? `_${status}` : ""}`);
  }
}

export type ConnectorOptions = {
  token: string;
  /** Injected in tests; defaults to global fetch. */
  fetch?: typeof fetch;
  baseUrl?: string;
  requestsPerMinute?: number;
};
