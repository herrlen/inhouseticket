export default {
  empty: "Noch keine Tickets in diesem Projekt.",
  tableCaption: (name: string) => `Tickets in ${name}`,
  colKey: "Key",
  colTitle: "Titel",
  colStatus: "Status",
  colPriority: "Priorität",
} as const;
