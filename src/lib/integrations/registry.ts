// Provider registry: a new provider is one module plus one entry here – the engine and the UI
// look connectors up by id and never import a provider directly.

import { ClickUpConnector } from "./clickup/connector";
import type { ProviderId } from "./providers";
import type { Connector, ConnectorOptions } from "./types";

type Factory = (options: ConnectorOptions) => Connector;

const FACTORIES: Record<ProviderId, Factory> = {
  clickup: (o) => new ClickUpConnector({ token: o.token, baseUrl: o.baseUrl, fetch: o.fetch, requestsPerMinute: o.requestsPerMinute }),
};

export function createConnector(provider: ProviderId, options: ConnectorOptions): Connector {
  return FACTORIES[provider](options);
}
