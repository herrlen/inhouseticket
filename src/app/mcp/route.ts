import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateApiToken } from "@/db/queries/api-tokens";
import { jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createMcpServer } from "@/mcp/server";

// Remote MCP endpoint (Streamable HTTP, stateless JSON). Auth: personal API token as Bearer.
// Each request gets its own server bound to the token's user and workspace.

export const dynamic = "force-dynamic";

const REQUESTS_PER_MINUTE = 120;

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

  const limit = rateLimit(`mcp:${auth.tokenId}`, REQUESTS_PER_MINUTE, 60_000);
  if (!limit.ok) {
    const res = jsonError(429, "rate_limited", `Zu viele Anfragen. Bitte in ${limit.retryAfterSec} s erneut versuchen.`);
    res.headers.set("Retry-After", String(limit.retryAfterSec));
    return res;
  }

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
