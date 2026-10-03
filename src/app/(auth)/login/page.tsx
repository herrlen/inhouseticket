import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { de } from "@/lib/i18n/de";
import { getSession, safeNext } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (await getSession()) redirect(target);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{de.login.title}</h1>
      <p className="mb-6 text-muted">{de.login.subtitle}</p>
      {error ? (
        <p role="alert" className="mb-4 rounded-[var(--radius-badge)] border border-prio-urgent-ink p-3 text-[13px] text-prio-urgent-ink">
          {de.login.linkError}
        </p>
      ) : null}
      <LoginForm next={target} />
    </>
  );
}
