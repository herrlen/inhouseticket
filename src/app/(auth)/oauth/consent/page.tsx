import type { Metadata } from "next";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { listWorkspacesForUser } from "@/db/queries/workspaces";
import { auth } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { consentClient } from "@/lib/oauth-consent";
import { requireUser } from "@/lib/session";
import { ConsentForm } from "./consent-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.oauth.title };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ConsentPage({ searchParams }: Props) {
  const t = await getT();
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) for (const x of v === undefined ? [] : Array.isArray(v) ? v : [v]) query.append(k, x);
  const oauthQuery = query.toString();
  const user = await requireUser(`/oauth/consent?${oauthQuery}`);

  const { secret } = await auth.$context;
  const valid = await verifyOAuthQueryParams(oauthQuery, secret);
  const client = valid ? await consentClient(query) : null;
  if (!client) {
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">{t.oauth.title}</h1>
        <p role="alert" className="text-prio-urgent-ink">{t.oauth.invalid}</p>
      </>
    );
  }

  const { name, trust } = client;
  const unverified = trust.kind === "unknown";
  const workspaces = (await listWorkspacesForUser(user.id)).map((w) => ({ id: w.id, name: w.name }));
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">{t.oauth.title}</h1>
      {unverified ? (
        <div role="alert" className="mb-4 rounded-[var(--radius-badge)] border border-prio-urgent-ink p-3 text-[13px] text-prio-urgent-ink">
          <p className="mb-1 font-semibold">{t.oauth.unverifiedTitle}</p>
          <p>{t.oauth.unverifiedText(trust.host)}</p>
        </div>
      ) : null}
      <p className="mb-4 break-words">{unverified ? t.oauth.requestUnverified(name) : t.oauth.request(name)}</p>
      <div className="mb-4 rounded-[var(--radius-badge)] border border-border p-3">
        <p className="text-[13px] text-muted">{t.oauth.redirectLabel}</p>
        <p className="font-mono text-base font-semibold break-all">{trust.host}</p>
        <p className="mt-1 text-[13px] text-muted">{trust.kind === "known" ? t.oauth.redirectKnown : trust.kind === "loopback" ? t.oauth.redirectLoopback : t.oauth.redirectUnknown}</p>
      </div>
      <ConsentForm oauthQuery={oauthQuery} workspaces={workspaces} email={user.email} unverifiedHost={unverified ? trust.host : null} />
    </>
  );
}
