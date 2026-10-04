// Runs against a real Postgres (pnpm test:db). Every test runs in a transaction that is
// rolled back, so the database stays clean.
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TICKET, MAX_SUBTASKS, MAX_TITLE, MAX_USERS_PER_WORKSPACE } from "@/lib/limits";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1, onnotice: () => {} });

afterAll(() => sql.end());

class Rollback extends Error {}

type Tx = postgres.TransactionSql;

/** Runs `fn` inside a transaction and always rolls it back. */
async function inRollback(fn: (tx: Tx) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

/** Asserts that `fn` fails inside a savepoint, keeping the outer transaction usable. */
async function expectDbError(tx: Tx, fn: (sp: Tx) => Promise<unknown>, pattern: RegExp) {
  await expect(tx.savepoint((sp) => fn(sp as Tx))).rejects.toThrow(pattern);
}

let seq = 0;
async function seed(tx: Tx) {
  const n = ++seq;
  const [u] = await tx`
    INSERT INTO "user" (id, name, email) VALUES (${`u${n}`}, 'Test', ${`t${n}@firma${n}.de`})
    RETURNING id`;
  const [ws] = await tx`
    INSERT INTO workspace (name, domain, slug) VALUES ('Firma', ${`firma${n}.de`}, ${`firma-${n}`}) RETURNING id`;
  const [pr] = await tx`
    INSERT INTO project (workspace_id, name, key, color, sort)
    VALUES (${ws!.id}, 'Marketing', 'MKT', '#FF6B5B', 'a0') RETURNING id`;
  const [st] = await tx`
    INSERT INTO status (workspace_id, project_id, name, color, category, sort)
    VALUES (${ws!.id}, ${pr!.id}, 'Offen', '#78716C', 'open', 'a0') RETURNING id`;
  const [tk] = await tx`
    INSERT INTO ticket (workspace_id, project_id, number, title, description, status_id, sort, created_by)
    VALUES (${ws!.id}, ${pr!.id}, 1, 'Banner für Kampagne', 'Herbstaktion vorbereiten', ${st!.id}, 'a0', ${u!.id})
    RETURNING id`;
  return { userId: u!.id as string, wsId: ws!.id as string, projectId: pr!.id as string, statusId: st!.id as string, ticketId: tk!.id as string };
}

describe("subtask limit", () => {
  it(`allows ${MAX_SUBTASKS} subtasks and rejects one more`, async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      for (let i = 0; i < MAX_SUBTASKS; i++) {
        await tx`INSERT INTO subtask (workspace_id, ticket_id, title, sort) VALUES (${s.wsId}, ${s.ticketId}, ${`Schritt ${i}`}, ${`a${i}`})`;
      }
      await expectDbError(
        tx,
        (sp) => sp`INSERT INTO subtask (workspace_id, ticket_id, title, sort) VALUES (${s.wsId}, ${s.ticketId}, 'zu viel', 'b0')`,
        /max_subtasks/,
      );
      // Updating an existing subtask on a full ticket still works.
      await tx`UPDATE subtask SET done = true, ticket_id = ticket_id WHERE ticket_id = ${s.ticketId}`;
    });
  });
});

describe("user limit", () => {
  it(`allows ${MAX_USERS_PER_WORKSPACE} active members and rejects one more`, async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      await tx`
        INSERT INTO "user" (id, name, email)
        SELECT 'bulk' || g, 'U' || g, 'bulk' || g || '@firma-limit.de' FROM generate_series(1, ${MAX_USERS_PER_WORKSPACE + 1}) g`;
      await tx`
        INSERT INTO membership (workspace_id, user_id)
        SELECT ${s.wsId}, 'bulk' || g FROM generate_series(1, ${MAX_USERS_PER_WORKSPACE}) g`;
      const extra = `bulk${MAX_USERS_PER_WORKSPACE + 1}`;
      await expectDbError(tx, (sp) => sp`INSERT INTO membership (workspace_id, user_id) VALUES (${s.wsId}, ${extra})`, /max_users/);
      // Invitations do not count; activating them does.
      await tx`INSERT INTO membership (workspace_id, user_id, status) VALUES (${s.wsId}, ${extra}, 'invited')`;
      await expectDbError(tx, (sp) => sp`UPDATE membership SET status = 'active' WHERE user_id = ${extra}`, /max_users/);
    });
  });
});

