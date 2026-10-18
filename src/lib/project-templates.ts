import type { Locale } from "@/lib/i18n/locale";

// Default statuses for new projects (KONZEPT §2.3, §5.2). The onboarding templates per team area
// live in src/lib/onboarding/templates.ts.

export const DEFAULT_STATUSES = [
  { name: "Offen", color: "#78716C", category: "open" },
  { name: "In Arbeit", color: "#3B82F6", category: "active" },
  { name: "Review", color: "#9B5DE5", category: "active" },
  { name: "Erledigt", color: "#22C55E", category: "done" },
] as const;

/** Names of the default statuses for new projects in the UI language. The import maps onto the German ones. */
const DEFAULT_STATUS_NAMES_EN = ["Open", "In progress", "Review", "Done"] as const;
export function defaultStatusesFor(locale: Locale) {
  return DEFAULT_STATUSES.map((s, i) => ({ ...s, name: locale === "en" ? DEFAULT_STATUS_NAMES_EN[i]! : s.name }));
}
