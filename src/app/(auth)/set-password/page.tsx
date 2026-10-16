import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { getT } from "@/lib/i18n/server";
import { setPasswordUrl } from "@/lib/password-gate";
import { hasPassword, requireUser, safeNext } from "@/lib/session";
import { SetPasswordForm } from "./set-password-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).password.setTitle };
}

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** Where every link sign-in without a password ends up first (see requireUser). */
export default async function SetPasswordPage({ searchParams }: Props) {
  const t = await getT();
  const next = safeNext((await searchParams).next);
  const user = await requireUser(setPasswordUrl(next), { allowWithoutPassword: true });
  if (await hasPassword(user.id)) redirect(next);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">{t.password.setTitle}</h1>
      <p className="mb-1 text-muted">{t.password.setIntro}</p>
      <p className="mb-6 text-[13px] text-muted">{t.account.signedInAs(user.email)}</p>
      <SetPasswordForm email={user.email} next={next} />
      <div className="mt-4">
        <SignOutButton />
      </div>
    </>
  );
}
