// Thin HTTP client for the ClickUp API v2: personal token in `Authorization` (no "Bearer"),
// shared rate limiter per token, waits on 429 until X-RateLimit-Reset, retries 5xx with backoff.
// Errors carry only a code and the HTTP status – never the token or a response body.

import { createHash } from "node:crypto";
import { realClock, RateLimiter, resetAt, type Clock } from "../rate-limiter";
import { ConnectorError } from "../types";

export const CLICKUP_API = "https://api.clickup.com/api/v2";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 5;

export type Query = Record<string, string | number | boolean | Array<string | number> | null | undefined>;

/** `list_ids[]=a&list_ids[]=b` – arrays repeat with brackets, as the ClickUp docs show. */
export function buildUrl(base: string, path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) params.append(`${k}[]`, String(item));
    else params.append(k, String(v));
  }
  const qs = params.toString();
  return `${base}${path}${qs ? `?${qs}` : ""}`;
}

// One limiter per token for the whole process: the wizard, a manual run and the poller share it.
const limiters = new Map<string, RateLimiter>();

export function limiterFor(token: string, perMinute?: number, clock?: Clock): RateLimiter {
  const id = createHash("sha256").update(token).digest("hex").slice(0, 32);
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new RateLimiter(perMinute, clock);
    limiters.set(id, limiter);
  }
  return limiter;
}

export type ClientOptions = {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  clock?: Clock;
  requestsPerMinute?: number;
};

export class ClickUpClient {
  private readonly base: string;
  private readonly doFetch: typeof fetch;
  private readonly limiter: RateLimiter;
  private readonly clock: Clock;

  constructor(private readonly options: ClientOptions) {
    this.base = (options.baseUrl ?? CLICKUP_API).replace(/\/+$/, "");
    this.doFetch = options.fetch ?? fetch;
    this.clock = options.clock ?? realClock;
    this.limiter = options.limiter ?? limiterFor(options.token, options.requestsPerMinute, this.clock);
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  /**
   * One API call. POST is not repeated after a network error or 5xx (it may have gone through –
   * a second webhook would be created); 429 is safe to repeat, ClickUp did not process it.
   */
  async request<T>(method: "GET" | "POST" | "DELETE", path: string, options: { query?: Query; body?: unknown } = {}): Promise<T> {
    const url = buildUrl(this.base, path, options.query);
    const retry = method !== "POST";
    for (let attempt = 1; ; attempt++) {
      await this.limiter.acquire();
      let res: Response;
      try {
        res = await this.doFetch(url, {
          method,
          headers: {
            Authorization: this.options.token,
            Accept: "application/json",
            ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          cache: "no-store",
        });
      } catch {
        if (!retry || attempt >= MAX_ATTEMPTS) throw new ConnectorError("unavailable");
        await this.clock.sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.status === 429) {
        await res.body?.cancel();
        if (attempt >= MAX_ATTEMPTS) throw new ConnectorError("rate_limited", 429);
        this.limiter.blockUntil(resetAt(res.headers.get("x-ratelimit-reset"), this.clock.now()));
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        await res.body?.cancel();
        throw new ConnectorError("unauthorized", res.status);
      }
      if (res.status === 404) {
        await res.body?.cancel();
        throw new ConnectorError("not_found", 404);
      }
      if (res.status >= 500) {
        await res.body?.cancel();
        if (!retry || attempt >= MAX_ATTEMPTS) throw new ConnectorError("unavailable", res.status);
        await this.clock.sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new ConnectorError("bad_response", res.status);
      }
      try {
        // DELETE answers `{}` – or nothing at all.
        const text = await res.text();
        return (text.trim() ? JSON.parse(text) : {}) as T;
      } catch {
        throw new ConnectorError("bad_response", res.status);
      }
    }
  }
}
