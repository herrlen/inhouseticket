export default {
  comments: (n: number) => (n === 1 ? "1 Kommentar" : `${n} Kommentare`),
  attachments: (n: number) => (n === 1 ? "1 Anhang" : `${n} Anhänge`),
} as const;
