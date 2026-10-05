import "server-only";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

// The OAuth provider sends people without a session to /login with a signed copy of the
// authorization request. Magic-link sign-in finishes in another request (the link), so instead of
// the plugin's in-request continuation we send the link back to the authorize endpoint.

const SIGNATURE_PARAMS = ["sig", "exp", "ba_iat", "ba_pl", "ba_param"];

/** Authorize URL to resume after login, or null if the query is no valid OAuth login request. */
export async function oauthResumePath(searchParams: Record<string, string | string[] | undefined>): Promise<string | null> {
  if (typeof searchParams.sig !== "string" || typeof searchParams.client_id !== "string") return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const { secret } = await auth.$context;
  if (!(await verifyOAuthQueryParams(query.toString(), secret))) return null;
  for (const p of SIGNATURE_PARAMS) query.delete(p);
  return `/api/auth/oauth2/authorize?${query.toString()}`;
}
