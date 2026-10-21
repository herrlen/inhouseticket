export default {
  welcome: (name: string) => `Willkommen bei ${name}`,
  archived: "Archiviert",
  restore: "Wiederherstellen",
  restoreLabel: (name: string) => `${name} wiederherstellen`,
  importTitle: "Projekte aus einem anderen Tool mitnehmen",
  importText: "Kommt ihr von Jira, ClickUp, Notion oder monday.com? Lade die Export-Datei hoch – nach einer Vorschau entsteht daraus ein neues Projekt.",
  importButton: "Projekte importieren",
  importHelp: "Wo finde ich den Export?",
} as const;
