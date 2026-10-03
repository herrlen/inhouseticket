// German UI strings. Keep keys stable; an English file can follow the same shape later.
export const de = {
  common: {
    close: "Schließen",
    retry: "Erneut versuchen",
    notifications: "Benachrichtigungen",
    signOut: "Abmelden",
    skipToContent: "Zum Inhalt springen",
    mainNav: "Hauptnavigation",
  },
  input: {
    counter: (count: number, max: number) => `${count} von ${max} Zeichen`,
  },
  auth: {
    freemail:
      "Bitte nutze deine Firmen-E-Mail-Adresse. Adressen von Gmail, GMX, Web.de, Outlook & Co. sind nicht möglich – inhouseticket ist für Teams einer Firma gedacht.",
    invalidEmail: "Das sieht nicht nach einer gültigen E-Mail-Adresse aus.",
    mail: {
      subject: "Dein Anmeldelink für inhouseticket",
      heading: "Anmelden bei inhouseticket",
      intro: "Klick auf den Button, um dich anzumelden. Der Link ist 15 Minuten gültig und funktioniert einmal.",
      button: "Jetzt anmelden",
      outro: "Du hast keinen Link angefordert? Dann ignoriere diese E-Mail einfach.",
    },
  },
  home: {
    claim: "Tickets. Ohne Ballast.",
  },
  login: {
    title: "Anmelden",
    subtitle: "Ohne Passwort – wir schicken dir einen Link.",
    email: "Firmen-E-Mail",
    hint: "Mit deiner Firmenadresse landest du im Workspace deines Teams.",
    submit: "Anmeldelink senden",
    sending: "Wird gesendet …",
    sentTitle: "Schau in dein Postfach",
    sentText: (email: string) => `Wir haben einen Anmeldelink an ${email} geschickt. Er ist 15 Minuten gültig.`,
    otherEmail: "Andere Adresse verwenden",
    linkError: "Dieser Anmeldelink ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.",
    tooMany: "Zu viele Versuche. Bitte warte eine Minute und versuch es dann noch einmal.",
    failed: "Das hat nicht geklappt. Bitte versuch es noch einmal.",
  },
  start: {
    title: (name: string) => `Hallo ${name}`,
    yourWorkspaces: "Deine Workspaces",
    invitations: "Einladungen",
    invitedBy: (inviter: string, workspace: string) => `${inviter} hat dich zu „${workspace}“ eingeladen.`,
    accept: "Annehmen",
    join: "Beitreten",
    domainWorkspace: (workspace: string) => `Dein Team arbeitet schon in „${workspace}“.`,
    askForInvite: (workspace: string, domain: string) =>
      `Für ${domain} gibt es schon den Workspace „${workspace}“. Bitte jemanden aus deinem Team, dich einzuladen.`,
    full: "Dieser Workspace hat bereits 100 Mitglieder. Bitte wende dich an den Owner.",
    invitationGone: "Diese Einladung ist abgelaufen oder wurde zurückgezogen.",
    autoJoinOff: "Beitritt ist nur mit Einladung möglich.",
  },
  invitePage: {
    title: (workspace: string) => `Einladung zu ${workspace}`,
    text: (inviter: string, email: string) => `${inviter} hat ${email} eingeladen.`,
    signIn: "Anmelden und annehmen",
    wrongUser: (invited: string, current: string) =>
      `Diese Einladung gilt für ${invited}, du bist aber als ${current} angemeldet. Melde dich ab und mit der eingeladenen Adresse wieder an.`,
    goneTitle: "Einladung nicht gültig",
    goneText: "Diese Einladung ist abgelaufen, wurde schon angenommen oder zurückgezogen.",
    toLogin: "Zur Anmeldung",
  },
  onboarding: {
    title: "Workspace anlegen",
    subtitle: (domain: string) => `Du bist die erste Person von ${domain}. Richte den Workspace für dein Team ein.`,
    name: "Name des Workspace",
    color: "Farbe",
    template: "Erstes Projekt",
    templateHint: "Mit drei Beispiel-Tickets zum Ausprobieren.",
    invites: "Kollegen einladen",
    optional: "optional",
    invitesHint: "Firmen-E-Mails, durch Komma getrennt.",
    submit: "Workspace anlegen",
    creating: "Wird angelegt …",
  },
  workspace: {
    welcome: (name: string) => `Willkommen bei ${name}`,
  },
  members: {
    title: "Mitglieder",
  },
  palette: {
    coral: "Koralle", orange: "Orange", sun: "Sonne", lime: "Limette", mint: "Mint", turquoise: "Türkis",
    blue: "Blau", indigo: "Indigo", violet: "Violett", pink: "Pink", berry: "Beere", slate: "Schiefer",
  },
  invite: {
    mail: (inviter: string, workspace: string) => ({
      subject: `${inviter} lädt dich zu ${workspace} auf inhouseticket ein`,
      heading: `Einladung zu ${workspace}`,
      intro: `${inviter} hat dich eingeladen, im Workspace „${workspace}“ auf inhouseticket mitzuarbeiten.`,
      button: "Einladung annehmen",
      outro: "Die Einladung ist 7 Tage gültig. Du meldest dich ohne Passwort mit deiner E-Mail-Adresse an.",
    }),
  },
  avatar: {
    unassigned: "Nicht zugewiesen",
  },
} as const;

export type Messages = typeof de;
