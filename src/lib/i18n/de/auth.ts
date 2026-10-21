export default {
  freemail:
    "Bitte nutze deine Firmen-E-Mail-Adresse. Adressen von Gmail, GMX, Web.de, Outlook & Co. sind nicht möglich – inhouseticket ist für Teams einer Firma gedacht.",
  invalidEmail: "Das sieht nicht nach einer gültigen E-Mail-Adresse aus.",
  betaClosed:
    "inhouseticket ist gerade in einer geschlossenen Beta. Du möchtest mitmachen? Schreib uns an hello@inhouseticket.com.",
  mail: {
    subject: "Dein Anmeldelink für inhouseticket",
    heading: "Anmelden bei inhouseticket",
    intro: "Klick auf den Button, um dich anzumelden. Der Link ist 15 Minuten gültig und funktioniert einmal.",
    button: "Jetzt anmelden",
    outro: "Du hast keinen Link angefordert? Dann ignoriere diese E-Mail einfach.",
  },
  /** After a password sign-in attempt on an account that has no password yet. */
  noPasswordMail: {
    subject: "Dein Anmeldelink für inhouseticket",
    heading: "Du hast noch kein Passwort",
    intro:
      "Du wolltest dich mit einem Passwort anmelden, aber für dein Konto ist noch keins festgelegt. Mit diesem Link meldest du dich an und legst eins fest. Er ist 15 Minuten gültig und funktioniert einmal.",
    button: "Anmelden und Passwort festlegen",
    outro: "Das warst du nicht? Dann ignoriere diese E-Mail einfach – ohne den Link passiert nichts.",
  },
  /** A sign-in link was requested for an address without an account – the link never creates one. */
  noAccountMail: {
    subject: "Für diese Adresse gibt es noch kein Konto",
    heading: "Noch kein Konto bei inhouseticket",
    intro:
      "Jemand – vermutlich du – wollte sich mit dieser Adresse per Link bei inhouseticket anmelden. Für diese Adresse gibt es aber noch kein Konto. Registriere dich hier, danach meldest du dich mit deinem Passwort oder per Link an.",
    button: "Jetzt registrieren",
    outro: "Das warst nicht du? Dann ignoriere diese E-Mail einfach – ohne Registrierung entsteht kein Konto.",
  },
} as const;
