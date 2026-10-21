export default {
  aTicket: "ein Ticket",
  assigned: (who: string, what: string) => `${who} hat dir ${what} zugewiesen`,
  mention: (who: string, what: string) => `${who} hat dich in ${what} erwähnt`,
  status: (who: string, what: string, to: string) => `${who} hat ${what} auf „${to}“ gesetzt`,
  dueTomorrow: (what: string) => `${what} ist morgen fällig`,
  unreadSr: "ungelesen",
} as const;
