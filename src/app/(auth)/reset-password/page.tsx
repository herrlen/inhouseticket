import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { ResetPasswordForm } from "./reset-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).password.resetTitle };
}

type Props = { searchParams: Promise<{ token?: string | string[]; error?: string | string[] }> };

/** Target of the reset mail: Better Auth checks the link and forwards here with ?token= or ?error=. */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const t = await getT();
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && token.length <= 200 && !error;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.password.resetTitle}</h1>
      {valid ? (
        <>
          <p className="mb-6 text-muted">{t.password.resetIntro}</p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <>
          <p role="alert" className="mb-6 text-prio-urgent-ink">
            {t.password.resetInvalid}
          </p>
          <Link href="/forgot-password" className="text-accent hover:underline">
            {t.password.resetRequestNew}
          </Link>
        </>
      )}
    </>
  );
}
