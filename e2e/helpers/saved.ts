import type { Page } from "@playwright/test";

/** Resolves when a ticket write (PATCH/POST to the ticket endpoints) has been answered. */
export const ticketSaved = (page: Page) =>
  page.waitForResponse((r) => ["PATCH", "POST"].includes(r.request().method()) && /\/api\/w\/[^/]+\/(tickets|projects\/[^/]+\/tickets)(\/[^/]+)?$/.test(r.url()));
