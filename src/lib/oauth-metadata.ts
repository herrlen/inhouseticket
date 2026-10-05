import "server-only";
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth, MCP_RESOURCE } from "@/lib/auth";
import { env } from "@/lib/env";

// Discovery documents for MCP clients (claude.ai connectors). The authorization server lives
// under /api/auth, so its metadata is served both at the RFC 8414 path-inserted location and at
// the root for clients that only try that.

export const ISSUER = new URL("/api/auth", env.APP_URL).toString().replace(/\/$/, "");
export const PROTECTED_RESOURCE_METADATA_URL = new URL("/.well-known/oauth-protected-resource/mcp", env.APP_URL).toString();

const cors = { "Access-Control-Allow-Origin": "*" };

export const authServerMetadata = oauthProviderAuthServerMetadata(auth, { headers: cors });
export const openIdConfig = oauthProviderOpenIdConfigMetadata(auth, { headers: cors });

/** RFC 9728: tells the client which authorization server issues tokens for /mcp. */
export function protectedResourceMetadata(): Response {
  return Response.json(
    {
      resource: MCP_RESOURCE,
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      resource_name: "inhouseticket",
      resource_documentation: new URL("/", env.APP_URL).toString(),
    },
    { headers: { ...cors, "Cache-Control": "public, max-age=3600" } },
  );
}
