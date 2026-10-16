import type { Metadata } from "next";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { findOAuthClientName } from "@/db/queries/oauth";
import { listWorkspacesForUser } from "@/db/queries/workspaces";
import { auth } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
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
  const clientName = valid ? await findOAuthClientName(query.get("client_id") ?? "") : null;
  if (!valid || !clientName) {
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">{t.oauth.title}</h1>
        <p role="alert" className="text-prio-urgent-ink">{t.oauth.invalid}</p>
      </>
    );
  }

  const workspaces = (await listWorkspacesForUser(user.id)).map((w) => ({ id: w.id, name: w.name }));
  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">{t.oauth.title}</h1>
      <p className="mb-4">{t.oauth.request(clientName)}</p>
      <ConsentForm oauthQuery={oauthQuery} workspaces={workspaces} email={user.email} />
    </>
  );
}
