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
  avatar: {
    unassigned: "Nicht zugewiesen",
  },
} as const;

export type Messages = typeof de;
