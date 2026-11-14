import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listImportMembers } from "@/db/queries/import";
import { findIntegration, integrationsConfigured, listFieldMappings, listSyncRuns, type IntegrationView } from "@/db/queries/integrations";
import { requireRole } from "@/lib/authz";
import { intlLocale } from "@/lib/i18n/locale";
import { getLocale, getT } from "@/lib/i18n/server";
import { isStatusTarget, matchPeople, STATUS_TARGETS, suggestStatus } from "@/lib/integrations/mapping";
import type { ExternalStatus } from "@/lib/integrations/types";
import { chooseAccountAction, disconnectAction, saveMappingAction, syncNowAction } from "./actions";
import { loadContainers, loadPeople } from "./data";
import { RunRefresh } from "./run-refresh";
import { SelectionForm } from "./selection-form";
import { TokenForm } from "./token-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: `${t.integrations.clickup.title} – ${t.integrations.title}` };
}

type Props = { params: Promise<{ workspace: string }>; searchParams: Promise<{ schritt?: string }> };
type T = Awaited<ReturnType<typeof getT>>;
type Step = "token" | "account" | "containers" | "mapping" | "done";

const card = "rounded-[var(--radius-card)] border border-border bg-surface p-4";
const select = "h-8 max-w-full rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const linkButton =
  "inline-flex h-8 items-center rounded-[var(--radius-badge)] border border-border bg-surface px-3 text-[13px] font-medium hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Which screen to show: the wizard's next step, or a step reopened from the finished setup (?schritt=). */
function currentStep(integ: IntegrationView | null, param: string | undefined): Step {
  // A row without token exists after a CSV import only (the tickets hang on it): not connected yet.
  if (!integ?.config.tokenHint) return "token";
  const step = integ.config.step ?? "account";
  if (step !== "done") return step;
  if (param === "token") return "token";
  if (param === "auswahl") return "containers";
  if (param === "zuordnung") return "mapping";
  return "done";
}

export default async function ClickUpPage({ params, searchParams }: Props) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const { workspace: slug } = await params;
  const { schritt } = await searchParams;
  const ctx = await requireRole({ slug }, "admin");
  const ws = ctx.workspace.id;
  const integ = await findIntegration(ws, "clickup");
  const step = currentStep(integ, schritt);
  const finished = integ?.config.step === "done";
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
  const c = t.integrations.clickup;

  const order: Step[] = ["token", "containers", "mapping", "done"];
  const position = order.indexOf(step === "account" ? "token" : step);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <Link href={`/${slug}/settings/integrations`} className="w-fit text-[13px] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          ← {t.integrations.back}
        </Link>
        <h1 className="text-xl font-semibold">{c.title}</h1>
      </div>

      {!integrationsConfigured() ? <p className="text-[13px] text-prio-high-ink">{t.integrations.notConfigured}</p> : null}

      {!finished ? (
        <ol aria-label={t.integrations.steps.label} className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {(["token", "containers", "mapping", "start"] as const).map((s, i) => (
            <li key={s} aria-current={i === position ? "step" : undefined} className={i === position ? "font-semibold" : "text-muted"}>
              {i + 1}. {t.integrations.steps[s]}
            </li>
          ))}
        </ol>
      ) : null}

      {step === "token" ? (
        <section aria-labelledby="token-heading" className={card}>
          <h2 id="token-heading" className="mb-2 font-semibold">
            {finished ? t.integrations.overview.replaceToken : c.tokenTitle}
          </h2>
          {integrationsConfigured() ? <TokenForm workspaceId={ws} /> : null}
        </section>
      ) : null}

      {step === "account" && integ ? <AccountStep t={t} ws={ws} integ={integ} /> : null}

      {step === "containers" && integ?.config.accountId ? (
        <section aria-labelledby="containers-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="containers-heading" className="font-semibold">
              {c.containersTitle}
            </h2>
            <p className="text-[13px] text-muted">{c.containersHelp}</p>
          </div>
          <ContainerStep t={t} ws={ws} integ={integ} />
        </section>
      ) : null}

      {step === "mapping" && integ?.config.accountId ? <MappingStep t={t} ws={ws} integ={integ} first={!finished} /> : null}

      {step === "done" && integ ? <Overview t={t} ws={ws} slug={slug} integ={integ} fmt={fmt} /> : null}
    </div>
  );
}

function AccountStep({ t, ws, integ }: { t: T; ws: string; integ: IntegrationView }) {
  const c = t.integrations.clickup;
  return (
    <form action={chooseAccountAction} className={card}>
      <input type="hidden" name="workspaceId" value={ws} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{c.accountTitle}</legend>
        <p className="text-[13px] text-muted">{c.accountHelp}</p>
        {(integ.config.accounts ?? []).map((a, i) => (
          <label key={a.id} className="flex items-center gap-2 text-[13px]">
            <input type="radio" name="accountId" value={a.id} defaultChecked={i === 0} required className="size-4 accent-[var(--accent)]" />
            {a.name}
          </label>
        ))}
      </fieldset>
      <Button type="submit" variant="primary" className="mt-3">
        {c.accountSubmit}
      </Button>
    </form>
  );
}

