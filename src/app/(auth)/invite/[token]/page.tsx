import type { Metadata } from "next";
import Link from "next/link";
import { findInvitationByToken } from "@/db/queries/invitations";
import { getT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { setPasswordUrl } from "@/lib/password-gate";
import { getSession, hasPassword } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import { loginHref } from "@/lib/auth-links";
import { JoinButton } from "../../start/join-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.start.invitations };
}

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const t = await getT();
  const { token } = await params;
  const [inv, session] = await Promise.all([findInvitationByToken(token), getSession()]);

  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">{t.invitePage.goneTitle}</h1>
        <p className="mb-6 text-muted">{t.invitePage.goneText}</p>
        <Link href="/login" className="text-accent hover:underline">
          {t.invitePage.toLogin}
        </Link>
      </>
    );
  }

  const back = `/invite/${encodeURIComponent(token)}`;
  // Signed in by link but no password yet: set it first, then come back to accept.
  if (session && !(await hasPassword(session.user.id))) redirect(setPasswordUrl(back));

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">{t.invitePage.title(inv.workspaceName)}</h1>
      <p className="mb-6 text-muted">{t.invitePage.text(inv.inviterName, inv.email)}</p>
      {!session ? (
        <div className="flex flex-col items-start gap-4">
          <Link
            href={loginHref(back)}
            className="inline-flex h-9 items-center rounded-[var(--radius-badge)] bg-accent px-3.5 font-medium text-accent-contrast"
          >
            {t.invitePage.signIn}
          </Link>
          {/* The sign-in link only works for existing accounts: new people register first (with the
              invited address prefilled) and land back here after confirming. */}
          <p className="text-[13px] text-muted">
            {t.invitePage.noAccount}{" "}
            <Link href={`/register?${new URLSearchParams({ email: inv.email, next: back })}`} className="font-medium text-accent underline">
              {t.invitePage.register}
            </Link>
          </p>
        </div>
      ) : session.user.email.toLowerCase() !== inv.email ? (
        <>
          <p role="alert" className="mb-4 text-prio-urgent-ink">
            {t.invitePage.wrongUser(inv.email, session.user.email)}
          </p>
          <SignOutButton />
        </>
      ) : (
        <div className="flex justify-start">
          <JoinButton kind="invitation" invitationId={inv.id} />
        </div>
      )}
    </>
  );
}
