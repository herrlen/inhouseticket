export default {
  label: "Filter",
  person: "Person",
  priority: "Priorität",
  due: "Fällig",
  labelFilter: "Label",
  all: "Alle",
  me: "Ich",
  text: "Tickets filtern",
  textPlaceholder: "Filtern …",
  reset: "Filter zurücksetzen",
  count: (shown: number, total: number) => `${shown} von ${total} Tickets`,
  noMatch: "Keine Tickets passen zu den Filtern.",
} as const;
