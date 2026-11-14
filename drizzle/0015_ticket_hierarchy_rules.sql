-- Ticket hierarchy (epic → story/task → subtask), second line of defence behind
-- src/lib/ticket-hierarchy.ts. Errors carry "ticket_hierarchy:<code>" with the same codes.

-- Parent in the same project (and therefore the same workspace). DEFERRABLE so the delete
-- trigger below can detach or remove children after their parent row is gone.
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_parent_fk"
  FOREIGN KEY ("parent_id", "project_id") REFERENCES "ticket" ("id", "project_id")
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint

CREATE FUNCTION enforce_ticket_hierarchy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_type ticket_type;
BEGIN
  IF NEW."parent_id" IS NOT NULL THEN
    -- FOR SHARE: a concurrent type change of the parent waits for us (and then sees this child).
    SELECT "type" INTO parent_type FROM "ticket"
      WHERE "id" = NEW."parent_id" AND "project_id" = NEW."project_id" AND "workspace_id" = NEW."workspace_id"
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ticket_hierarchy:invalid_parent' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW."type" = 'epic' AND NEW."parent_id" IS NOT NULL THEN
    RAISE EXCEPTION 'ticket_hierarchy:epic_no_parent' USING ERRCODE = 'check_violation';
  ELSIF NEW."type" = 'subtask' AND NEW."parent_id" IS NULL THEN
    RAISE EXCEPTION 'ticket_hierarchy:subtask_needs_parent' USING ERRCODE = 'check_violation';
  ELSIF NEW."type" = 'subtask' AND parent_type NOT IN ('story', 'task') THEN
    RAISE EXCEPTION 'ticket_hierarchy:parent_must_be_story_or_task' USING ERRCODE = 'check_violation';
  ELSIF NEW."type" IN ('story', 'task') AND NEW."parent_id" IS NOT NULL AND parent_type <> 'epic' THEN
    RAISE EXCEPTION 'ticket_hierarchy:parent_must_be_epic' USING ERRCODE = 'check_violation';
  END IF;

  -- A type change must keep every child valid.
  IF TG_OP = 'UPDATE' AND NEW."type" <> OLD."type" THEN
    IF NEW."type" <> 'epic' AND EXISTS (
      SELECT 1 FROM "ticket" WHERE "parent_id" = NEW."id" AND "type" IN ('story', 'task')
    ) THEN
      RAISE EXCEPTION 'ticket_hierarchy:epic_has_children' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."type" NOT IN ('story', 'task') AND EXISTS (
      SELECT 1 FROM "ticket" WHERE "parent_id" = NEW."id" AND "type" = 'subtask'
    ) THEN
      RAISE EXCEPTION 'ticket_hierarchy:has_subtasks' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "ticket_hierarchy"
  BEFORE INSERT OR UPDATE OF "type", "parent_id", "project_id" ON "ticket"
  FOR EACH ROW EXECUTE FUNCTION enforce_ticket_hierarchy();
--> statement-breakpoint

-- Deleting a ticket deletes its subtasks (their comments, attachments and checklists cascade
-- with them) and detaches stories/tasks of a deleted epic. AFTER trigger: rows already removed
-- by the same statement (workspace or project deletion) are simply not found any more.
CREATE FUNCTION ticket_delete_children() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "ticket" WHERE "parent_id" = OLD."id" AND "type" = 'subtask';
  UPDATE "ticket" SET "parent_id" = NULL WHERE "parent_id" = OLD."id";
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "ticket_children_on_delete"
  AFTER DELETE ON "ticket"
  FOR EACH ROW EXECUTE FUNCTION ticket_delete_children();
