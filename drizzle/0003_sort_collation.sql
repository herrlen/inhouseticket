-- Fractional-index sort keys ("a0", "a0V", "Zz") must compare byte-wise. The default
-- collation (e.g. en_US.utf8) ignores case and would scramble the order.
ALTER TABLE "folder" ALTER COLUMN "sort" TYPE text COLLATE "C";
--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "sort" TYPE text COLLATE "C";
--> statement-breakpoint
ALTER TABLE "status" ALTER COLUMN "sort" TYPE text COLLATE "C";
--> statement-breakpoint
ALTER TABLE "ticket" ALTER COLUMN "sort" TYPE text COLLATE "C";
--> statement-breakpoint
ALTER TABLE "subtask" ALTER COLUMN "sort" TYPE text COLLATE "C";
