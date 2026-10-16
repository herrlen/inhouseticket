import type { Locale } from "@/lib/i18n/locale";
import { PALETTE } from "@/lib/palette";

// Onboarding templates (KONZEPT §5.6) and default statuses (KONZEPT §2.3, §5.2).

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

export type TemplateId = "marketing" | "it" | "general";

export const PROJECT_TEMPLATES: Record<
  TemplateId,
  { name: string; key: string; color: string; icon: string; tickets: Array<{ title: string; priority: number }> }
> = {
  marketing: {
    name: "Marketing",
    key: "MKT",
    color: PALETTE.coral,
    icon: "📣",
    tickets: [
      { title: "Newsletter für nächsten Monat planen", priority: 2 },
      { title: "Social-Media-Posts für die Woche vorbereiten", priority: 1 },
      { title: "Landingpage-Texte prüfen", priority: 3 },
    ],
  },
  it: {
    name: "IT",
    key: "IT",
    color: PALETTE.blue,
    icon: "🖥️",
    tickets: [
      { title: "Laptop für neue Kollegin einrichten", priority: 3 },
      { title: "Drucker im 2. OG reagiert nicht", priority: 2 },
      { title: "Passwort-Manager für das Team einführen", priority: 1 },
    ],
  },
  general: {
    name: "Allgemein",
    key: "ALL",
    color: PALETTE.indigo,
    icon: "📋",
    tickets: [
      { title: "Willkommen bei inhouseticket – schau dich um", priority: 0 },
      { title: "Kollegen einladen", priority: 2 },
      { title: "Erstes eigenes Ticket anlegen (Taste C)", priority: 1 },
    ],
  },
};

export const TEMPLATE_IDS = Object.keys(PROJECT_TEMPLATES) as TemplateId[];

const TEMPLATES_EN: Record<TemplateId, { name: string; tickets: string[] }> = {
  marketing: { name: "Marketing", tickets: ["Plan next month's newsletter", "Prepare this week's social media posts", "Review landing page copy"] },
  it: { name: "IT", tickets: ["Set up a laptop for our new colleague", "Printer on the 2nd floor isn't responding", "Introduce a password manager for the team"] },
  general: { name: "General", tickets: ["Welcome to inhouseticket – have a look around", "Invite colleagues", "Create your first own ticket (key C)"] },
};

/** Templates in the UI language (key, color, icon and priorities stay the same). */
export function projectTemplatesFor(locale: Locale): typeof PROJECT_TEMPLATES {
  if (locale === "de") return PROJECT_TEMPLATES;
  return Object.fromEntries(
    TEMPLATE_IDS.map((id) => {
      const base = PROJECT_TEMPLATES[id];
      const en = TEMPLATES_EN[id];
      return [id, { ...base, name: en.name, tickets: base.tickets.map((tk, i) => ({ ...tk, title: en.tickets[i] ?? tk.title })) }];
    }),
  ) as typeof PROJECT_TEMPLATES;
}
