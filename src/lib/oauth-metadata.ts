import "server-only";
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth, MCP_RESOURCE } from "@/lib/auth";
import { env } from "@/lib/env";
import { isSiteHost, SITE_URL } from "@/lib/site";

// Discovery documents for MCP clients (claude.ai connectors). The authorization server lives
// under /api/auth, so its metadata is served both at the RFC 8414 path-inserted location and at
// the root for clients that only try that.

export const ISSUER = new URL("/api/auth", env.APP_URL).toString().replace(/\/$/, "");

/**
 * The resource as the client addressed it (RFC 9728 wants an exact match): /mcp on the app host,
 * or on the site host for connectors set up with the old address. Tokens come from ISSUER either way.
 */
function base(host: string | null): string {
  return isSiteHost(host) ? SITE_URL : env.APP_URL;
}

export function protectedResourceMetadataUrl(host: string | null): string {
  return new URL("/.well-known/oauth-protected-resource/mcp", base(host)).toString();
}

const cors = { "Access-Control-Allow-Origin": "*" };

export const authServerMetadata = oauthProviderAuthServerMetadata(auth, { headers: cors });
export const openIdConfig = oauthProviderOpenIdConfigMetadata(auth, { headers: cors });

/** RFC 9728: tells the client which authorization server issues tokens for /mcp. */
export function protectedResourceMetadata(request: Request): Response {
  const host = request.headers.get("host");
  return Response.json(
    {
      resource: isSiteHost(host) ? new URL("/mcp", SITE_URL).toString() : MCP_RESOURCE,
      authorization_servers: [ISSUER],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      resource_name: "inhouseticket",
      resource_documentation: new URL("/", SITE_URL).toString(),
    },
    // Varies by host: shared caches must not hand one host's answer to the other.
    { headers: { ...cors, "Cache-Control": "public, max-age=3600", Vary: "Host" } },
  );
}
