CREATE TABLE "integration_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_event_integrationId_externalId_kind_unique" UNIQUE("integration_id","external_id","kind"),
	CONSTRAINT "integration_event_kind" CHECK ("integration_event"."kind" in ('task', 'deleted', 'comment'))
);
--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "webhook" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "webhook_status" varchar(20);--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "webhook_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "webhook_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_event" ADD CONSTRAINT "integration_event_integration_id_workspace_id_integration_id_workspace_id_fk" FOREIGN KEY ("integration_id","workspace_id") REFERENCES "public"."integration"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_event_integration_id_received_at_index" ON "integration_event" USING btree ("integration_id","received_at");--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_webhook_status" CHECK ("integration"."webhook_status" in ('active', 'failing', 'failed'));