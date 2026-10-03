import { PALETTE } from "@/lib/palette";

// Onboarding templates (KONZEPT §5.6) and default statuses (KONZEPT §2.3, §5.2).

export const DEFAULT_STATUSES = [
  { name: "Offen", color: "#78716C", category: "open" },
  { name: "In Arbeit", color: "#3B82F6", category: "active" },
  { name: "Review", color: "#9B5DE5", category: "active" },
  { name: "Erledigt", color: "#22C55E", category: "done" },
] as const;

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
