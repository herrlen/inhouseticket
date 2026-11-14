export default {
  nav: "Rechtliches",
  imprint: "Impressum",
  privacy: "Datenschutz",
  terms: "AGB",
  dpa: "AVV",
  germanOnly: "",
  /** Company instance without IMPRINT_URL / PRIVACY_URL (src/lib/instance.ts). */
  instanceTitle: "Über diese Instanz",
  instanceOperator: (name: string) => `Diese Instanz von inhouseticket wird von ${name} betrieben.`,
  instanceOperatorUnnamed: "Diese Instanz von inhouseticket wird von deinem Unternehmen selbst betrieben.",
  instanceContact: "Impressum und Datenschutzhinweise erhältst du dort. Bei Fragen wende dich an die Person, die inhouseticket bei euch betreut.",
} as const;
