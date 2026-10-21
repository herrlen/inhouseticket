export default {
  statusOf: (ticket: string, status: string) => `Status von ${ticket}: ${status}`,
  priorityOf: (ticket: string, p: string) => `Priorität von ${ticket}: ${p}`,
  assigneeOf: (ticket: string, name: string) => `Zuständig für ${ticket}: ${name}`,
  dueOf: (ticket: string) => `Fälligkeit von ${ticket}`,
} as const;
