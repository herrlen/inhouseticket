ALTER TABLE "notification" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_pref" ADD COLUMN "email_digest" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_pref" ADD COLUMN "last_digest_on" varchar(10);--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "workload_threshold" smallint DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_workload_threshold_range" CHECK ("workload_threshold" BETWEEN 1 AND 999);
--> statement-breakpoint
CREATE INDEX "notification_unread_idx" ON "notification" ("user_id", "workspace_id") WHERE "read_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "ticket_completed_at_idx" ON "ticket" ("workspace_id", "completed_at") WHERE "completed_at" IS NOT NULL;
