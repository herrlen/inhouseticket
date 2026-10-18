"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { z } from "zod";
import { setOAuthWorkspace } from "@/db/queries/oauth";
import { listWorkspacesForUser } from "@/db/queries/workspaces";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { getT } from "@/lib/i18n/server";
import { trackServerEvent } from "@/lib/matomo";
import { consentClient } from "@/lib/oauth-consent";
import { requireUser } from "@/lib/session";

export type ConsentState = { error?: string };

const input = z.object({
  oauthQuery: z.string().min(1).max(8000),
  workspaceId: z.uuid().optional(),
  accept: z.enum(["yes", "no"]),
  confirmUnverified: z.literal("yes").optional(),
});

/** Stores the workspace choice, then lets the OAuth provider issue the code and redirect to the client. */
export async function consentAction(_: ConsentState, formData: FormData): Promise<ConsentState> {
  const t = await getT();
  const user = await requireUser();
  const parsed = input.safeParse({
    oauthQuery: formData.get("oauthQuery"),
    workspaceId: formData.get("workspaceId") || undefined,
    accept: formData.get("accept"),
    confirmUnverified: formData.get("confirmUnverified") || undefined,
  });
  if (!parsed.success) return { error: t.oauth.invalid };
  const { oauthQuery, workspaceId, accept, confirmUnverified } = parsed.data;
  const { secret } = await auth.$context;
  if (!(await verifyOAuthQueryParams(oauthQuery, secret))) return { error: t.oauth.invalid };
  const clientId = new URLSearchParams(oauthQuery).get("client_id");
  if (!clientId) return { error: t.oauth.invalid };

  if (accept === "yes") {
    // Same check as the page: a client redirecting to an unknown host needs the explicit tick.
    const client = await consentClient(new URLSearchParams(oauthQuery));
    if (!client) return { error: t.oauth.invalid };
    if (client.trust.kind === "unknown" && confirmUnverified !== "yes") return { error: t.oauth.unverifiedRequired };
    const workspaces = await listWorkspacesForUser(user.id);
    const chosen = workspaces.find((w) => w.id === workspaceId) ?? (workspaces.length === 1 ? workspaces[0] : undefined);
    if (!chosen) return { error: t.oauth.noWorkspace };
    await setOAuthWorkspace(user.id, clientId, chosen.id);
  }

  // Through the auth handler as a real request: on accept the provider re-runs /oauth2/authorize,
  // which needs one (a plain auth.api call has no request object).
  const incoming = await headers();
  const res = await auth.handler(
    new Request(new URL("/api/auth/oauth2/consent", env.APP_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: incoming.get("cookie") ?? "", origin: new URL(env.APP_URL).origin },
      body: JSON.stringify({ accept: accept === "yes", oauth_query: oauthQuery }),
    }),
  );
  const data = (await res.json().catch(() => null)) as { redirect_uri?: string; url?: string } | null;
  const target = data?.redirect_uri ?? data?.url;
  if (!res.ok || !target) {
    console.error("oauth consent failed", res.status);
    return { error: t.oauth.invalid };
  }
  if (accept === "yes") await trackServerEvent({ category: "Integration", action: "MCP connected", name: "oauth", path: "/oauth/consent" });
  redirect(target);
}
