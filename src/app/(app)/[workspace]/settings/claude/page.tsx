import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listApiTokens } from "@/db/queries/api-tokens";
import { listOAuthConnections } from "@/db/queries/oauth";
import { requireMember } from "@/lib/authz";
import { env } from "@/lib/env";
import { de } from "@/lib/i18n/de";
import { disconnectAppAction, revokeTokenAction } from "./actions";
import { ClaudeSetup } from "./setup";

export const metadata: Metadata = { title: "Mit Claude verbinden" };

type Props = { params: Promise<{ workspace: string }> };

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const fmt = (iso: string) => dateFmt.format(new Date(iso));
const expired = (iso: string) => new Date(iso).getTime() <= Date.now();

export default async function ClaudePage({ params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  const wsId = ctx.workspace.id;
  const [tokens, apps] = await Promise.all([listApiTokens(wsId, ctx.user.id), listOAuthConnections(wsId, ctx.user.id)]);
  const mcpUrl = new URL("/mcp", env.APP_URL).toString();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{de.claude.title}</h1>
        <p className="text-muted">{de.claude.intro}</p>
        <p className="text-[13px] text-prio-high-ink">{de.claude.security}</p>
      </header>

      <section aria-labelledby="connector-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="connector-heading" className="mb-1 font-semibold">
          {de.oauth.connectorTitle}
        </h2>
        <p className="mb-2 text-[13px] text-muted">{de.oauth.connectorText}</p>
        <pre tabIndex={0} aria-label={de.oauth.connectorTitle} className="overflow-x-auto rounded-[var(--radius-badge)] border border-border bg-bg p-3 font-mono text-[12px]">
          <code>{mcpUrl}</code>
        </pre>
      </section>

      <section aria-labelledby="apps-heading">
        <h2 id="apps-heading" className="mb-2 font-semibold">
          {de.oauth.connectedTitle}
        </h2>
        {apps.length === 0 ? (
          <p className="text-[13px] text-muted">{de.oauth.connectedNone}</p>
        ) : (
          <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
            {apps.map((a) => (
              <li key={a.clientId} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-[13px] text-muted">{de.oauth.connectedSince(fmt(a.createdAt))}</p>
                </div>
                <form action={disconnectAppAction}>
                  <input type="hidden" name="workspaceId" value={wsId} />
                  <input type="hidden" name="clientId" value={a.clientId} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={de.oauth.disconnectLabel(a.name)}>
                    {de.oauth.disconnect}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClaudeSetup workspaceId={wsId} mcpUrl={mcpUrl} />

      <section aria-labelledby="tokens-heading">
        <h2 id="tokens-heading" className="mb-2 font-semibold">
          {de.claude.tokensTitle(tokens.filter((t) => !t.revokedAt && !(t.expiresAt && expired(t.expiresAt))).length)}
        </h2>
        {tokens.length === 0 ? (
          <p className="text-[13px] text-muted">{de.claude.none}</p>
        ) : (
          <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-[13px] text-muted">
                    {de.claude.created(fmt(t.createdAt))} · {t.lastUsedAt ? de.claude.lastUsed(fmt(t.lastUsedAt)) : de.claude.neverUsed} ·{" "}
                    {t.expiresAt ? (expired(t.expiresAt) ? de.claude.expired : de.claude.expiresOn(fmt(t.expiresAt))) : de.claude.noExpiry}
                  </p>
                </div>
                {t.revokedAt ? (
                  <Badge>{de.claude.revoked}</Badge>
                ) : (
                  <form action={revokeTokenAction}>
                    <input type="hidden" name="workspaceId" value={wsId} />
                    <input type="hidden" name="tokenId" value={t.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={de.claude.revokeLabel(t.name)}>
                      {de.claude.revoke}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="examples-heading">
        <h2 id="examples-heading" className="mb-2 font-semibold">
          {de.claude.examplesTitle}
        </h2>
        <ul className="list-disc pl-5 text-[13px] text-muted">
          {de.claude.examples.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
