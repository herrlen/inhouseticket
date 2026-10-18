// Columns of the list view that a person can switch off (docs/ONBOARDING.md §4). Plain, client-safe;
// stored per person and workspace in user_pref.hidden_columns.
export const LIST_COLUMNS = ["status", "priority", "assignee", "due", "comments"] as const;
export type ListColumn = (typeof LIST_COLUMNS)[number];

export function cleanHiddenColumns(value: readonly string[]): ListColumn[] {
  return LIST_COLUMNS.filter((c) => value.includes(c));
}
