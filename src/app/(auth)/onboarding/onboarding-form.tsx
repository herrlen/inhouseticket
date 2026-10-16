"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "@/lib/i18n/client";
import { projectTemplatesFor, TEMPLATE_IDS } from "@/lib/project-templates";
import { createWorkspaceAction, type OnboardingState } from "./actions";

export function OnboardingForm({ suggestedName }: { suggestedName: string }) {
  const t = useT();
  const locale = useLocale();
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createWorkspaceAction, {});
  const e = state.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <Input name="name" label={t.onboarding.name} defaultValue={suggestedName} maxLength={100} required error={e.name} />

      <ColorPicker name="color" legend={t.onboarding.color} error={e.color} />

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">{t.onboarding.template}</legend>
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATE_IDS.map((id, i) => {
            const tpl = projectTemplatesFor(locale)[id];
            return (
              <label key={id} className="cursor-pointer">
                <input type="radio" name="template" value={id} defaultChecked={i === 0} className="peer sr-only" />
                <span className="flex flex-col items-center gap-1 rounded-[var(--radius-card)] border border-border p-3 text-center peer-checked:border-accent peer-checked:bg-bg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                  <span aria-hidden className="text-lg">{tpl.icon}</span>
                  <span className="text-[13px] font-medium">{tpl.name}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted">{t.onboarding.templateHint}</p>
        <label className="mt-3 flex items-start gap-2 text-[13px]">
          <input type="checkbox" name="thenImport" value="on" className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>{t.onboarding.thenImport}</span>
        </label>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="invites" className="text-[13px] font-medium">
          {t.onboarding.invites} <span className="font-normal text-muted">({t.onboarding.optional})</span>
        </label>
        <textarea
          id="invites"
          name="invites"
          rows={2}
          placeholder={t.onboarding.invitesPlaceholder}
          aria-invalid={e.invites ? true : undefined}
          aria-describedby="invites-hint"
          className={cn(
            "rounded-[var(--radius-badge)] border bg-surface px-3 py-2 text-sm placeholder:text-muted",
            e.invites ? "border-prio-urgent-ink" : "border-border",
          )}
        />
        <p id="invites-hint" className={cn("text-xs", e.invites ? "text-prio-urgent-ink" : "text-muted")}>
          {e.invites ?? t.onboarding.invitesHint}
        </p>
      </div>

      {e.form ? <p role="alert" className="text-prio-urgent-ink">{e.form}</p> : null}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t.onboarding.creating : t.onboarding.submit}
      </Button>
      <p className="text-xs text-muted">
        {t.onboarding.termsBefore}
        <Link href="/agb" target="_blank" className="text-accent underline">{t.legal.terms}</Link>
        {t.onboarding.termsBetween}
        <Link href="/avv" target="_blank" className="text-accent underline">{t.onboarding.termsAvv}</Link>
        {t.onboarding.termsAfter}
      </p>
    </form>
  );
}
