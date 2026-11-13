// Shared by client and server: which URL parameters make up a saved view.
export const VIEW_PARAMS = ["assignee", "priority", "due", "label", "type", "q", "group", "sort", "view", "done", "subtasks"] as const;

export function cleanViewQuery(query: string | URLSearchParams): string {
  const input = typeof query === "string" ? new URLSearchParams(query) : query;
  const out = new URLSearchParams();
  for (const key of VIEW_PARAMS) {
    const v = input.get(key);
    if (v) out.set(key, v.slice(0, 200));
  }
  return out.toString();
}
