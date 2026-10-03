-- Limits enforced in the database as a second line of defence (src/lib/limits.ts is the
-- first). Keep the numbers in sync with MAX_SUBTASKS and MAX_USERS_PER_WORKSPACE.
-- The parent row is locked FOR UPDATE so concurrent inserts cannot both pass the count.

-- Project → folder must stay inside the workspace; deleting a folder only clears folder_id.
ALTER TABLE "project" ADD CONSTRAINT "project_folder_fk"
  FOREIGN KEY ("folder_id", "workspace_id") REFERENCES "folder" ("id", "workspace_id")
  ON DELETE SET NULL ("folder_id");
--> statement-breakpoint

CREATE FUNCTION enforce_max_subtasks() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."ticket_id" = NEW."ticket_id" THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "ticket" WHERE "id" = NEW."ticket_id" FOR UPDATE;
  IF (SELECT count(*) FROM "subtask" WHERE "ticket_id" = NEW."ticket_id") >= 5 THEN
    RAISE EXCEPTION 'max_subtasks: a ticket can have at most 5 subtasks'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "subtask_max_per_ticket"
  BEFORE INSERT OR UPDATE OF "ticket_id" ON "subtask"
  FOR EACH ROW EXECUTE FUNCTION enforce_max_subtasks();
--> statement-breakpoint

CREATE FUNCTION enforce_max_members() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only rows that become active count against the limit.
  IF NEW."status" <> 'active'
     OR (TG_OP = 'UPDATE' AND OLD."status" = 'active' AND OLD."workspace_id" = NEW."workspace_id") THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM "workspace" WHERE "id" = NEW."workspace_id" FOR UPDATE;
  IF (SELECT count(*) FROM "membership"
      WHERE "workspace_id" = NEW."workspace_id" AND "status" = 'active') >= 100 THEN
    RAISE EXCEPTION 'max_users: a workspace can have at most 100 active users'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "membership_max_active"
  BEFORE INSERT OR UPDATE OF "status", "workspace_id" ON "membership"
  FOR EACH ROW EXECUTE FUNCTION enforce_max_members();
