// Open-ticket counts in the sidebar, updated from the project view without router.refresh():
// since Next 16.4 a refresh racing a query-string change wrote Next's older URL back into the
// address bar, which reopened the previous ticket and reset the open dialog.

export const OPEN_COUNT_EVENT = "inhouseticket:open-count";

export type OpenCountDetail = { projectId: string; openCount: number };

export function announceOpenCount(detail: OpenCountDetail) {
  window.dispatchEvent(new CustomEvent<OpenCountDetail>(OPEN_COUNT_EVENT, { detail }));
}

export function onOpenCount(listener: (detail: OpenCountDetail) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<OpenCountDetail>).detail);
  window.addEventListener(OPEN_COUNT_EVENT, handler);
  return () => window.removeEventListener(OPEN_COUNT_EVENT, handler);
}
