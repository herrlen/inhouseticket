ALTER TABLE "attachment" ADD COLUMN "file_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "attachment" ADD COLUMN "data" "bytea" NOT NULL;--> statement-breakpoint
-- The stored bytes must match the declared size (which is already capped at 100 KB).
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_data_matches_bytes" CHECK (octet_length("data") = "bytes");
--> statement-breakpoint
-- Keep in sync with MAX_ATTACHMENTS_PER_TICKET in src/lib/limits.ts.
CREATE FUNCTION enforce_max_attachments() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM "ticket" WHERE "id" = NEW."ticket_id" FOR UPDATE;
  IF (SELECT count(*) FROM "attachment" WHERE "ticket_id" = NEW."ticket_id") >= 20 THEN
    RAISE EXCEPTION 'max_attachments: a ticket can have at most 20 attachments'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "attachment_max_per_ticket"
  BEFORE INSERT ON "attachment"
  FOR EACH ROW EXECUTE FUNCTION enforce_max_attachments();
