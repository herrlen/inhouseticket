import { z } from "zod";
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/limits";
import { TICKET_TYPES } from "@/lib/ticket-hierarchy";

export const PRIORITY_VALUES = [0, 1, 2, 3, 4] as const; // none, low, medium, high, urgent

export const ticketTitleSchema = z
  .string()
  .trim()
  .min(1, "Bitte einen Titel eingeben.")
  .max(MAX_TITLE, `Höchstens ${MAX_TITLE} Zeichen.`);

export const ticketDescriptionSchema = z
  .string()
  .max(MAX_DESCRIPTION, `Höchstens ${MAX_DESCRIPTION} Zeichen.`)
  .transform((s) => (s.trim() === "" ? null : s));

/** Date-only due date "YYYY-MM-DD" (stored as UTC midnight) or null. */
export const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Ungültiges Datum.")
  .nullable();

export const prioritySchema = z.number().int().min(0).max(4);

export const ticketTypeSchema = z.enum(TICKET_TYPES);

export const createTicketSchema = z.object({
  workspaceId: z.uuid(),
  projectId: z.uuid(),
  title: ticketTitleSchema,
  statusId: z.uuid().optional(),
  priority: prioritySchema.optional(),
  assigneeId: z.string().min(1).max(100).nullable().optional(),
  dueDate: dueDateSchema.optional(),
  type: ticketTypeSchema.optional(),
  /** Parent ticket in the same project (rules: src/lib/ticket-hierarchy.ts). */
  parentId: z.uuid().nullable().optional(),
});

/** Partial update; only present keys change. */
export const ticketPatchSchema = z
  .object({
    title: ticketTitleSchema,
    description: ticketDescriptionSchema,
    statusId: z.uuid(),
    priority: prioritySchema,
    assigneeId: z.string().min(1).max(100).nullable(),
    dueDate: dueDateSchema,
    labelIds: z.array(z.uuid()).max(20),
    type: ticketTypeSchema,
    parentId: z.uuid().nullable(),
    /** Fractional sort key (board/list drag & drop). */
    sort: z.string().min(1).max(200).regex(/^[0-9A-Za-z]+$/),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nichts zu ändern.");

export type TicketPatch = z.infer<typeof ticketPatchSchema>;

export const bulkPatchSchema = z
  .object({ statusId: z.uuid(), priority: prioritySchema, assigneeId: z.string().min(1).max(100).nullable() })
  .partial()
  .refine((p) => Object.keys(p).length === 1, "Genau ein Feld pro Sammel-Aktion.");

export const labelSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(50, "Höchstens 50 Zeichen."),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

/** Stored representation of a date-only due date. */
export function dueDateToTimestamp(date: string | null): Date | null {
  return date ? new Date(`${date}T00:00:00Z`) : null;
}

export function timestampToDueDate(ts: Date | string | null): string | null {
  if (!ts) return null;
  return (typeof ts === "string" ? new Date(ts) : ts).toISOString().slice(0, 10);
}
