import type { Metadata } from "next";
import { findPendingByTokenHash } from "@/db/queries/registrations";
import { getT } from "@/lib/i18n/server";
import { hashToken } from "@/lib/tokens";
import { ConfirmRegistration } from "./confirm-form";

export async function generateMetadata(): Promise<Metadata> {
  // The token sits in the URL: keep it out of search indexes and Referer headers.
  return { title: (await getT()).register.confirmTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

type Props = { searchParams: Promise<{ token?: string | string[] }> };

/**
 * Target of the confirmation mail. Mail scanners open links before the person does, so a GET only
 * shows the form – nothing is consumed or counted until the password is submitted.
 */
export default async function ConfirmRegistrationPage({ searchParams }: Props) {
  const t = await getT();
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(token);
  const pending = valid ? await findPendingByTokenHash(hashToken(token)) : null;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.register.confirmTitle}</h1>
      {/* One client component in every case: signing in re-renders this page (the row is gone by
          then), and the success state must survive that to navigate on. */}
      <ConfirmRegistration token={pending && valid ? token : ""} email={pending?.email ?? null} />
    </>
  );
}
