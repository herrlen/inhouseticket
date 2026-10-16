import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listApiTokens } from "@/db/queries/api-tokens";
import { listOAuthConnections } from "@/db/queries/oauth";
import { requireMember } from "@/lib/authz";
import { env } from "@/lib/env";
import { intlLocale } from "@/lib/i18n/locale";
import { getLocale, getT } from "@/lib/i18n/server";
import { disconnectAppAction, revokeTokenAction } from "./actions";
import { ClaudeSetup } from "./setup";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).claude.title };
}

type Props = { params: Promise<{ workspace: string }> };

const expired = (iso: string) => new Date(iso).getTime() <= Date.now();

export default async function ClaudePage({ params }: Props) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const fmt = (iso: string) => dateFmt.format(new Date(iso));
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });
  const wsId = ctx.workspace.id;
  const [tokens, apps] = await Promise.all([listApiTokens(wsId, ctx.user.id), listOAuthConnections(wsId, ctx.user.id)]);
  const mcpUrl = new URL("/mcp", env.APP_URL).toString();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{t.claude.title}</h1>
        <p className="text-muted">{t.claude.intro}</p>
        <p className="text-[13px] text-prio-high-ink">{t.claude.security}</p>
      </header>

      <section aria-labelledby="connector-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="connector-heading" className="mb-1 font-semibold">
          {t.oauth.connectorTitle}
        </h2>
        <p className="mb-2 text-[13px] text-muted">{t.oauth.connectorText}</p>
        <pre tabIndex={0} aria-label={t.oauth.connectorTitle} className="overflow-x-auto rounded-[var(--radius-badge)] border border-border bg-bg p-3 font-mono text-[12px]">
          <code>{mcpUrl}</code>
        </pre>
      </section>

      <section aria-labelledby="apps-heading">
        <h2 id="apps-heading" className="mb-2 font-semibold">
          {t.oauth.connectedTitle}
        </h2>
        {apps.length === 0 ? (
          <p className="text-[13px] text-muted">{t.oauth.connectedNone}</p>
        ) : (
          <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
            {apps.map((a) => (
              <li key={a.clientId} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-[13px] text-muted">{t.oauth.connectedSince(fmt(a.createdAt))}</p>
                </div>
                <form action={disconnectAppAction}>
                  <input type="hidden" name="workspaceId" value={wsId} />
                  <input type="hidden" name="clientId" value={a.clientId} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={t.oauth.disconnectLabel(a.name)}>
                    {t.oauth.disconnect}
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
          {t.claude.tokensTitle(tokens.filter((t) => !t.revokedAt && !(t.expiresAt && expired(t.expiresAt))).length)}
        </h2>
        {tokens.length === 0 ? (
          <p className="text-[13px] text-muted">{t.claude.none}</p>
        ) : (
          <ul className="rounded-[var(--radius-card)] border border-border bg-surface">
            {tokens.map((tok) => (
              <li key={tok.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{tok.name}</p>
                  <p className="text-[13px] text-muted">
                    {t.claude.created(fmt(tok.createdAt))} · {tok.lastUsedAt ? t.claude.lastUsed(fmt(tok.lastUsedAt)) : t.claude.neverUsed} ·{" "}
                    {tok.expiresAt ? (expired(tok.expiresAt) ? t.claude.expired : t.claude.expiresOn(fmt(tok.expiresAt))) : t.claude.noExpiry}
                  </p>
                </div>
                {tok.revokedAt ? (
                  <Badge>{t.claude.revoked}</Badge>
                ) : (
                  <form action={revokeTokenAction}>
                    <input type="hidden" name="workspaceId" value={wsId} />
                    <input type="hidden" name="tokenId" value={tok.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={t.claude.revokeLabel(tok.name)}>
                      {t.claude.revoke}
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
          {t.claude.examplesTitle}
        </h2>
        <ul className="list-disc pl-5 text-[13px] text-muted">
          {t.claude.examples.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
