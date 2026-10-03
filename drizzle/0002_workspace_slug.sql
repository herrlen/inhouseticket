ALTER TABLE "workspace" ADD COLUMN "slug" varchar(63) NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_slug_format" CHECK ("workspace"."slug" ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$');