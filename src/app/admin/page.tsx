import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/components/legal-links";
import { ADMIN_PAGE_SIZE, listWorkspacesForAdmin, platformTotals } from "@/db/queries/admin";
import { de } from "@/lib/i18n/de";
import { pageViewStats } from "@/lib/pageviews";
import { requireSuperadmin } from "@/lib/superadmin";
import { isPersonalWorkspaceDomain } from "@/lib/workspace-domain";
import { deleteWorkspaceAction, setLockedAction } from "./actions";

export const metadata: Metadata = { title: "Betreiber-Übersicht", robots: { index: false } };

type Props = { searchParams: Promise<{ deleted?: string; mismatch?: string; q?: string; page?: string }> };

const dateFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const fmt = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : de.admin.never);
const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString("de-DE")} KB`;

export default async function AdminPage({ searchParams }: Props) {
  await requireSuperadmin();
  const { deleted, mismatch, q: rawQ, page: rawPage } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const [{ total, rows }, totals, stats] = await Promise.all([listWorkspacesForAdmin(q, page), platformTotals(), pageViewStats(30)]);
  const viewsTotal = stats.perDay.reduce((n, d) => n + d.views, 0);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  // Which client IP the rate limits see (Better Auth reads the first X-Forwarded-For entry).
  const h = await headers();
  const seenIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const pageHref = (p: number) => `/admin?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  const tiles = [
    { label: de.admin.workspaces, value: totals.workspaces },
    { label: de.admin.users, value: totals.users },
    { label: de.admin.tickets, value: totals.tickets },
    { label: de.admin.active7d, value: totals.active_7d },
  ];

  return (
    <main id="main" className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{de.admin.title}</h1>
          <p className="text-muted">{de.admin.intro}</p>
        </div>
        <Link href="/start" className="text-[13px] text-accent underline-offset-2 hover:underline">
          {de.admin.back}
        </Link>
      </header>

      {deleted || mismatch ? (
        <p role="status" className={mismatch ? "text-prio-urgent-ink" : "text-status-done-ink"}>
          {mismatch ? de.admin.deleteMismatch : de.admin.deleted}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <dt className="text-[13px] text-muted">{t.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{t.value.toLocaleString("de-DE")}</dd>
          </div>
        ))}
      </dl>

      <form role="search" action="/admin" className="flex flex-wrap items-center gap-2">
        <label htmlFor="admin-q" className="sr-only">
          {de.admin.searchLabel}
        </label>
        <input
          id="admin-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={de.admin.searchPlaceholder}
          className="h-9 min-w-64 flex-1 rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-sm placeholder:text-muted"
        />
        <Button type="submit" size="sm">
          {de.admin.search}
        </Button>
        <span className="text-[13px] text-muted">{de.admin.results(total)}</span>
      </form>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">{de.admin.tableCaption}</caption>
          <thead className="border-b border-border text-muted">
            <tr>
              {[de.admin.colWorkspace, de.admin.colOwner, de.admin.colMembers, de.admin.colTickets, de.admin.colStorage, de.admin.colTokens, de.admin.colActivity, de.admin.colCreated, de.admin.colActions].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="border-b border-border align-top last:border-0">
                <th scope="row" className="px-3 py-2 font-medium">
                  <span className="block">{w.name}</span>
                  <span className="block font-mono text-[12px] font-normal text-muted">/{w.slug}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {isPersonalWorkspaceDomain(w.domain) ? <Badge>{de.admin.personal}</Badge> : <span className="font-normal text-muted">{w.domain}</span>}
                    {w.locked_at ? <Badge className="text-prio-urgent-ink">{de.admin.locked}</Badge> : null}
                  </span>
                </th>
                <td className="px-3 py-2">
                  <span className="block">{w.owner_name ?? de.admin.never}</span>
                  <span className="block text-muted">{w.owner_email}</span>
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                  {w.members}
                  {w.pending_invites ? <span className="block text-muted">{de.admin.invites(w.pending_invites)}</span> : null}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                  {w.tickets} ({w.open_tickets})
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{kb(w.attachment_bytes)}</td>
                <td className="px-3 py-2 tabular-nums">{w.api_tokens}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmt(w.last_activity)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmt(w.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-2">
                    <form action={setLockedAction}>
                      <input type="hidden" name="workspaceId" value={w.id} />
                      <input type="hidden" name="locked" value={w.locked_at ? "off" : "on"} />
                      <Button type="submit" size="sm" aria-label={w.locked_at ? de.admin.unlockLabel(w.name) : de.admin.lockLabel(w.name)}>
                        {w.locked_at ? de.admin.unlock : de.admin.lock}
                      </Button>
                    </form>
                    <details>
                      <summary className="cursor-pointer text-prio-urgent-ink">{de.admin.delete}</summary>
                      <form action={deleteWorkspaceAction} className="mt-2 flex w-64 flex-col gap-2">
                        <input type="hidden" name="workspaceId" value={w.id} />
                        <p className="text-muted">{de.admin.deleteHint(w.slug)}</p>
                        <input
                          name="confirm"
                          required
                          autoComplete="off"
                          aria-label={de.admin.deleteConfirmLabel(w.name)}
                          className="h-8 rounded-[var(--radius-badge)] border border-border bg-surface px-2 font-mono"
                        />
                        <Button type="submit" size="sm" variant="danger" aria-label={de.admin.deleteFinalLabel(w.name)}>
                          {de.admin.deleteFinal}
                        </Button>
                      </form>
                    </details>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav aria-label={de.admin.pagination} className="flex items-center gap-3 text-[13px]">
          {page > 1 ? <Link href={pageHref(page - 1)} className="text-accent hover:underline">{de.admin.prev}</Link> : null}
          <span className="text-muted">{de.admin.pageOf(page, pages)}</span>
          {page < pages ? <Link href={pageHref(page + 1)} className="text-accent hover:underline">{de.admin.next}</Link> : null}
        </nav>
      ) : null}
      <section aria-labelledby="stats-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4 text-[13px]">
        <h2 id="stats-heading" className="mb-1 font-semibold">
          {de.admin.statsTitle}
        </h2>
        <p className="mb-3 text-muted">{viewsTotal ? de.admin.statsTotal(viewsTotal) : de.admin.statsNone} · {de.admin.statsText}</p>
        {viewsTotal ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: de.admin.statsPerDay, rows: stats.perDay.map((d) => [d.day.split("-").reverse().join("."), d.views] as const) },
              { title: de.admin.statsTopPages, rows: stats.perPath.map((p) => [p.path, p.views] as const) },
              { title: de.admin.statsReferrers, rows: stats.perReferrer.map((r) => [r.referrer, r.views] as const) },
            ].map((block) => (
              <table key={block.title} className="w-full">
                <caption className="mb-1 text-left font-medium">{block.title}</caption>
                <tbody>
                  {block.rows.length === 0 ? (
                    <tr>
                      <td className="text-muted">–</td>
                    </tr>
                  ) : (
                    block.rows.map(([label, n]) => (
                      <tr key={label} className="border-b border-border last:border-0">
                        <td className="truncate py-0.5 pr-2 font-mono text-[12px]">{label}</td>
                        <td className="py-0.5 text-right tabular-nums">{n.toLocaleString("de-DE")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ))}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="ip-heading" className="rounded-[var(--radius-card)] border border-border bg-surface p-4 text-[13px]">
        <h2 id="ip-heading" className="mb-1 font-semibold">
          {de.admin.ipTitle}
        </h2>
        <p className="text-muted">{de.admin.ipText}</p>
        <p className="mt-2 font-mono">{seenIp ?? de.admin.ipNone}</p>
      </section>
      <LegalLinks />
    </main>
  );
}
