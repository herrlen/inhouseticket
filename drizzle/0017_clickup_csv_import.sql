CREATE TABLE "import_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" varchar(20) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"bytes" integer NOT NULL,
	"tasks" integer DEFAULT 0 NOT NULL,
	"run_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_run" DROP CONSTRAINT "sync_run_trigger";--> statement-breakpoint
ALTER TABLE "import_upload" ADD CONSTRAINT "import_upload_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_upload" ADD CONSTRAINT "import_upload_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_upload_workspace_id_created_at_index" ON "import_upload" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_trigger" CHECK ("sync_run"."trigger" in ('initial', 'manual', 'schedule', 'csv'));