export default {
  title: (workspace: string) => `Einladung zu ${workspace}`,
  text: (inviter: string, email: string) => `${inviter} hat ${email} eingeladen.`,
  signIn: "Anmelden und annehmen",
  noAccount: "Noch kein Konto?",
  register: "Registrieren und annehmen",
  wrongUser: (invited: string, current: string) =>
    `Diese Einladung gilt für ${invited}, du bist aber als ${current} angemeldet. Melde dich ab und mit der eingeladenen Adresse wieder an.`,
  goneTitle: "Einladung nicht gültig",
  goneText: "Diese Einladung ist abgelaufen, wurde schon angenommen oder zurückgezogen.",
  toLogin: "Zur Anmeldung",
} as const;
