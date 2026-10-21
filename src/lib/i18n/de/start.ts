export default {
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
} as const;
