export default {
  title: "Meine Aufgaben",
  titleOf: (name: string) => `Aufgaben von ${name}`,
  empty: "Nichts offen, das dir zugewiesen ist. 🎉",
  emptyOther: "Keine offenen Tickets zugewiesen.",
  count: (n: number) => (n === 1 ? "1 offenes Ticket in allen Projekten" : `${n} offene Tickets in allen Projekten`),
} as const;
