import type { Metadata } from "next";
import Link from "next/link";
import { findInvitationByToken } from "@/db/queries/invitations";
import { de } from "@/lib/i18n/de";
import { getSession } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import { JoinButton } from "../../start/join-button";

export const metadata: Metadata = { title: "Einladung" };

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const [inv, session] = await Promise.all([findInvitationByToken(token), getSession()]);

  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) {
    return (
      <>
        <h1 className="mb-2 text-xl font-semibold">{de.invitePage.goneTitle}</h1>
        <p className="mb-6 text-muted">{de.invitePage.goneText}</p>
        <Link href="/login" className="text-accent hover:underline">
          {de.invitePage.toLogin}
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">{de.invitePage.title(inv.workspaceName)}</h1>
      <p className="mb-6 text-muted">{de.invitePage.text(inv.inviterName, inv.email)}</p>
      {!session ? (
        <Link
          href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
          className="inline-flex h-9 items-center rounded-[var(--radius-badge)] bg-accent px-3.5 font-medium text-accent-contrast"
        >
          {de.invitePage.signIn}
        </Link>
      ) : session.user.email.toLowerCase() !== inv.email ? (
        <>
          <p role="alert" className="mb-4 text-prio-urgent-ink">
            {de.invitePage.wrongUser(inv.email, session.user.email)}
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
