export default {
  title: "Inbox",
  unread: (n: number) => (n === 1 ? "1 ungelesen" : `${n} ungelesen`),
  empty: "Keine Benachrichtigungen. Hier landen Zuweisungen, Erwähnungen und Statuswechsel an deinen Tickets.",
  markAll: "Alle als gelesen markieren",
  digest: "Täglicher E-Mail-Digest (7 Uhr)",
  digestOn: "Digest ist an",
  digestOff: "Digest ist aus",
  turnOn: "Einschalten",
  turnOff: "Ausschalten",
  navLabel: (n: number) => (n ? `Inbox, ${n} ungelesen` : "Inbox"),
} as const;
