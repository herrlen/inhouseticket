"use client";

import type { ClipboardEvent, KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Close } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n/client";
import { parseInviteInput, SENDABLE, type InviteChip, type InviteStatus } from "@/lib/onboarding/invite-input";
import type { WizardData, StepProps } from "./wizard-state";

// Step 6 (docs/ONBOARDING.md §2.3): paste or type addresses, each becomes a chip with its status.
// Red = freemail/invalid (not invited), yellow = external (invited, marked), grey = duplicate or
// already a member. The status is always written out, color only adds to it.

const TONES: Record<InviteStatus, Parameters<typeof Badge>[0]["tone"]> = {
  ok: { kind: "status", value: "active" },
  external: { kind: "priority", value: "medium" },
  freemail: { kind: "priority", value: "urgent" },
  invalid: { kind: "priority", value: "urgent" },
  duplicate: { kind: "neutral" },
  member: { kind: "neutral" },
};

/** Turns the draft into chips (classified against members, open invitations and existing chips). */
export function commitDraft(data: WizardData, props: StepProps["props"], text = data.draft): Pick<WizardData, "chips" | "draft"> {
  const added = parseInviteInput(text, {
    domain: props.workspace.domain,
    members: props.invites.members,
    existing: [...props.invites.pending, ...data.chips.map((c) => c.email)],
  });
  return { chips: [...data.chips, ...added], draft: "" };
}

export const sendableEmails = (chips: InviteChip[]) => chips.filter((c) => SENDABLE.has(c.status)).map((c) => c.email);

export function InviteStep({ data, set, errors, props }: StepProps) {
  const messages = useT();
  const t = messages.onboarding.invite;
  const used = props.invites.seatsUsed + sendableEmails(data.chips).length;
  const max = props.invites.maxSeats;
  const notSent = data.chips.filter((c) => !SENDABLE.has(c.status)).length;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && data.draft.trim()) {
      e.preventDefault();
      set(commitDraft(data, props));
    } else if (e.key === "Backspace" && !data.draft && data.chips.length > 0) {
      set({ chips: data.chips.slice(0, -1) });
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\s,;]/.test(text.trim())) return; // a single address: let it land in the field
    e.preventDefault();
    set(commitDraft(data, props, `${data.draft} ${text}`));
  };

  return (
    <div className="flex flex-col gap-3">
      <Input
        label={t.input}
        value={data.draft}
        placeholder={messages.onboarding.invitesPlaceholder}
        onChange={(e) => {
          const value = e.target.value;
          // Typing a separator commits the address before it.
          if (/[\s,;]$/.test(value) && value.trim()) set(commitDraft(data, props, value));
          else set({ draft: value });
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => data.draft.trim() && set(commitDraft(data, props))}
        type="text"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        data-autofocus
        data-chip-input
        hint={t.inputHint}
        error={errors.emails}
      />
      {data.chips.length > 0 ? (
        <ul aria-label={t.chips} className="flex flex-wrap gap-1.5">
          {data.chips.map((c, i) => (
            <li key={`${c.email}-${i}`}>
              <Badge tone={TONES[c.status]} pill className="max-w-full py-1 pr-1 text-[13px] text-text">
                <span className="truncate">{c.email}</span>
                <span className={cn("text-xs font-normal", c.status === "ok" ? "sr-only" : "")}>· {t.status[c.status]}</span>
                <button
                  type="button"
                  aria-label={t.remove(c.email)}
                  onClick={() => set({ chips: data.chips.filter((_, j) => j !== i) })}
                  className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-text"
                >
                  <Close className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
        <span>
          {data.chips.some((c) => c.status === "external") ? t.externalHint : null}
          {notSent > 0 ? <span className="block">{t.notSent(notSent)}</span> : null}
        </span>
        <span role="status" aria-label={t.seatsLabel(used, max)} className={cn("tabular-nums", used > max && "font-medium text-prio-urgent-ink")}>
          {t.seats(used, max)}
        </span>
      </div>
    </div>
  );
}
