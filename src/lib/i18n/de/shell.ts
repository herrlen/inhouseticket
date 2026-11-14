export default {
  sidebar: "Seitenleiste",
  overview: "Übersicht",
  collapse: "Einklappen",
  expand: "Seitenleiste ausklappen",
  openMenu: "Menü öffnen",
  breadcrumb: "Pfad",
  userMenu: (name: string) => `Konto von ${name}`,
  switchWorkspace: "Workspace wechseln",
  search: "Suchen",
  confettiOn: "Konfetti einschalten",
  confettiOff: "Konfetti ausschalten",
  // Titles of the settings pages for menu, breadcrumb and command palette. Copies, so the shell does not
  // bundle those pages' areas; i18n.test.ts keeps them equal to each page's own title.
  pages: {
    dashboard: "Dashboard",
    members: "Mitglieder",
    admin: "Betreiber-Übersicht",
    account: "Konto",
    claude: "Mit Claude verbinden",
    claudeNav: "Claude",
    data: "Daten & Workspace",
    dataNav: "Daten",
    import: "Projekte importieren",
    integrations: "Integrationen",
  },
} as const;
