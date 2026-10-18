CREATE TABLE "pending_registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"next" text,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_registration_email_unique" UNIQUE("email"),
	CONSTRAINT "pending_registration_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "pending_registration_email_lower" CHECK ("pending_registration"."email" = lower("pending_registration"."email")),
	CONSTRAINT "pending_registration_name_len" CHECK (char_length("pending_registration"."name") between 1 and 100),
	CONSTRAINT "pending_registration_next_len" CHECK ("pending_registration"."next" is null or char_length("pending_registration"."next") <= 2000),
	CONSTRAINT "pending_registration_attempts" CHECK ("pending_registration"."failed_attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE INDEX "pending_registration_expires_at_index" ON "pending_registration" USING btree ("expires_at");