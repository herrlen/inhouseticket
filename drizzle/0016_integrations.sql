CREATE TABLE "external_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"local_id" uuid NOT NULL,
	"external_parent_id" varchar(100),
	"external_updated_at" timestamp with time zone,
	"url" varchar(500),
	"pending_detail" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_ref_integrationId_entityType_externalId_unique" UNIQUE("integration_id","entity_type","external_id"),
	CONSTRAINT "external_ref_entity_type" CHECK ("external_ref"."entity_type" in ('space', 'list', 'task', 'comment'))
);
--> statement-breakpoint
CREATE TABLE "field_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"external_value" varchar(200) NOT NULL,
	"local_value" varchar(200) NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "field_mapping_integrationId_kind_externalValue_unique" UNIQUE("integration_id","kind","external_value"),
	CONSTRAINT "field_mapping_kind" CHECK ("field_mapping"."kind" in ('status', 'user', 'priority'))
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" varchar(30) NOT NULL,
	"credentials" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'setup' NOT NULL,
	"last_error" varchar(500),
	"last_sync_at" timestamp with time zone,
	"sync_requested_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_workspaceId_provider_unique" UNIQUE("workspace_id","provider"),
	CONSTRAINT "integration_id_workspaceId_unique" UNIQUE("id","workspace_id"),
	CONSTRAINT "integration_provider" CHECK ("integration"."provider" in ('clickup')),
	CONSTRAINT "integration_status" CHECK ("integration"."status" in ('setup', 'active', 'error'))
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"trigger" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" varchar(500),
	CONSTRAINT "sync_run_trigger" CHECK ("sync_run"."trigger" in ('initial', 'manual', 'schedule'))
);
--> statement-breakpoint
ALTER TABLE "external_ref" ADD CONSTRAINT "external_ref_integration_id_workspace_id_integration_id_workspace_id_fk" FOREIGN KEY ("integration_id","workspace_id") REFERENCES "public"."integration"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_mapping" ADD CONSTRAINT "field_mapping_integration_id_workspace_id_integration_id_workspace_id_fk" FOREIGN KEY ("integration_id","workspace_id") REFERENCES "public"."integration"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_integration_id_workspace_id_integration_id_workspace_id_fk" FOREIGN KEY ("integration_id","workspace_id") REFERENCES "public"."integration"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_ref_workspace_id_local_id_index" ON "external_ref" USING btree ("workspace_id","local_id");--> statement-breakpoint
CREATE INDEX "external_ref_pending_idx" ON "external_ref" USING btree ("integration_id") WHERE "external_ref"."pending_detail";--> statement-breakpoint
CREATE INDEX "sync_run_integration_id_started_at_index" ON "sync_run" USING btree ("integration_id","started_at");