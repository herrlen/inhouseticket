CREATE TYPE "public"."ticket_type" AS ENUM('epic', 'story', 'task', 'subtask');--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "type" "ticket_type" DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
CREATE INDEX "ticket_parent_id_index" ON "ticket" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_parent_not_self" CHECK ("ticket"."parent_id" IS NULL OR "ticket"."parent_id" <> "ticket"."id");