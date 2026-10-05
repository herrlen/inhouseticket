import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { de } from "@/lib/i18n/de";
import { oauthResumePath } from "@/lib/oauth-login";
import { getSession, safeNext } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const { next, error } = params;
  // A connector (e.g. claude.ai) asking to sign in: continue its authorization after login.
  const oauth = await oauthResumePath(params);
  const target = oauth ?? safeNext(next);
  if (await getSession()) redirect(target);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{de.login.title}</h1>
      <p className="mb-6 text-muted">{oauth ? de.oauth.loginHint : de.login.subtitle}</p>
      {error ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-badge)] border border-prio-urgent-ink p-3 text-[13px] text-prio-urgent-ink">
          {de.login.linkError}
        </p>
      ) : null}
      <LoginForm next={target} />
    </>
  );
}
