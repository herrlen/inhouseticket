// Project templates per team area and the tutorial tickets (docs/ONBOARDING.md §2.4–2.5).
// Code constants, no table and no admin UI. Plain and pure – unit-tested against src/lib/limits.ts.
import { DEFAULT_STATUSES } from "@/lib/project-templates";
import type { Locale } from "@/lib/i18n/locale";
import { PALETTE } from "@/lib/palette";
import type { TeamType, View } from "@/lib/onboarding/options";

type Category = "open" | "active" | "done";
type Text = Record<Locale, string>;

export type TemplateStatus = { name: string; color: string; category: Category };
export type TemplateTicket = {
  title: string;
  description?: string;
  /** 0 = none … 4 = urgent. */
  priority: number;
  /** Assigned to the person finishing the wizard, due today. */
  mine?: boolean;
  labels: string[];
  subtasks: string[];
};
export type ProjectTemplate = { teamType: TeamType; name: string; key: string; color: string; icon: string; statuses: TemplateStatus[]; labels: string[]; tickets: TemplateTicket[] };

// Status colors stay within what the status editor offers: the four defaults plus the palette.
const [OPEN, ACTIVE, REVIEW, DONE] = DEFAULT_STATUSES.map((x) => x.color) as [string, string, string, string];
const WAITING = PALETTE.orange;

type Def = {
  name: Text;
  key: string;
  color: string;
  icon: string;
  statuses: Array<{ name: Text; color: string; category: Category }>;
  labels: Text[];
  example: { title: Text; label?: number; priority: number };
};

const s = (de: string, en: string): Text => ({ de, en });
const st = (de: string, en: string, color: string, category: Category) => ({ name: s(de, en), color, category });
const open = st("Offen", "Open", OPEN, "open");
const working = st("In Arbeit", "In progress", ACTIVE, "active");
const review = st("Review", "Review", REVIEW, "active");
const done = st("Erledigt", "Done", DONE, "done");

const DEFS: Record<TeamType, Def> = {
  marketing: {
    name: s("Marketing", "Marketing"), key: "MKT", color: PALETTE.coral, icon: "📣",
    statuses: [open, working, review, done],
    labels: [s("Social", "Social"), s("Content", "Content"), s("Kampagne", "Campaign"), s("Design", "Design")],
    example: { title: s("Newsletter November planen", "Plan the November newsletter"), label: 1, priority: 2 },
  },
  it: {
    name: s("IT-Anfragen", "IT requests"), key: "IT", color: PALETTE.blue, icon: "🖥️",
    statuses: [open, working, st("Wartet", "Waiting", WAITING, "active"), done],
    labels: [s("Hardware", "Hardware"), s("Software", "Software"), s("Zugang", "Access"), s("Bug", "Bug")],
    example: { title: s("Laptop für neue Kollegin einrichten", "Set up a laptop for our new colleague"), label: 0, priority: 3 },
  },
  support: {
    name: s("Support", "Support"), key: "SUP", color: PALETTE.mint, icon: "🎧",
    statuses: [
      st("Neu", "New", OPEN, "open"),
      st("In Bearbeitung", "In progress", ACTIVE, "active"),
      st("Wartet auf Kunde", "Waiting for customer", WAITING, "active"),
      st("Gelöst", "Resolved", DONE, "done"),
    ],
    labels: [s("Frage", "Question"), s("Fehler", "Error"), s("Wunsch", "Request")],
    example: { title: s("Kunde fragt nach einer Rechnungskopie", "Customer asks for a copy of an invoice"), label: 0, priority: 2 },
  },
  office: {
    name: s("Office", "Office"), key: "OFF", color: PALETTE.sun, icon: "🗂️",
    statuses: [open, working, done],
    labels: [s("Einkauf", "Purchasing"), s("Termin", "Appointment"), s("Personal", "HR")],
    example: { title: s("Büromaterial nachbestellen", "Reorder office supplies"), label: 0, priority: 1 },
  },
  sales: {
    name: s("Vertrieb", "Sales"), key: "VTR", color: PALETTE.orange, icon: "🤝",
    statuses: [open, working, st("Angebot", "Quote", REVIEW, "active"), done],
    labels: [s("Lead", "Lead"), s("Angebot", "Quote"), s("Kunde", "Customer")],
    example: { title: s("Angebot für die Musterfirma schreiben", "Write a quote for Example Ltd"), label: 1, priority: 3 },
  },
  creative: {
    name: s("Design", "Design"), key: "DES", color: PALETTE.violet, icon: "🎨",
    statuses: [st("Briefing", "Briefing", OPEN, "open"), working, review, st("Freigegeben", "Approved", DONE, "done")],
    labels: [s("Print", "Print"), s("Web", "Web"), s("Social", "Social")],
    example: { title: s("Flyer für die Messe gestalten", "Design the trade fair flyer"), label: 0, priority: 2 },
  },
  dev: {
    name: s("Entwicklung", "Development"), key: "DEV", color: PALETTE.indigo, icon: "🧑‍💻",
    statuses: [open, working, review, done],
    labels: [s("Bug", "Bug"), s("Feature", "Feature"), s("Tech-Debt", "Tech debt")],
    example: { title: s("Login-Seite lädt langsam", "Login page loads slowly"), label: 0, priority: 2 },
  },
  general: {
    name: s("Allgemein", "General"), key: "ALL", color: PALETTE.slate, icon: "📋",
    statuses: [open, working, done],
    labels: [],
    example: { title: s("Nächstes Teammeeting vorbereiten", "Prepare the next team meeting"), priority: 1 },
  },
};

