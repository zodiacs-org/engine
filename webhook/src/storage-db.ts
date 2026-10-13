import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseHandle } from "node:sqlite";

// The node: prefix is required; Vite 5 does not recognize this newer built-in
// during static import resolution, so use Node's resolver directly.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export const STORAGE_SCHEMA_VERSION = 1;
export const STORAGE_BUSY_TIMEOUT_MS = 5_000;

const ledgerSql = `CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  checksum TEXT NOT NULL CHECK (length(checksum) = 64),
  applied_at INTEGER NOT NULL
) STRICT;`;

// Migration text is immutable after deployment. Changes need a new migration.
const migrations = [{
  version: 1,
  sql: `
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  revision INTEGER NOT NULL CHECK (revision > 0),
  spec_json TEXT NOT NULL CHECK (json_valid(spec_json) AND json_type(spec_json) = 'object'),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  deleted_at INTEGER CHECK (deleted_at IS NULL OR deleted_at >= created_at)
) STRICT;
CREATE TABLE scan_cursors (
  subscription_id TEXT PRIMARY KEY NOT NULL REFERENCES subscriptions(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  next_at INTEGER NOT NULL
) STRICT;
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
  subscription_revision INTEGER NOT NULL CHECK (subscription_revision > 0),
  occurrence_key TEXT NOT NULL CHECK (length(occurrence_key) > 0),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) > 0),
  occurred_at INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload) AND json_type(payload) = 'object'),
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL,
  UNIQUE(subscription_id, occurrence_key)
) STRICT;
CREATE TABLE deliveries (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES events(id),
  callback_url TEXT NOT NULL CHECK (length(callback_url) > 0),
  secret_ref TEXT NOT NULL CHECK (length(secret_ref) > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'dead-letter')),
  available_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE attempts (
  event_id TEXT NOT NULL REFERENCES deliveries(event_id),
  number INTEGER NOT NULL CHECK (number > 0),
  started_at INTEGER NOT NULL,
  finished_at INTEGER NOT NULL CHECK (finished_at >= started_at),
  result_json TEXT NOT NULL CHECK (json_valid(result_json) AND json_type(result_json) = 'object'),
  PRIMARY KEY(event_id, number)
) STRICT;
CREATE TABLE dead_letters (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES deliveries(event_id),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  reason TEXT NOT NULL CHECK (reason IN ('attempts-exhausted', 'destination-rejected', 'operator')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(event_id, attempt_number) REFERENCES attempts(event_id, number)
) STRICT;
CREATE INDEX events_subscription_time ON events(subscription_id, occurred_at, id);
CREATE INDEX deliveries_due ON deliveries(status, available_at, event_id);
CREATE TRIGGER events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'Event records are immutable.'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'Event records are immutable.'); END;
CREATE TRIGGER attempts_no_update BEFORE UPDATE ON attempts
BEGIN SELECT RAISE(ABORT, 'Attempt records are immutable.'); END;
CREATE TRIGGER attempts_no_delete BEFORE DELETE ON attempts
BEGIN SELECT RAISE(ABORT, 'Attempt records are immutable.'); END;
`,
}] as const;

function checksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function schemaSnapshot(db: DatabaseHandle): string {
  return JSON.stringify(db.prepare(`
    SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name
  `).all());
}

// Comparing the schema as well as the ledger catches removed constraints and
// triggers. A ledger checksum alone says nothing about the current database.
function expectedSchemas(): Map<number, string> {
  const db = new DatabaseSync(":memory:");
  try {
    const schemas = new Map<number, string>([[0, schemaSnapshot(db)]]);
    db.exec(ledgerSql);
    for (const migration of migrations) {
      db.exec(migration.sql);
      schemas.set(migration.version, schemaSnapshot(db));
    }
    return schemas;
  } finally {
    db.close();
  }
}

function migrate(db: DatabaseHandle): void {
  const schemas = expectedSchemas();
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    if (typeof version !== "number" || !schemas.has(version)
      || schemaSnapshot(db) !== schemas.get(version)) {
      throw new Error("Unsupported webhook database schema.");
    }
    if (version === 0) db.exec(ledgerSql);
    const ledger = db.prepare("SELECT version, checksum FROM schema_migrations ORDER BY version").all();
    if (ledger.length !== version) throw new Error("Invalid webhook migration ledger.");
    for (let index = 0; index < ledger.length; index++) {
      const row = ledger[index];
      const migration = migrations[index];
      if (!migration || row?.version !== migration.version || row.checksum !== checksum(migration.sql)) {
        throw new Error("Invalid webhook migration ledger.");
      }
    }
    for (const migration of migrations) {
      if (migration.version <= version) continue;
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, checksum(migration.sql), Date.now());
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }
    if (schemaSnapshot(db) !== schemas.get(STORAGE_SCHEMA_VERSION)
      || db.prepare("PRAGMA foreign_key_check").all().length !== 0) {
      throw new Error("Invalid webhook database schema.");
    }
    db.exec("COMMIT");
  } catch {
    db.exec("ROLLBACK");
    throw new Error("Unable to initialize webhook database.");
  }
}

/** Opens and validates a local database; the caller owns and closes the handle. */
export function openDatabase(path: string): DatabaseHandle {
  let db: DatabaseHandle | undefined;
  try {
    if (typeof path !== "string" || path.length === 0 || path.includes("\0")) {
      throw new Error("Invalid webhook database path.");
    }
    db = new DatabaseSync(path, { enableForeignKeyConstraints: true, allowExtension: false });
    db.exec(`PRAGMA busy_timeout = ${STORAGE_BUSY_TIMEOUT_MS}`);
    db.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;");
    db.exec("PRAGMA synchronous = FULL;");
    migrate(db);
    // journal_mode persists in the file. Set it only after accepting the schema.
    // If this fails, the completed migration remains valid for a later opening.
    db.exec("PRAGMA journal_mode = WAL;");
    return db;
  } catch {
    try { db?.close(); } catch { /* Preserve the static public diagnostic. */ }
    throw new Error("Unable to open webhook database.");
  }
}
