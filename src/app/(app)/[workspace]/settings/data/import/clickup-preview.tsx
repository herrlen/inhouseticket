"use client";

import { useT } from "@/lib/i18n/client";
import deImport from "@/lib/i18n/de/import";
import type { ClickUpPreview } from "@/lib/import/clickup-plan";
import type { StatusTarget } from "@/lib/integrations/mapping";

const MESSAGES = { import: deImport };
// Same order as STATUS_TARGETS in mapping.ts (not imported: keeps the module out of the bundle).
const TARGETS: readonly StatusTarget[] = ["Offen", "In Arbeit", "Review", "Erledigt", "own"];

const th = "py-1.5 pr-3 text-left text-[12px] font-medium text-muted";
const td = "py-1.5 pr-3 align-top";
const select = "h-8 max-w-full rounded-[var(--radius-badge)] border border-border bg-surface px-2 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export type PreviewChoices = {
  members: Array<{ id: string; name: string }>;
  targets: Record<string, StatusTarget>;
  onTarget: (name: string, target: StatusTarget) => void;
  /** ClickUp person name → member id, "" = nobody. */
  people: Record<string, string>;
  onPerson: (name: string, memberId: string) => void;
};

/** What a ClickUp CSV import will create; status targets and people are editable. */
export function ClickUpPreviewView({ preview: p, members, targets, onTarget, people, onPerson }: { preview: ClickUpPreview } & PreviewChoices) {
  const t = useT(MESSAGES);
  const c = t.import.clickup;
  const unmatched = p.people.filter((x) => !(people[x.name] ?? x.memberId ?? ""));
  const content: Array<[string, number]> = [
    [c.content.tasks, p.tasks],
    [c.content.subtasks, p.subtasks],
    [c.content.comments, p.comments],
    [c.content.checklistItems, p.checklistItems],
    [c.content.attachments, p.attachments],
    [c.content.milestones, p.milestones],
    [c.content.folders, p.folders],
    [c.content.lists, p.lists],
    [c.content.rows, p.rows],
  ];
  const skipped = [
    p.known ? c.skipped.known(p.known) : null,
    p.duplicates ? c.skipped.duplicates(p.duplicates) : null,
    ...p.skipped.map((s) => c.skipped[s.reason](s.count)),
  ].filter((n): n is string => n !== null);
  const notes = [
    p.nestedSubtasks ? c.notes.nested(p.nestedSubtasks) : null,
    p.orphanSubtasks ? c.notes.orphans(p.orphanSubtasks) : null,
    p.foldedChecklistItems ? c.notes.folded(p.foldedChecklistItems) : null,
    p.truncatedTitles ? c.notes.truncatedTitles(p.truncatedTitles) : null,
    p.truncatedDescriptions ? c.notes.truncatedDescriptions(p.truncatedDescriptions) : null,
    p.attachments ? c.notes.attachments : null,
    p.comments ? c.notes.comments : null,
    c.notes.source,
    c.notes.noNotifications,
    c.notes.duration(Math.max(1, Math.ceil(p.estimatedSeconds / 60))),
  ].filter((n): n is string => n !== null);

  return (
    <>
      <div>
        <h2 id="import-preview-heading" className="font-semibold">
          {t.import.previewTitle}
        </h2>
        <p className="text-[13px] text-muted">{c.previewIntro}</p>
      </div>

      <div>
        <h3 className="mb-1 text-[13px] font-semibold">{c.contentTitle}</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3">
          {content.map(([label, n]) => (
            <div key={label} className="flex justify-between gap-2 border-b border-border py-1">
              <dt>{label}</dt>
              <dd className="tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h3 className="mb-1 text-[13px] font-semibold">{c.projectsTitle(p.projects.length)}</h3>
        <ul className="grid gap-x-4 text-[13px] sm:grid-cols-2">
          {p.projects.map((pr) => (
            <li key={pr.name} className="flex justify-between gap-2 border-b border-border py-1">
              <span className="min-w-0 break-words">{pr.name}</span>
              <span className="shrink-0 text-muted tabular-nums">{c.tickets(pr.tickets)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[13px] text-muted">{c.projectsHint}</p>
      </div>

      <div className="overflow-x-auto">
        <h3 className="mb-1 text-[13px] font-semibold">{c.statusesTitle}</h3>
        <p className="mb-2 text-[13px] text-muted">{c.statusesHint}</p>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={th}>{c.statusFrom}</th>
              <th scope="col" className={th}>{c.statusTo}</th>
              <th scope="col" className={`${th} text-right`}>{c.count}</th>
            </tr>
          </thead>
          <tbody>
            {p.statuses.map((s) => (
              <tr key={s.name} className="border-b border-border last:border-0">
                <td className={td}>{s.name || "–"}</td>
                <td className={td}>
                  <select aria-label={c.statusTargetLabel(s.name)} value={targets[s.name] ?? s.target} onChange={(e) => onTarget(s.name, e.target.value as StatusTarget)} className={select}>
                    {TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {c.targets[target]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`${td} text-right tabular-nums`}>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.people.length ? (
        <div className="overflow-x-auto">
          <h3 className="mb-1 text-[13px] font-semibold">{c.peopleTitle}</h3>
          {unmatched.length ? <p className="mb-1 text-[13px] text-prio-urgent-ink">{c.peopleUnmatched(unmatched.length)}</p> : null}
          <p className="mb-2 text-[13px] text-muted">{c.peopleHint}</p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={th}>{c.personFrom}</th>
                <th scope="col" className={th}>{c.personTo}</th>
                <th scope="col" className={`${th} text-right`}>{c.count}</th>
              </tr>
            </thead>
            <tbody>
              {p.people.map((person) => (
                <tr key={person.name} className="border-b border-border last:border-0">
                  <td className={td}>{person.name}</td>
                  <td className={td}>
                    <select aria-label={c.personLabel(person.name)} value={people[person.name] ?? person.memberId ?? ""} onChange={(e) => onPerson(person.name, e.target.value)} className={select}>
                      <option value="">{c.unassigned}</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{person.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-[13px] font-semibold">{c.skippedTitle}</h3>
        {skipped.length ? (
          <ul className="list-disc pl-5 text-[13px]">
            {skipped.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">{c.skipped.none}</p>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-[13px] font-semibold">{t.import.notesTitle}</h3>
        <ul className="list-disc pl-5 text-[13px]">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