describe("workspace isolation", () => {
  it("rejects a ticket whose project belongs to another workspace", async () => {
    await inRollback(async (tx) => {
      const a = await seed(tx);
      const b = await seed(tx);
      await expectDbError(
        tx,
        (sp) => sp`
          INSERT INTO ticket (workspace_id, project_id, number, title, status_id, sort, created_by)
          VALUES (${b.wsId}, ${a.projectId}, 2, 'fremd', ${a.statusId}, 'a1', ${b.userId})`,
        /foreign key/,
      );
    });
  });

  it("rejects a subtask pointing to a ticket in another workspace", async () => {
    await inRollback(async (tx) => {
      const a = await seed(tx);
      const b = await seed(tx);
      await expectDbError(
        tx,
        (sp) => sp`INSERT INTO subtask (workspace_id, ticket_id, title, sort) VALUES (${b.wsId}, ${a.ticketId}, 'fremd', 'a0')`,
        /foreign key/,
      );
    });
  });

  it("rejects a status from another project", async () => {
    await inRollback(async (tx) => {
      const a = await seed(tx);
      const b = await seed(tx);
      await expectDbError(tx, (sp) => sp`UPDATE ticket SET status_id = ${b.statusId} WHERE id = ${a.ticketId}`, /foreign key/);
    });
  });

  it("rejects a label from another project", async () => {
    await inRollback(async (tx) => {
      const a = await seed(tx);
      const b = await seed(tx);
      const [lb] = await tx`
        INSERT INTO label (workspace_id, project_id, name, color) VALUES (${b.wsId}, ${b.projectId}, 'Bug', '#EF4444') RETURNING id`;
      await expectDbError(
        tx,
        (sp) => sp`INSERT INTO ticket_label (ticket_id, label_id, project_id) VALUES (${a.ticketId}, ${lb!.id}, ${a.projectId})`,
        /foreign key/,
      );
    });
  });
});

describe("field limits", () => {
  it(`rejects titles longer than ${MAX_TITLE} characters`, async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      await expectDbError(tx, (sp) => sp`UPDATE ticket SET title = ${"x".repeat(MAX_TITLE + 1)} WHERE id = ${s.ticketId}`, /too long/);
      await tx`UPDATE ticket SET title = ${"ü".repeat(MAX_TITLE)} WHERE id = ${s.ticketId}`;
    });
  });

  it("rejects oversized attachments and disallowed types", async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      const insert = (sp: Tx, key: string, mime: string, bytes: number, dataBytes = bytes) => sp`
        INSERT INTO attachment (workspace_id, ticket_id, key, file_name, data, mime, bytes, width, height, uploaded_by)
        VALUES (${s.wsId}, ${s.ticketId}, ${key}, 'bild.webp', decode(repeat('ab', ${dataBytes}::int), 'hex'), ${mime}, ${bytes}, 10, 10, ${s.userId})`;
      await insert(tx, "ok", "image/webp", MAX_ATTACHMENT_BYTES);
      await expectDbError(tx, (sp) => insert(sp, "big", "image/png", MAX_ATTACHMENT_BYTES + 1), /attachment_bytes_limit/);
      await expectDbError(tx, (sp) => insert(sp, "gif", "image/gif", 1000), /attachment_mime_allowed/);
      await expectDbError(tx, (sp) => insert(sp, "lie", "image/png", 10, 5000), /attachment_data_matches_bytes/);
    });
  });

  it("rejects invalid priorities and project keys", async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      await expectDbError(tx, (sp) => sp`UPDATE ticket SET priority = 5 WHERE id = ${s.ticketId}`, /ticket_priority_range/);
      await expectDbError(tx, (sp) => sp`UPDATE project SET key = 'mkt' WHERE id = ${s.projectId}`, /project_key_format/);
    });
  });
});

describe("attachment limit", () => {
  it(`allows ${MAX_ATTACHMENTS_PER_TICKET} attachments per ticket and rejects one more`, async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      await tx`
        INSERT INTO attachment (workspace_id, ticket_id, key, file_name, data, mime, bytes, width, height, uploaded_by)
        SELECT ${s.wsId}, ${s.ticketId}, 'k' || g, 'a.png', '\\x00'::bytea, 'image/png', 1, 1, 1, ${s.userId}
        FROM generate_series(1, ${MAX_ATTACHMENTS_PER_TICKET}) g`;
      await expectDbError(
        tx,
        (sp) => sp`
          INSERT INTO attachment (workspace_id, ticket_id, key, file_name, data, mime, bytes, width, height, uploaded_by)
          VALUES (${s.wsId}, ${s.ticketId}, 'zu-viel', 'a.png', '\\x00'::bytea, 'image/png', 1, 1, 1, ${s.userId})`,
        /max_attachments/,
      );
    });
  });
});

describe("full-text search", () => {
  it("finds tickets by stemmed German words", async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      const rows = await tx`
        SELECT id FROM ticket
        WHERE workspace_id = ${s.wsId} AND search @@ websearch_to_tsquery('german', 'Kampagnen')`;
      expect(rows.map((r) => r.id)).toEqual([s.ticketId]);
    });
  });
});

describe("sort keys", () => {
  it("order byte-wise (COLLATE \"C\") like fractional indexing expects", async () => {
    await inRollback(async (tx) => {
      const s = await seed(tx);
      for (const [i, key] of ["a0V", "Zz", "a0", "b"].entries()) {
        await tx`INSERT INTO subtask (workspace_id, ticket_id, title, sort) VALUES (${s.wsId}, ${s.ticketId}, ${`s${i}`}, ${key})`;
      }
      const rows = await tx`SELECT sort FROM subtask WHERE ticket_id = ${s.ticketId} ORDER BY sort`;
      expect(rows.map((r) => r.sort)).toEqual(["Zz", "a0", "a0V", "b"]);
    });
  });
});
