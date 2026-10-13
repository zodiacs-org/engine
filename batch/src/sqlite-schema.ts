import type { DatabaseSync } from "node:sqlite";
import { QueueError } from "./queue.js";

// ZBAT identifies this application's database, independently of schema version.
const APPLICATION_ID = 0x5A424154;
const MIGRATIONS = [
  `CREATE TABLE batch_jobs (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    spec_json TEXT NOT NULL CHECK (json_valid(spec_json)),
    kind TEXT NOT NULL CHECK (kind IN ('charts', 'transit-grid', 'synastry-matrix')),
    total_tasks INTEGER NOT NULL CHECK (total_tasks > 0),
    completed_tasks INTEGER NOT NULL DEFAULT 0 CHECK (completed_tasks BETWEEN 0 AND total_tasks),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed')),
    claim_count INTEGER NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
    finished_at INTEGER,
    lease_token TEXT,
    lease_owner TEXT,
    lease_expires_at INTEGER,
    CHECK (
      (status = 'running' AND lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (status != 'running' AND lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    ),
    CHECK (
      (status = 'completed' AND completed_tasks = total_tasks AND finished_at IS NOT NULL)
      OR (status != 'completed' AND completed_tasks < total_tasks AND finished_at IS NULL)
    )
  ) STRICT;
  CREATE INDEX batch_jobs_eligible ON batch_jobs(sequence) WHERE status != 'completed';
  CREATE TABLE batch_results (
    job_id TEXT NOT NULL REFERENCES batch_jobs(id),
    cursor INTEGER NOT NULL CHECK (cursor >= 0),
    row_json TEXT NOT NULL CHECK (json_valid(row_json)),
    PRIMARY KEY (job_id, cursor)
  ) STRICT, WITHOUT ROWID;`,
] as const;

/** Called only while holding the initialization write transaction. */
export function migrateQueue(db: DatabaseSync): void {
  const applicationId = db.prepare("PRAGMA application_id").get()!.application_id;
  const version = db.prepare("PRAGMA user_version").get()!.user_version;
  if (typeof version !== "number" || version < 0 || version > MIGRATIONS.length) {
    throw new QueueError("unsupported-schema");
  }
  if (applicationId === 0 && version === 0) {
    // Do not adopt a database belonging to another application, even if it did
    // not set an application id. Never overwrite an existing schema in place.
    const existing = db.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' LIMIT 1").get();
    if (existing) throw new QueueError("unsupported-schema");
  } else if (applicationId !== APPLICATION_ID || version === 0) {
    throw new QueueError("unsupported-schema");
  }
  for (let index = version; index < MIGRATIONS.length; index++) {
    db.exec(MIGRATIONS[index]!);
    db.exec(`PRAGMA user_version = ${index + 1}`);
  }
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
  // Fail on a mismatched or incomplete schema during open, before use. A
  // database controlled by another application is not a trusted queue store.
  db.prepare(`SELECT sequence, id, spec_json, kind, total_tasks, completed_tasks,
    status, claim_count, created_at, updated_at, finished_at, lease_token,
    lease_owner, lease_expires_at FROM batch_jobs LIMIT 0`).all();
  db.prepare("SELECT job_id, cursor, row_json FROM batch_results LIMIT 0").all();
}
