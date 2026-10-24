import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiToken } from "@/db/queries/api-tokens";
import { authenticateOAuthAccessToken } from "@/db/queries/oauth";
import { MCP_RESOURCES } from "@/lib/auth";
import { protectedResourceMetadataUrl } from "@/lib/oauth-metadata";
import { tooManyRequests } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createMcpServer } from "@/mcp/server";

// Remote MCP endpoint (Streamable HTTP, stateless JSON). Auth: personal API token (iht_…) or an
// OAuth access token from a connector (claude.ai), both as Bearer.
// Each request gets its own server bound to the token's user and workspace.

export const dynamic = "force-dynamic";

const REQUESTS_PER_MINUTE = 120;
/** A user may hold several tokens; together they share this budget. */
const USER_REQUESTS_PER_MINUTE = 240;

/** JSON-RPC batches count once per message, so a batch cannot multiply the limit. */
async function messageCount(request: Request): Promise<number> {
  const body: unknown = await request.clone().json().catch(() => null);
  return Array.isArray(body) ? Math.max(body.length, 1) : 1;
}

/** 401 with the RFC 9728 pointer, so OAuth clients can discover where to sign in. */
function unauthorized(request: Request) {
  return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Gültiges API-Token oder Anmeldung erforderlich." } }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "WWW-Authenticate": `Bearer realm="inhouseticket", resource_metadata="${protectedResourceMetadataUrl(request.headers.get("host"))}"`,
    },
  });
}

async function authenticate(request: Request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  const raw = match?.[1];
  if (!raw) return null;
  return raw.startsWith("iht_") ? authenticateApiToken(raw) : authenticateOAuthAccessToken(raw, MCP_RESOURCES);
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return unauthorized(request);

  const cost = await messageCount(request);
  const limited =
    tooManyRequests(rateLimit(`mcp:${auth.tokenId}`, REQUESTS_PER_MINUTE, 60_000, Date.now(), cost)) ??
    tooManyRequests(rateLimit(`mcp-user:${auth.userId}`, USER_REQUESTS_PER_MINUTE, 60_000, Date.now(), cost));
  if (limited) return limited;

  const server = createMcpServer({ userId: auth.userId, workspaceId: auth.workspaceId, via: "mcp" });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

// Stateless server: no SSE stream, no sessions to delete.
// Unauthenticated probes still get the 401 discovery hint.
const notAllowed = async (request: Request) =>
  (await authenticate(request)) ? new Response(null, { status: 405, headers: { Allow: "POST" } }) : unauthorized(request);
export const GET = notAllowed;
export const DELETE = notAllowed;
