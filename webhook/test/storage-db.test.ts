import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { DatabaseSync as DatabaseHandle } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, STORAGE_BUSY_TIMEOUT_MS, STORAGE_SCHEMA_VERSION } from "../src/storage-db.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
const folders: string[] = [];
const handles: DatabaseHandle[] = [];

function databasePath(): string {
  mkdirSync(cache, { recursive: true });
  const folder = mkdtempSync(join(cache, "storage-db-"));
  folders.push(folder);
  return join(folder, "service.sqlite");
}

function open(path: string): DatabaseHandle {
  const db = openDatabase(path);
  handles.push(db);
  return db;
}

function raw(path: string): DatabaseHandle {
  const db = new DatabaseSync(path);
  handles.push(db);
  return db;
}

function seedSubscription(db: DatabaseHandle): void {
  db.prepare(`INSERT INTO subscriptions(id, revision, spec_json, created_at, updated_at)
    VALUES ('sub-one', 1, '{}', -1000, 0)`).run();
}

function seedEvent(db: DatabaseHandle): void {
  const payload = '{ "receipt": {}, "event": "synthetic" }';
  db.prepare(`INSERT INTO events(id, subscription_id, subscription_revision, occurrence_key,
    idempotency_key, occurred_at, payload, payload_sha256, created_at)
    VALUES ('event-one', 'sub-one', 1, 'occurrence-one', 'idempotency-one', -500, ?, ?, 0)`)
    .run(payload, createHash("sha256").update(payload).digest("hex"));
}

function seedDelivery(db: DatabaseHandle): void {
  db.exec(`INSERT INTO deliveries(event_id, callback_url, secret_ref, status, available_at, attempt_count, updated_at)
    VALUES ('event-one', 'https://receiver.example/events', 'RuntimeKey', 'pending', 0, 0, 0);`);
}

function seedAttempt(db: DatabaseHandle): void {
  db.exec(`INSERT INTO attempts(event_id, number, started_at, finished_at, result_json)
    VALUES ('event-one', 1, 0, 1, '{"kind":"timeout"}');`);
}

function snapshot(db: DatabaseHandle): unknown {
  return {
    version: db.prepare("PRAGMA user_version").get(),
    schema: db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all(),
    ledger: db.prepare("SELECT * FROM schema_migrations ORDER BY version").all(),
  };
}

