// German UI strings. Keep keys stable; an English file can follow the same shape later.
export const de = {
  common: {
    close: "Schließen",
    retry: "Erneut versuchen",
    notifications: "Benachrichtigungen",
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
  avatar: {
    unassigned: "Nicht zugewiesen",
  },
} as const;

export type Messages = typeof de;
