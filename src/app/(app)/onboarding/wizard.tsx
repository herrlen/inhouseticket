"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition, type ComponentType, type FormEvent, type KeyboardEvent } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { useLocale, useT } from "@/lib/i18n/client";
import { OPTIONAL_STEPS, STEPS, type StepKey } from "@/lib/onboarding/options";
import { useHydrated } from "@/lib/use-hydrated";
import {
  finishOnboarding,
  postponeOnboarding,
  saveProfileStep,
  saveQuestionsStep,
  saveTeamStep,
  saveViewStep,
  saveWorkspaceStep,
  type StepResult,
} from "./actions";
import { commitDraft, InviteStep, sendableEmails } from "./invite-step";
import { ProfileStep, QuestionsStep, TeamStep, ViewStep, WorkspaceStep } from "./steps";
import type { WizardProps } from "./types";
import { initialData, type StepProps, type WizardData } from "./wizard-state";

const STEP_UI: Record<StepKey, ComponentType<StepProps>> = {
  profile: ProfileStep,
  workspace: WorkspaceStep,
  team: TeamStep,
  view: ViewStep,
  questions: QuestionsStep,
  invite: InviteStep,
};

/** Elements where Enter keeps its own job (new line, activate, open) or the browser submits itself. */
const OWN_ENTER = new Set(["TEXTAREA", "BUTTON", "A", "SELECT"]);
const TOGGLES = new Set(["checkbox", "radio"]);

