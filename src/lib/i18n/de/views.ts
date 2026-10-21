export default {
  nameRequired: "Bitte einen Namen eingeben.",
  nameTooLong: "Höchstens 60 Zeichen.",
  label: "Gespeicherte Ansichten",
  save: "Ansicht speichern",
  namePlaceholder: "Name der Ansicht",
  remove: (name: string) => `Ansicht ${name} löschen`,
  saved: (name: string) => `Ansicht „${name}“ gespeichert.`,
} as const;
