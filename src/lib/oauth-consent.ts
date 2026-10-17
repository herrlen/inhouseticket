import "server-only";
import { findOAuthClient } from "@/db/queries/oauth";
import { consentRedirectUri, redirectTrust, sanitizeClientName, type RedirectTrust } from "@/lib/oauth-client-trust";

export type ConsentClient = { name: string; trust: RedirectTrust };

/**
 * Client of a (signature-checked) authorization request: its display name and where the code
 * goes. Null if the client is unknown/disabled or the redirect URI is not one it registered.
 * Page and action use the same answer, so the server enforces what the page asked for.
 */
export async function consentClient(query: URLSearchParams): Promise<ConsentClient | null> {
  const client = await findOAuthClient(query.get("client_id") ?? "");
  if (!client) return null;
  const trust = redirectTrust(consentRedirectUri(query.get("redirect_uri"), client.redirectUris));
  if (!trust) return null;
  return { name: sanitizeClientName(client.name) ?? "Unbenannte App", trust };
}