async function ContainerStep({ t, ws, integ }: { t: T; ws: string; integ: IntegrationView }) {
  const tree = await loadContainers(ws, integ.id, integ.config.accountId!);
  if (!tree) return <p className="text-[13px] text-prio-urgent-ink">{t.integrations.clickup.loadFailed}</p>;
  return (
    <SelectionForm
      workspaceId={ws}
      tree={tree}
      spaceIds={integ.config.spaceIds ?? []}
      listIds={integ.config.listIds ?? []}
      submitLabel={integ.config.step === "done" ? t.common.save : t.integrations.clickup.containersSubmit}
    />
  );
}

async function MappingStep({ t, ws, integ, first }: { t: T; ws: string; integ: IntegrationView; first: boolean }) {
  const c = t.integrations.clickup;
  const [tree, people, members, saved] = await Promise.all([
    loadContainers(ws, integ.id, integ.config.accountId!),
    loadPeople(ws, integ.id, integ.config.accountId!),
    listImportMembers(ws),
    listFieldMappings(ws, integ.id),
  ]);
  if (!tree || !people) return <p className="text-[13px] text-prio-urgent-ink">{c.loadFailed}</p>;

  // Statuses of the selected spaces (lists inherit their space's statuses) plus any seen while syncing.
  const spaceIds = new Set(integ.config.spaceIds ?? []);
  const listIds = new Set(integ.config.listIds ?? []);
  const used = tree.filter((s) => spaceIds.has(s.id) || s.children.some((ch) => listIds.has(ch.id) || ch.children.some((l) => listIds.has(l.id))));
  const statuses = new Map<string, ExternalStatus>();
  for (const s of used.flatMap((x) => x.statuses ?? [])) if (!statuses.has(s.name.toLowerCase())) statuses.set(s.name.toLowerCase(), s);
  for (const m of saved) if (m.kind === "status" && !statuses.has(m.externalValue.toLowerCase())) statuses.set(m.externalValue.toLowerCase(), { name: m.externalValue, type: String(m.meta.type ?? "custom"), color: null });
  const savedStatus = new Map(saved.filter((m) => m.kind === "status").map((m) => [m.externalValue.toLowerCase(), m.localValue]));
  const savedUser = new Map(saved.filter((m) => m.kind === "user").map((m) => [m.externalValue, m.localValue]));
  const matched = matchPeople(people, members);
  // Choices from a CSV import are stored by name: used when the e-mail matches nobody.
  const savedByName = new Map(saved.filter((m) => m.kind === "user").map((m) => [m.externalValue.trim().toLowerCase(), m.localValue]));
  const memberIds = new Set(members.map((m) => m.id));
  const label = (target: string) => (target === "own" ? c.ownStatus : target);

  return (
    <form action={saveMappingAction} className="flex flex-col gap-6">
      <input type="hidden" name="workspaceId" value={ws} />
      <h2 className="font-semibold">{c.mappingTitle}</h2>

      <section aria-labelledby="status-heading" className={card}>
        <h3 id="status-heading" className="font-semibold">
          {c.statusTitle}
        </h3>
        <p className="mb-3 text-[13px] text-muted">{c.statusHelp}</p>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="pb-1 font-medium">{c.statusFrom}</th>
              <th scope="col" className="pb-1 font-medium">{c.statusTo}</th>
            </tr>
          </thead>
          <tbody>
            {[...statuses.values()].map((s) => {
              const current = savedStatus.get(s.name.toLowerCase());
              const value = current && isStatusTarget(current) ? current : suggestStatus(s).target;
              return (
                <tr key={s.name} className="border-t border-border">
                  <td className="py-1.5 pr-3">{s.name}</td>
                  <td className="py-1.5">
                    <select name={`status:${s.name}`} defaultValue={value} aria-label={c.statusLabel(s.name)} className={select}>
                      {STATUS_TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {label(target)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="people-heading" className={card}>
        <h3 id="people-heading" className="font-semibold">
          {c.peopleTitle}
        </h3>
        <p className="mb-3 text-[13px] text-muted">{c.peopleHelp}</p>
        {people.length === 0 ? <p className="text-[13px] text-muted">{c.noPeople}</p> : null}
        <table className="w-full text-[13px]">
          <thead className={people.length ? undefined : "sr-only"}>
            <tr className="text-left text-muted">
              <th scope="col" className="pb-1 font-medium">{c.personFrom}</th>
              <th scope="col" className="pb-1 font-medium">{c.personTo}</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const stored = savedUser.get(p.id);
              const byName = savedByName.get(p.name.trim().toLowerCase());
              const value = stored !== undefined ? (memberIds.has(stored) ? stored : "") : (matched.get(p.id) ?? (byName && memberIds.has(byName) ? byName : ""));
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-1.5 pr-3">
                    <span className="block">{p.name}</span>
                    <span className="block text-muted">
                      {p.email ?? "–"}
                      {!matched.get(p.id) ? ` · ${c.unmatched}` : ""}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <select name={`person:${p.id}`} defaultValue={value} aria-label={c.personLabel(p.name)} className={select}>
                      <option value="">{c.unassigned}</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.email})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="priority-heading" className={card}>
        <h3 id="priority-heading" className="font-semibold">
          {c.priorityTitle}
        </h3>
        <p className="text-[13px] text-muted">{c.priorityText}</p>
      </section>

      <div>
        <Button type="submit" variant="primary">
          {first ? c.mappingSubmitFirst : c.mappingSubmit}
        </Button>
      </div>
    </form>
  );
}

async function Overview({ t, ws, slug, integ, fmt }: { t: T; ws: string; slug: string; integ: IntegrationView; fmt: Intl.DateTimeFormat }) {
  const o = t.integrations.overview;
  const runs = await listSyncRuns(ws, integ.id, 10);
  const busy = integ.running || integ.syncRequestedAt !== null || runs.some((r) => !r.finishedAt);
  const errorKey = integ.lastError && integ.lastError in o.errors ? (integ.lastError as keyof typeof o.errors) : "other";
  const state = integ.status === "error" ? t.integrations.failed : t.integrations.connected;
  const base = `/${slug}/settings/integrations/clickup`;

  return (
    <>
      <RunRefresh active={busy} />
      <section aria-labelledby="overview-heading" className={card}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="overview-heading" className="font-semibold">
            {o.title}
          </h2>
          <Badge tone={integ.status === "error" ? { kind: "priority", value: "urgent" } : { kind: "status", value: "done" }}>{state}</Badge>
        </div>
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-muted">{o.account}</dt>
          <dd>{integ.config.accountName ?? "–"}</dd>
          <dt className="text-muted">{o.token}</dt>
          <dd className="font-mono">{integ.config.tokenHint ?? "–"}</dd>
          <dt className="text-muted">{o.lastSync}</dt>
          <dd>{integ.lastSyncAt ? fmt.format(integ.lastSyncAt) : o.never}</dd>
          <dt className="text-muted">{o.status}</dt>
          <dd aria-live="polite">{busy ? o.running : o.selection(integ.config.spaceIds?.length ?? 0, integ.config.listIds?.length ?? 0)}</dd>
          <dt className="text-muted">{o.realtime}</dt>
          <dd>{o.realtimeState[integ.webhookStatus ?? "off"]}</dd>
          {integ.webhookStatus ? (
            <>
              <dt className="text-muted">{o.lastEvent}</dt>
              <dd>{integ.webhookEventAt ? fmt.format(integ.webhookEventAt) : o.noEvent}</dd>
            </>
          ) : null}
        </dl>
        {integ.lastError ? (
          <p role="alert" className="mt-3 text-[13px] text-prio-urgent-ink">
            {o.errors[errorKey]}
          </p>
        ) : null}
        <p className="mt-3 text-[13px] text-muted">{integ.webhookStatus === "active" ? o.nextSyncRealtime : o.nextSync}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={syncNowAction}>
            <input type="hidden" name="workspaceId" value={ws} />
            <Button type="submit" variant="primary" size="sm" disabled={busy}>
              {o.syncNow}
            </Button>
          </form>
          <Link href={`${base}?schritt=auswahl`} className={linkButton}>
            {o.editSelection}
          </Link>
          <Link href={`${base}?schritt=zuordnung`} className={linkButton}>
            {o.editMapping}
          </Link>
          <Link href={`${base}?schritt=token`} className={linkButton}>
            {o.replaceToken}
          </Link>
        </div>
      </section>

      <section aria-labelledby="log-heading">
        <h2 id="log-heading" className="mb-2 font-semibold">
          {t.integrations.log.title}
        </h2>
        {runs.length === 0 ? (
          <p className="text-[13px] text-muted">{t.integrations.log.none}</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">{t.integrations.log.started}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t.integrations.log.trigger}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t.integrations.log.result}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const n = (k: string) => r.counts[k] ?? 0;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{fmt.format(r.startedAt)}</td>
                      <td className="px-3 py-2">{t.integrations.log.triggers[r.trigger]}</td>
                      <td className="px-3 py-2">
                        {t.integrations.log.counts({ read: n("read"), created: n("created"), updated: n("updated"), errors: n("errors"), comments: n("comments") })}
                        {!r.finishedAt ? ` · ${t.integrations.log.runningNow}` : r.error ? ` · ${t.integrations.log.failed}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="disconnect-heading" className="rounded-[var(--radius-card)] border border-prio-urgent-ink p-4">
        <h2 id="disconnect-heading" className="mb-1 font-semibold text-prio-urgent-ink">
          {o.disconnectTitle}
        </h2>
        <p className="mb-3 text-[13px]">{o.disconnectText}</p>
        <form action={disconnectAction}>
          <input type="hidden" name="workspaceId" value={ws} />
          <label className="mb-3 flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="confirm" value="yes" required className="size-4 accent-[var(--accent)]" />
            {o.disconnectConfirm}
          </label>
          <Button type="submit" variant="danger" size="sm">
            {o.disconnect}
          </Button>
        </form>
      </section>
    </>
  );
}
