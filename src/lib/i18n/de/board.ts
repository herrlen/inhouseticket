export default {
  label: (project: string) => `Board ${project}`,
  column: (name: string) => `Spalte ${name}`,
  cardRole: "verschiebbare Karte",
  add: "Ticket",
  addIn: (status: string) => `Neues Ticket in ${status}`,
  addPlaceholder: "Titel … (Enter)",
  countLabel: (n: number) => (n === 1 ? "1 Ticket" : `${n} Tickets`),
  wipLabel: (n: number, max: number) => `${n} von maximal ${max} Tickets`,
  wipOver: (max: number) => `WIP-Limit von ${max} überschritten`,
  dnd: {
    instructions:
      "Leertaste zum Aufnehmen. Mit den Pfeiltasten verschieben, auch in andere Spalten. Leertaste oder Enter zum Ablegen, Escape zum Abbrechen. Enter öffnet das Ticket.",
    start: (card: string) => `${card} aufgenommen.`,
    over: (card: string, target: string) => `${card} ist über ${target}.`,
    outside: (card: string) => `${card} ist außerhalb des Boards.`,
    end: (card: string, target: string) => `${card} bei ${target} abgelegt.`,
    cancel: (card: string) => `Verschieben von ${card} abgebrochen.`,
  },
} as const;
