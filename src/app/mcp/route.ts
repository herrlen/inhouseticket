import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiToken } from "@/db/queries/api-tokens";
import { tooManyRequests } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createMcpServer } from "@/mcp/server";

// Remote MCP endpoint (Streamable HTTP, stateless JSON). Auth: personal API token as Bearer.
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

function unauthorized() {
  return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Gültiges API-Token als Bearer-Token erforderlich." } }), {
    status: 401,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "WWW-Authenticate": 'Bearer realm="inhouseticket"' },
  });
}

export async function POST(request: Request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match?.[1]) return unauthorized();
  const auth = await authenticateApiToken(match[1]);
  if (!auth) return unauthorized();

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
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
