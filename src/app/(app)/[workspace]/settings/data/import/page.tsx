import type { Metadata } from "next";
import Link from "next/link";
import { latestCsvRun } from "@/db/queries/clickup-import";
import { requireRole } from "@/lib/authz";
import { getT } from "@/lib/i18n/server";
import { ImportForm } from "./import-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).import.title };
}

type Props = { params: Promise<{ workspace: string }> };

/** A finished ClickUp import is shown again for this long (result summary after coming back). */
const SHOW_RESULT_MS = 60 * 60_000;

export default async function ImportPage({ params }: Props) {
  const t = await getT();
  const { workspace: slug } = await params;
  const ctx = await requireRole({ slug }, "admin");
  const run = await latestCsvRun(ctx.workspace.id, SHOW_RESULT_MS);
  const clickupRun = run
    ? { id: run.id, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, error: run.error, counts: run.counts, done: run.done, total: run.total, running: run.running }
    : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Link href={`/${slug}/settings/data`} className="w-fit text-[13px] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          ← {t.import.back}
        </Link>
        <h1 className="text-xl font-semibold">{t.import.title}</h1>
        <p className="text-[13px] text-muted">
          {t.import.intro}{" "}
          <Link href="/umziehen" className="text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {t.import.helpLink}
          </Link>
        </p>
      </div>
      <ImportForm workspaceId={ctx.workspace.id} slug={slug} clickupRun={clickupRun} />
    </div>
  );
}
