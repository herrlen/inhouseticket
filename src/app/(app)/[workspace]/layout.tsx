import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { SignOutButton } from "@/components/sign-out-button";
import { hasRole, requireMember } from "@/lib/authz";
import { de } from "@/lib/i18n/de";

type Props = { children: React.ReactNode; params: Promise<{ workspace: string }> };

// Minimal frame until the full app shell (sidebar, explorer) arrives in Sprint 2.
export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireMember({ slug });

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:p-2">
        {de.common.skipToContent}
      </a>
      <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
        <Link href={`/${ctx.workspace.slug}`} className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: ctx.workspace.color }} />
          {ctx.workspace.name}
        </Link>
        <nav aria-label={de.common.mainNav} className="flex items-center gap-2">
          {hasRole(ctx, "admin") ? (
            <Link href={`/${ctx.workspace.slug}/settings/members`} className="rounded-[var(--radius-badge)] px-2 py-1 text-[13px] hover:bg-bg">
              {de.members.title}
            </Link>
          ) : null}
          <Avatar user={ctx.user} size="sm" />
          <SignOutButton />
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl p-6">
        {children}
      </main>
    </div>
  );
}