/** Wizard shell (docs/ONBOARDING.md §1.3): modal card, progress, Zurück/Weiter, Enter = Weiter, Überspringen. */
export function Wizard(props: WizardProps) {
  const t = useT();
  const o = t.onboarding;
  const locale = useLocale();
  const router = useRouter();
  const hydrated = useHydrated();
  const titleId = useId();
  const [step, setStep] = useState<StepKey>(props.initialStep);
  const [data, setData] = useState<WizardData>(() => initialData(props));
  const [workspaceId, setWorkspaceId] = useState(props.workspace.id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const body = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const first = useRef(true);

  const set = useCallback((patch: Partial<WizardData>) => setData((d) => ({ ...d, ...patch })), []);
  const index = props.steps.indexOf(step);
  const last = index === props.steps.length - 1;
  const optional = OPTIONAL_STEPS.has(step);
  // "Später fertigstellen" once the workspace exists (docs/ONBOARDING.md §2.3: not before step 2).
  const canPostpone = props.mode === "owner" && Boolean(workspaceId) && index > props.steps.indexOf("workspace");

  // Keep the step in the URL (reload lands here) and move focus into the new step.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(STEPS[step]));
    window.history.replaceState(null, "", url);
    const target = body.current?.querySelector<HTMLElement>("[data-autofocus], [role=radio][tabindex='0'], button[aria-pressed][tabindex='0']");
    if (first.current && !target) return;
    first.current = false;
    target?.focus();
  }, [step]);

  const canContinue =
    (step !== "profile" || data.name.trim().length > 0) && (step !== "workspace" || data.wsName.trim().length >= 2) && (step !== "team" || data.teamType !== null);

  const after = (key: StepKey, result: StepResult) => {
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (result.workspaceId) setWorkspaceId(result.workspaceId);
    trackEvent("Onboarding", "Step completed", key);
    if (result.redirect) {
      if (result.redirect !== "/start") trackEvent("Onboarding", "Completed", props.mode === "owner" ? (data.teamType ?? "general") : "joiner");
      router.push(result.redirect);
      return;
    }
    const next = props.steps[props.steps.indexOf(key) + 1];
    if (next) setStep(next);
  };

  const run = (key: StepKey, skip = false) => {
    if (pending) return;
    startTransition(async () => {
      const ws = workspaceId ?? "";
      let result: StepResult;
      switch (key) {
        case "profile":
          result = await saveProfileStep({ name: data.name, timezone: data.timezone, workspaceId });
          break;
        case "workspace": {
          // The palette is a radio group with name="color" (uncontrolled ColorPicker).
          const color = String(new FormData(form.current ?? undefined).get("color") ?? data.color);
          set({ color });
          result = await saveWorkspaceStep({ name: data.wsName, color, autoJoin: data.autoJoin });
          break;
        }
        case "team":
          result = await saveTeamStep({ workspaceId: ws, teamType: data.teamType ?? "" });
          break;
        case "view":
          result = await saveViewStep({ workspaceId: ws, view: data.view });
          break;
        case "questions":
          result = await saveQuestionsStep({ workspaceId: ws, previousTools: data.tools, source: data.source, sourceOther: data.sourceOther, skip });
          break;
        case "invite": {
          const chips = data.draft.trim() ? commitDraft(data, props).chips : data.chips;
          if (chips !== data.chips) set({ chips, draft: "" });
          result = await finishOnboarding({ workspaceId: ws, emails: skip ? [] : sendableEmails(chips) });
          break;
        }
      }
      after(key, result);
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canContinue) run(step);
  };
  // Enter continues from anywhere in the card, except where Enter has its own job.
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    const el = e.target as HTMLElement;
    if (e.key !== "Enter" || e.defaultPrevented || e.nativeEvent.isComposing || OWN_ENTER.has(el.tagName)) return;
    // Text fields submit natively (implicit submission); checkboxes and the color radios do not.
    if (el instanceof HTMLInputElement && !TOGGLES.has(el.type)) return;
    e.preventDefault();
    form.current?.requestSubmit();
  };

  const Step = STEP_UI[step];
  const stepTitle = o[step].title;
  const text = step === "profile" && props.mode === "joiner" ? o.profile.textJoin(props.workspace.name) : stepText(o, step, props);

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <p className="text-[15px] font-semibold">
            inhouse<span className="text-accent">ticket</span>
          </p>
          <LanguageToggle locale={locale} label={t.common.language} />
        </div>
        <div className="px-6 pt-4">
          <div className="flex min-h-7 items-center justify-between gap-3 text-xs text-muted">
            <span aria-live="polite">
              {o.progress(index + 1, props.steps.length)}
              {optional ? ` · ${o.optional}` : null}
            </span>
            {canPostpone ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await postponeOnboarding({ workspaceId: workspaceId! });
                    if (result.ok && result.redirect) router.push(result.redirect);
                  })
                }
                className="-mr-2.5 font-normal text-muted underline-offset-4 hover:underline"
              >
                {o.later}
              </Button>
            ) : null}
          </div>
          <div
            role="progressbar"
            aria-label={o.dialog}
            aria-valuemin={1}
            aria-valuemax={props.steps.length}
            aria-valuenow={index + 1}
            aria-valuetext={o.progress(index + 1, props.steps.length)}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-micro ease-out-quick" style={{ width: `${((index + 1) / props.steps.length) * 100}%` }} />
          </div>
        </div>

        <form ref={form} onSubmit={onSubmit} onKeyDown={onKeyDown} noValidate>
          <div key={step} ref={body} className="wizard-step px-6 pt-5 pb-2">
            <h1 id={titleId} className="text-xl font-semibold">{stepTitle}</h1>
            {text ? <p className="mt-1 mb-5 text-muted">{text}</p> : <div className="mb-5" />}
            <Step data={data} set={set} errors={errors} props={{ ...props, workspace: { ...props.workspace, id: workspaceId } }} />
            {errors.form ? <p role="alert" className="mt-3 text-[13px] text-prio-urgent-ink">{errors.form}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
            {index > 0 ? (
              <Button variant="ghost" onClick={() => setStep(props.steps[index - 1]!)} disabled={pending}>
                {o.back}
              </Button>
            ) : null}
            <span className="ml-auto" />
            {optional ? (
              <Button onClick={() => run(step, true)} disabled={pending || !hydrated}>
                {o.skip}
              </Button>
            ) : null}
            <Button type="submit" variant="primary" disabled={pending || !hydrated || !canContinue}>
              {pending ? o.saving : last ? o.finish : o.next}
            </Button>
            <p className={cn("hidden w-full text-right text-xs text-muted", "[@media(hover:hover)]:block")}>{o.enterHint}</p>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

function stepText(o: ReturnType<typeof useT>["onboarding"], step: StepKey, props: WizardProps): string | null {
  switch (step) {
    case "workspace":
      return props.workspace.personal ? o.workspace.textPersonal : o.workspace.text(props.workspace.domain);
    case "profile":
    case "team":
    case "view":
    case "questions":
    case "invite":
      return o[step].text;
  }
}
