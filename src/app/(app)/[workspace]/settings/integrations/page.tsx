import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { integrationsConfigured, listIntegrations } from "@/db/queries/integrations";
import { requireRole } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { INTEGRATION_PROVIDERS, PROVIDER_NAMES, UPCOMING_PROVIDERS } from "@/lib/integrations/providers";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).integrations.title };
}

type Props = { params: Promise<{ workspace: string }>; searchParams: Promise<{ getrennt?: string }> };

const linkButton =
  "inline-flex h-8 items-center rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-[13px] font-medium hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default async function IntegrationsPage({ params, searchParams }: Props) {
  const t = await getT();
  const { workspace: slug } = await params;
  const { getrennt } = await searchParams;
  const ctx = await requireRole({ slug }, "admin");
  const configured = integrationsConfigured();
  const connected = new Map((await listIntegrations(ctx.workspace.id)).map((i) => [i.provider, i]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t.integrations.title}</h1>
        <p className="text-[13px] text-muted">{t.integrations.intro}</p>
      </header>
      {getrennt === "clickup" ? (
        <p role="status" className="rounded-[var(--radius-badge)] border border-border bg-surface px-3 py-2 text-[13px]">
          {t.integrations.overview.disconnected}
        </p>
      ) : null}
      {!configured ? <p className="text-[13px] text-prio-high-ink">{t.integrations.notConfigured}</p> : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {INTEGRATION_PROVIDERS.map((id) => {
          // Without a token the row only anchors CSV-imported tickets (src/db/queries/clickup-import.ts).
          const integ = connected.get(id)?.config.tokenHint ? connected.get(id) : undefined;
          const state = !integ ? t.integrations.notConnected : integ.status === "error" ? t.integrations.failed : integ.status === "active" ? t.integrations.connected : t.integrations.inSetup;
          return (
            <li key={id} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{PROVIDER_NAMES[id]}</h2>
                <Badge tone={integ?.status === "active" ? { kind: "status", value: "done" } : integ?.status === "error" ? { kind: "priority", value: "urgent" } : { kind: "neutral" }}>{state}</Badge>
              </div>
              <p className="flex-1 text-[13px] text-muted">{t.integrations.providerText[id]}</p>
              {configured || integ ? (
                <Link href={`/${slug}/settings/integrations/${id}`} className={linkButton} aria-label={`${PROVIDER_NAMES[id]}: ${integ ? t.integrations.open : t.integrations.connect}`}>
                  {integ ? t.integrations.open : t.integrations.connect}
                </Link>
              ) : null}
            </li>
          );
        })}
        {UPCOMING_PROVIDERS.map((id) => (
          <li key={id} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-dashed border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-muted">{PROVIDER_NAMES[id]}</h2>
              <Badge>{t.integrations.soon}</Badge>
            </div>
            <p className="text-[13px] text-muted">{t.integrations.providerText[id]}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
