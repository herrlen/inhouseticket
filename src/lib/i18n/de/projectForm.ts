export default {
  name: "Name",
  key: "Kürzel",
  keyHint: (key: string) => `Tickets heißen dann ${key}-1, ${key}-2 … Das Kürzel lässt sich später nicht ändern.`,
  color: "Farbe",
  icon: "Icon",
  iconPlaceholder: "z. B. 📣",
  iconHint: "Optional, genau ein Emoji.",
  folder: "Ordner",
  noFolder: "Kein Ordner",
} as const;