export const TUTORIAL_LABEL = s("Tutorial", "Tutorial");

const TUTORIAL = {
  create: {
    title: s("Drück C – und leg dein erstes eigenes Ticket an", "Press C – and create your first own ticket"),
    description: s(
      "Die Schnelleingabe versteht noch mehr: `Banner gestalten @name !hoch ^freitag` setzt Person, Priorität und Fälligkeit in einem Rutsch.",
      "Quick add understands more: `Design banner @name !high ^friday` sets person, priority and due date in one go.",
    ),
  },
  drag: (status: string): Text => s(`Zieh mich nach „${status}“ →`, `Drag me to “${status}” →`),
  status: s("Ändere meinen Status per Klick", "Change my status with a click"),
  subtasks: {
    title: s("Öffne mich und hak die Unteraufgaben ab", "Open me and tick off the subtasks"),
    items: [s("Esc schließt", "Esc closes"), s("↑/↓ springt zum nächsten Ticket", "↑/↓ jumps to the next ticket"), s("Cmd/Ctrl+K öffnet die Palette", "Cmd/Ctrl+K opens the palette")],
  },
  invite: {
    title: s("Lade dein Team ein", "Invite your team"),
    description: s("Einstellungen → Mitglieder: Adressen einfügen, fertig. Bis zu 100 Personen, kostenlos.", "Settings → Members: paste addresses, done. Up to 100 people, free."),
  },
  cleanup: s(
    "Alle Tutorial-Tickets tragen das Label „Tutorial“ – filtere danach und lösche sie gesammelt, wenn du sie nicht mehr brauchst.",
    "All tutorial tickets carry the label “Tutorial” – filter by it and delete them in one go when you no longer need them.",
  ),
};

/**
 * The project for a team area in the UI language. Ticket 2 matches the chosen start view, ticket 4
 * ("Lade dein Team ein") only appears when the invite step was skipped.
 */
export function buildTemplate(teamType: TeamType, opts: { locale: Locale; view: View; invited: boolean }): ProjectTemplate {
  const d = DEFS[teamType];
  const l = opts.locale;
  const tutorial = TUTORIAL_LABEL[l];
  const statuses = d.statuses.map((x) => ({ name: x.name[l], color: x.color, category: x.category }));
  const firstActive = statuses.find((x) => x.category === "active")?.name ?? statuses[0]!.name;
  const areaLabel = d.example.label === undefined ? undefined : d.labels[d.example.label]?.[l];

  const tickets: TemplateTicket[] = [
    { title: TUTORIAL.create.title[l], description: TUTORIAL.create.description[l], priority: 3, mine: true, labels: [tutorial], subtasks: [] },
    { title: opts.view === "board" ? TUTORIAL.drag(firstActive)[l] : TUTORIAL.status[l], priority: 2, labels: [tutorial], subtasks: [] },
    { title: TUTORIAL.subtasks.title[l], description: TUTORIAL.cleanup[l], priority: 1, labels: [tutorial], subtasks: TUTORIAL.subtasks.items.map((x) => x[l]) },
    ...(opts.invited ? [] : [{ title: TUTORIAL.invite.title[l], description: TUTORIAL.invite.description[l], priority: 2, labels: [tutorial], subtasks: [] }]),
    { title: d.example.title[l], priority: d.example.priority, labels: areaLabel ? [tutorial, areaLabel] : [tutorial], subtasks: [] },
  ];

  return { teamType, name: d.name[l], key: d.key, color: d.color, icon: d.icon, statuses, labels: [...d.labels.map((x) => x[l]), tutorial], tickets };
}

/** Upper bound of tutorial tickets per project – the overview still counts such a workspace as new. */
export const MAX_TEMPLATE_TICKETS = 5;
