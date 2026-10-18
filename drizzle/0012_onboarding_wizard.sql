CREATE TABLE "onboarding_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"previous_tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text,
	"source_other" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_answer_workspaceId_userId_unique" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "onboarding_answer_tools" CHECK (cardinality("onboarding_answer"."previous_tools") <= 9 and "onboarding_answer"."previous_tools" <@ array['excel', 'jira', 'trello', 'asana', 'clickup', 'monday', 'notion', 'none', 'other']::text[]),
	CONSTRAINT "onboarding_answer_source" CHECK ("onboarding_answer"."source" is null or "onboarding_answer"."source" in ('search', 'linkedin', 'referral', 'ai', 'podcast', 'reviews', 'producthunt', 'other')),
	CONSTRAINT "onboarding_answer_source_other" CHECK ("onboarding_answer"."source_other" is null or "onboarding_answer"."source" = 'other')
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "timezone" varchar(64) DEFAULT 'Europe/Berlin' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_pref" ADD COLUMN "default_view" text DEFAULT 'board' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_pref" ADD COLUMN "onboarding_step" smallint;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "team_type" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_answer" ADD CONSTRAINT "onboarding_answer_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_answer" ADD CONSTRAINT "onboarding_answer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_pref" ADD CONSTRAINT "user_pref_default_view" CHECK ("user_pref"."default_view" in ('board', 'list'));--> statement-breakpoint
ALTER TABLE "user_pref" ADD CONSTRAINT "user_pref_onboarding_step" CHECK ("user_pref"."onboarding_step" is null or "user_pref"."onboarding_step" between 1 and 6);--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_team_type" CHECK ("workspace"."team_type" is null or "workspace"."team_type" in ('marketing', 'it', 'support', 'office', 'sales', 'creative', 'dev', 'general'));--> statement-breakpoint
-- Backfill (ADR 006): people and workspaces from before the wizard are never sent into it.
UPDATE "user" SET "onboarded_at" = now() WHERE EXISTS (SELECT 1 FROM "membership" m WHERE m."user_id" = "user"."id");--> statement-breakpoint
UPDATE "workspace" SET "onboarding_completed_at" = "created_at";--> statement-breakpoint
-- Project links opened the list until now; existing preferences keep it.
UPDATE "user_pref" SET "default_view" = 'list';
