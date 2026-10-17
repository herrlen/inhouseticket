import type { Metadata } from "next";
import { requireMember } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { ChangePasswordForm, DisconnectAllButton, ResetPasswordButton } from "./password-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).account.title };
}

type Props = { params: Promise<{ workspace: string }> };

/** Personal settings of the signed-in person (not of the workspace). */
export default async function AccountPage({ params }: Props) {
  const t = await getT();
  const { workspace: slug } = await params;
  const { user } = await requireMember({ slug });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t.account.title}</h1>
        <p className="text-muted">{t.account.signedInAs(user.email)}</p>
      </header>

      <section aria-labelledby="password-heading" className="flex flex-col gap-6 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="password-heading" className="font-semibold">
          {t.account.passwordTitle}
        </h2>
        <div>
          <h3 className="mb-1 text-[13px] font-semibold">{t.account.changeTitle}</h3>
          <p className="mb-3 text-[13px] text-muted">{t.account.changeText}</p>
          <ChangePasswordForm email={user.email} />
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="mb-1 text-[13px] font-semibold">{t.account.resetTitle}</h3>
          <p className="mb-3 text-[13px] text-muted">{t.account.resetText}</p>
          <ResetPasswordButton />
        </div>
      </section>

      <section aria-labelledby="connections-heading" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="connections-heading" className="font-semibold">
          {t.account.disconnectTitle}
        </h2>
        <p className="text-[13px] text-muted">{t.account.disconnectText}</p>
        <DisconnectAllButton />
      </section>
    </div>
  );
}