afterEach(() => {
  for (const db of handles.splice(0)) {
    try { db.close(); } catch { /* The test may already have closed it. */ }
  }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("SQLite migrations", () => {
  it("persists a single migration and data unchanged across reopenings", () => {
    const path = databasePath();
    const first = open(path);
    seedSubscription(first);
    seedEvent(first);
    seedDelivery(first);
    seedAttempt(first);
    first.exec(`INSERT INTO dead_letters(event_id, attempt_number, reason, created_at)
      VALUES ('event-one', 1, 'attempts-exhausted', 1);`);
    const before = snapshot(first);
    const event = first.prepare("SELECT * FROM events").get();
    first.close();

    const second = open(path);
    expect(snapshot(second)).toEqual(before);
    expect(second.prepare("SELECT * FROM events").get()).toEqual(event);
    expect(second.prepare("SELECT * FROM dead_letters").all()).toHaveLength(1);
    expect(second.prepare("PRAGMA user_version").get()?.user_version).toBe(STORAGE_SCHEMA_VERSION);
    const ledger = second.prepare("SELECT * FROM schema_migrations").all();
    expect(ledger).toHaveLength(STORAGE_SCHEMA_VERSION);
    expect(ledger[0]?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(second.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
    expect(second.prepare("PRAGMA recursive_triggers").get()?.recursive_triggers).toBe(1);
    expect(second.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("wal");
    expect(second.prepare("PRAGMA synchronous").get()?.synchronous).toBe(2);
    expect(second.prepare("PRAGMA busy_timeout").get()?.timeout).toBe(STORAGE_BUSY_TIMEOUT_MS);
  });

  it.each([
    "PRAGMA user_version = 2",
    "UPDATE schema_migrations SET checksum = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'",
    "DELETE FROM schema_migrations",
    "INSERT INTO schema_migrations VALUES (2, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 0)",
    "DROP TRIGGER events_no_update",
    "ALTER TABLE subscriptions ADD COLUMN unexpected TEXT",
  ])("rejects changed schema metadata without modifying it: %s", sql => {
    const path = databasePath();
    const db = open(path);
    db.exec(sql);
    const before = snapshot(db);
    db.close();
    expect(() => openDatabase(path)).toThrow("Unable to open webhook database.");
    expect(snapshot(raw(path))).toEqual(before);
  });

  it("refuses an unrelated database without installing a partial schema", () => {
    const path = databasePath();
    const db = raw(path);
    db.exec("CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES ('synthetic');");
    expect(db.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("delete");
    db.close();
    expect(() => openDatabase(path)).toThrow("Unable to open webhook database.");
    const after = raw(path);
    expect(after.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("delete");
    expect(after.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all())
      .toEqual([{ name: "unrelated" }]);
    expect(after.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
    expect(after.prepare("SELECT * FROM unrelated").get()?.value).toBe("synthetic");
  });

  it("refuses persisted foreign-key violations", () => {
    const path = databasePath();
    const db = open(path);
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("INSERT INTO scan_cursors VALUES ('missing-subscription', 1, 0)");
    db.close();
    expect(() => openDatabase(path)).toThrow("Unable to open webhook database.");
    expect(raw(path).prepare("SELECT * FROM scan_cursors").all()).toHaveLength(1);
  });

  it("does not expose filesystem paths or database contents in open errors", () => {
    const path = databasePath();
    writeFileSync(path, "untrusted-database-content");
    for (const candidate of [path, join(path, "private-path-marker"), "", "bad\0path"]) {
      try {
        openDatabase(candidate);
        expect.fail("Expected database open to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Unable to open webhook database.");
        expect((error as Error).cause).toBeUndefined();
      }
    }
  });

  it("serializes first-open migrations from independent processes", async () => {
    const path = databasePath();
    const module = new URL("../src/storage-db.ts", import.meta.url).href;
    const code = `import { openDatabase } from ${JSON.stringify(module)};
      const db = openDatabase(process.argv[1]);
      db.close();`;
    const childOpen = () => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code, path],
        { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", chunk => { stderr += String(chunk); });
      child.on("error", reject);
      child.on("exit", code => { if (code === 0) resolve(); else reject(new Error(stderr)); });
    });
    await Promise.all([childOpen(), childOpen(), childOpen(), childOpen()]);
    expect(open(path).prepare("SELECT * FROM schema_migrations").all()).toHaveLength(STORAGE_SCHEMA_VERSION);
  });
});

describe("SQLite integrity boundaries", () => {
  it("keeps exact event bytes and completed attempts immutable, including replace statements", () => {
    const db = open(databasePath());
    seedSubscription(db);
    seedEvent(db);
    seedDelivery(db);
    seedAttempt(db);
    const event = db.prepare("SELECT * FROM events").get();
    const attempt = db.prepare("SELECT * FROM attempts").get();
    for (const sql of [
      "UPDATE events SET payload = '{}'",
      "DELETE FROM events",
      "INSERT OR REPLACE INTO events SELECT * FROM events",
      "UPDATE attempts SET result_json = '{}'",
      "DELETE FROM attempts",
      "INSERT OR REPLACE INTO attempts SELECT * FROM attempts",
    ]) expect(() => db.exec(sql)).toThrow(/immutable/);
    expect(db.prepare("SELECT * FROM events").get()).toEqual(event);
    expect(db.prepare("SELECT * FROM attempts").get()).toEqual(attempt);
  });

  it("enforces foreign keys, JSON objects, integer fields and positive revisions", () => {
    const db = open(databasePath());
    seedSubscription(db);
    seedEvent(db);
    seedDelivery(db);
    seedAttempt(db);
    for (const sql of [
      "INSERT INTO scan_cursors VALUES ('missing', 1, 0)",
      "INSERT INTO scan_cursors VALUES ('sub-one', 0, 0)",
      "INSERT INTO scan_cursors VALUES ('sub-one', 1, 0.5)",
      "UPDATE subscriptions SET spec_json = '[]'",
      "UPDATE subscriptions SET spec_json = '{'",
      "UPDATE subscriptions SET revision = 0",
      "UPDATE subscriptions SET updated_at = -2000",
      "UPDATE subscriptions SET deleted_at = -2000",
      "DELETE FROM subscriptions",
      "UPDATE deliveries SET status = 'unknown'",
      "UPDATE deliveries SET attempt_count = -1",
      "DELETE FROM deliveries",
      "INSERT INTO attempts VALUES ('missing', 1, 0, 1, '{}')",
      "INSERT INTO attempts VALUES ('event-one', 0, 0, 1, '{}')",
      "INSERT INTO attempts VALUES ('event-one', 2, 1, 0, '{}')",
      "INSERT INTO attempts VALUES ('event-one', 2, 0, 1, '[]')",
      "INSERT INTO dead_letters VALUES ('event-one', 2, 'operator', 1)",
      "INSERT INTO dead_letters VALUES ('event-one', 1, 'unknown', 1)",
    ]) expect(() => db.exec(sql), sql).toThrow();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("enforces occurrence, idempotency and attempt uniqueness", () => {
    const db = open(databasePath());
    seedSubscription(db);
    seedEvent(db);
    seedDelivery(db);
    seedAttempt(db);
    for (const [id, occurrence, idempotency] of [
      ["different", "occurrence-one", "different"],
      ["different", "different", "idempotency-one"],
    ]) {
      expect(() => db.prepare(`INSERT INTO events
        SELECT ?, subscription_id, subscription_revision, ?, ?, occurred_at, payload, payload_sha256, created_at
        FROM events WHERE id = 'event-one'`).run(id!, occurrence!, idempotency!)).toThrow(/UNIQUE/);
    }
    expect(() => seedAttempt(db)).toThrow(/UNIQUE/);
    expect(db.prepare("SELECT * FROM events").all()).toHaveLength(1);
    expect(db.prepare("SELECT * FROM attempts").all()).toHaveLength(1);
  });
});
