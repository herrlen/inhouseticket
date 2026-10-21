export default {
  mail: (inviter: string, workspace: string) => ({
    subject: `${inviter} lädt dich zu ${workspace} auf inhouseticket ein`,
    heading: `Einladung zu ${workspace}`,
    intro: `${inviter} hat dich eingeladen, im Workspace „${workspace}“ auf inhouseticket mitzuarbeiten.`,
    button: "Einladung annehmen",
    outro: "Die Einladung ist 7 Tage gültig. Hast du schon ein Konto, meldest du dich an – sonst registrierst du dich auf der Seite der Einladung mit dieser Adresse.",
  }),
} as const;
