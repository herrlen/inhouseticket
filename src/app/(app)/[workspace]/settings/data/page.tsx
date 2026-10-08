import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { DeleteWorkspaceForm } from "./delete-form";

export const metadata: Metadata = { title: "Daten & Workspace" };

type Props = { params: Promise<{ workspace: string }> };

const linkButton =
  "inline-flex h-8 items-center rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-[13px] font-medium hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default async function DataPage({ params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireRole({ slug }, "admin");
  const exportUrl = `/api/w/${ctx.workspace.id}/export`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4 md:p-6">
      <h1 className="text-xl font-semibold">{de.data.title}</h1>

      <section aria-labelledby="export-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="export-heading" className="mb-1 font-semibold">
          {de.data.exportTitle}
        </h2>
        <p className="mb-3 text-[13px] text-muted">{de.data.exportText}</p>
        <div className="flex flex-wrap gap-2">
          <a href={`${exportUrl}?format=json`} download className={linkButton}>
            {de.data.exportJson}
          </a>
          <a href={`${exportUrl}?format=csv`} download className={linkButton}>
            {de.data.exportCsv}
          </a>
        </div>
      </section>

      <section aria-labelledby="import-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="import-heading" className="mb-1 font-semibold">
          {de.data.importTitle}
        </h2>
        <p className="mb-3 text-[13px] text-muted">{de.data.importText}</p>
        <Link href={`/${ctx.workspace.slug}/settings/data/import`} className={linkButton}>
          {de.data.importLink}
        </Link>
      </section>

      <section aria-labelledby="delete-heading" className="rounded-[var(--radius-card)] border border-prio-urgent-ink p-4">
        <h2 id="delete-heading" className="mb-1 font-semibold text-prio-urgent-ink">
          {de.data.deleteTitle}
        </h2>
        <p className="mb-3 text-[13px]">{de.data.deleteText(ctx.workspace.name)}</p>
        {ctx.membership.role === "owner" ? (
          <DeleteWorkspaceForm workspaceId={ctx.workspace.id} slug={ctx.workspace.slug} />
        ) : (
          <p className="text-[13px] text-muted">{de.data.ownerOnly}</p>
        )}
      </section>
    </div>
  );
}
