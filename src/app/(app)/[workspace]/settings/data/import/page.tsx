import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { de } from "@/lib/i18n/de";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: de.import.title };

type Props = { params: Promise<{ workspace: string }> };

export default async function ImportPage({ params }: Props) {
  const { workspace: slug } = await params;
  const ctx = await requireRole({ slug }, "admin");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Link href={`/${slug}/settings/data`} className="w-fit text-[13px] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          ← {de.import.back}
        </Link>
        <h1 className="text-xl font-semibold">{de.import.title}</h1>
        <p className="text-[13px] text-muted">
          {de.import.intro}{" "}
          <Link href="/umziehen" className="text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {de.import.helpLink}
          </Link>
        </p>
      </div>
      <ImportForm workspaceId={ctx.workspace.id} />
    </div>
  );
}
