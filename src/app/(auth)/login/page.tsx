import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { oauthResumePath } from "@/lib/oauth-login";
import { getSession, safeNext } from "@/lib/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.login.title };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const t = await getT();
  const params = await searchParams;
  const { next, error } = params;
  // A connector (e.g. claude.ai) asking to sign in: continue its authorization after login.
  const oauth = await oauthResumePath(params);
  const target = oauth ?? safeNext(next);
  if (await getSession()) redirect(target);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.login.title}</h1>
      <p className="mb-6 text-muted">{oauth ? t.oauth.loginHint : t.login.subtitle}</p>
      {error ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-badge)] border border-prio-urgent-ink p-3 text-[13px] text-prio-urgent-ink">
          {t.login.linkError}
        </p>
      ) : null}
      <LoginForm next={target} />
    </>
  );
}
