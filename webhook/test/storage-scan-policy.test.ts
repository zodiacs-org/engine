import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_SCHEMA_VERSION } from "../src/storage-db.js";
import { StorageError, WebhookStore } from "../src/storage.js";
import type { NewEvent, ScanCommit } from "../src/storage-types.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const CACHE = fileURLToPath(new URL("../.cache/", import.meta.url));
const START = Date.parse("2000-01-01T00:00:00Z");
const MID = START + 1_000;
const END = START + 2_000;
const NOW = END + 1;
const POLICY = "scan-policy:synthetic-v1";
// This independently pins the deployed v1 migration bytes. Fixture construction
// reads that immutable migration rather than maintaining a second SQL schema.
const V1_CHECKSUM = "9e3e7f4db4f44c7afcdd200118122d7edb610d537b50b396d5dba4ab091fd4b9";

function spec() {
  return {
    callbackUrl: "https://receiver.example/events",
    secretRef: "runtime_key_reference",
    filter: { kind: "eclipse", type: "solar" },
    window: { start: new Date(START).toISOString(), end: new Date(END).toISOString() },
  };
}

function event(): NewEvent {
  return {
    id: "event-one", occurrenceKey: "occurrence-one", idempotencyKey: "idempotency-one",
    occurredAt: START + 100, payload: '{ "synthetic": true }',
  };
}

function scan(overrides: Partial<ScanCommit> = {}): ScanCommit {
  return {
    subscriptionId: "sub-one", expectedRevision: 1, policyKey: POLICY,
    from: START, to: MID, now: NOW, events: [], ...overrides,
  };
}

function expectFailure(operation: () => unknown, code: StorageError["code"] = "conflict"): void {
  expect(operation).toThrowError(new StorageError(code));
}

let directory: string;
let path: string;
let connections: WebhookStore[];

function open(): WebhookStore {
  const store = new WebhookStore(path);
  connections.push(store);
  return store;
}

function create(): WebhookStore {
  const store = open();
  store.createSubscription("sub-one", spec(), START - 1);
  return store;
}

function state(store: WebhookStore) {
  return {
    cursor: store.getCursor("sub-one"), policy: store.getScanPolicy("sub-one"),
    events: store.listEvents("sub-one"), deliveries: store.listDeliveries(),
  };
}

function legacyDatabase(progressed: boolean): void {
  const source = readFileSync(new URL("../src/storage-db.ts", import.meta.url), "utf8");
  const ledger = /const ledgerSql = `([^`]+)`;/u.exec(source)?.[1];
  const migration = /version: 1,\s+sql: `([^`]+)`/u.exec(source)?.[1];
  expect(ledger).toBeDefined();
  expect(migration).toBeDefined();
  expect(createHash("sha256").update(migration!).digest("hex")).toBe(V1_CHECKSUM);
  const db = new DatabaseSync(path);
  try {
    db.exec(ledger!);
    db.exec(migration!);
    db.prepare("INSERT INTO schema_migrations VALUES (1, ?, ?)").run(V1_CHECKSUM, START - 1);
    db.prepare("INSERT INTO subscriptions VALUES ('sub-one', 1, ?, ?, ?, NULL)")
      .run(JSON.stringify(spec()), START - 1, START - 1);
    db.prepare("INSERT INTO scan_cursors VALUES ('sub-one', 1, ?)").run(progressed ? MID : START);
    db.exec("PRAGMA user_version = 1");
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'scan_policies'").get()).toBeUndefined();
  } finally {
    db.close();
  }
}

beforeEach(() => {
  mkdirSync(CACHE, { recursive: true });
  directory = mkdtempSync(join(CACHE, "storage-policy-"));
  path = join(directory, "webhook.sqlite");
  connections = [];
});

afterEach(() => {
  for (const store of connections) store.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("durable subscription scan policies", () => {
  it.each([false, true])("binds the first complete scan and preserves it on reopening (events: %s)", withEvent => {
    const store = create();
    expect(store.getScanPolicy("sub-one")).toBeUndefined();
    const result = store.commitScan(scan({ events: withEvent ? [event()] : [] }));
    expect(result.inserted).toBe(withEvent ? 1 : 0);
    expect(store.getScanPolicy("sub-one")).toBe(POLICY);
    const before = state(store);
    store.close();
    const reopened = open();
    expect(state(reopened)).toEqual(before);
    reopened.commitScan(scan({ from: MID, to: END }));
    expect(reopened.getCursor("sub-one")?.nextAt).toBe(END);
    expect(reopened.getScanPolicy("sub-one")).toBe(POLICY);
  });

  it("retains the pin through destination, filter, schedule and enabled edits and deletion", () => {
    const store = create();
    store.commitScan(scan({ events: [event()] }));
    const retained = store.getEvent("event-one");
    const replacement = {
      ...spec(), callbackUrl: "https://replacement.example/notify", secretRef: "replacement_reference",
      filter: { kind: "eclipse", type: "lunar" },
      window: { start: new Date(START).toISOString(), end: new Date(END + 1_000).toISOString() },
      enabled: false,
    };
    store.updateSubscription("sub-one", 1, replacement, NOW + 1);
    expect(store.getScanPolicy("sub-one")).toBe(POLICY);
    store.updateSubscription("sub-one", 2, { ...replacement, enabled: true }, NOW + 2);
    expect(store.getScanPolicy("sub-one")).toBe(POLICY);
    expectFailure(() => store.commitScan(scan({ expectedRevision: 3, now: NOW + 2, policyKey: "other" })));
    store.commitScan(scan({ expectedRevision: 3, now: NOW + 2, events: [event()] }));
    expect(store.getEvent("event-one")).toEqual(retained);
    store.deleteSubscription("sub-one", 3, NOW + 3);
    store.close();
    expect(open().getScanPolicy("sub-one")).toBe(POLICY);
  });

  it("allows enabling an edited draft to bind when no scan progress or events exist", () => {
    const store = create();
    store.updateSubscription("sub-one", 1, { ...spec(), enabled: false }, NOW);
    store.updateSubscription("sub-one", 2, spec(), NOW + 1);
    store.commitScan(scan({ expectedRevision: 3, now: NOW + 1 }));
    expect(store.getScanPolicy("sub-one")).toBe(POLICY);
  });

  it.each(["changed", "omitted"])("rejects a %s key after binding, including an empty scan", mode => {
    const store = create();
    store.commitScan(scan());
    const before = state(store);
    const { policyKey: _key, ...withoutKey } = scan({ from: MID, to: END });
    const next = mode === "changed" ? { ...withoutKey, policyKey: "another-policy" } : withoutKey;
    expectFailure(() => store.commitScan(next));
    expect(state(store)).toEqual(before);
    store.close();
    expectFailure(() => open().commitScan(next));
  });

  it("checks the persisted pin inside the commit transaction after another connection binds it", () => {
    const first = create();
    const second = open();
    expect(second.getScanPolicy("sub-one")).toBeUndefined();
    first.commitScan(scan());
    const before = state(first);
    expectFailure(() => second.commitScan(scan({ from: MID, to: END, policyKey: "racing-policy" })));
    expect(state(second)).toEqual(before);
    second.commitScan(scan({ from: MID, to: END }));
    expect(first.getCursor("sub-one")?.nextAt).toBe(END);
    expect(first.getScanPolicy("sub-one")).toBe(POLICY);
  });

  it.each(["BEFORE INSERT ON deliveries", "BEFORE UPDATE ON scan_cursors"])(
    "rolls back a new pin, events and deliveries after a later SQLite failure: %s", boundary => {
      const store = create();
      const before = state(store);
      const fault = new DatabaseSync(path);
      try {
        fault.exec(`CREATE TRIGGER test_policy_failure ${boundary}
          BEGIN SELECT RAISE(ABORT, 'synthetic-failure'); END`);
        expectFailure(() => store.commitScan(scan({ events: [event()] })));
        expect(state(store)).toEqual(before);
        fault.exec("DROP TRIGGER test_policy_failure");
      } finally {
        fault.close();
      }
      store.close();
      const reopened = open();
      expect(state(reopened)).toEqual(before);
      reopened.commitScan(scan({ policyKey: "retry-policy", events: [event()] }));
      expect(reopened.getScanPolicy("sub-one")).toBe("retry-policy");
    },
  );

  it("rolls back a new pin if a later event in the batch is invalid", () => {
    const store = create();
    const before = state(store);
    expectFailure(() => store.commitScan(scan({ events: [event(), { ...event(), occurredAt: END }] })), "invalid-input");
    expect(state(store)).toEqual(before);
  });

  it("retains compatibility for untracked scans but refuses to attach a policy after cursor progress", () => {
    const store = create();
    const { policyKey: _key, ...legacy } = scan();
    store.commitScan(legacy);
    expect(store.getScanPolicy("sub-one")).toBeUndefined();
    const before = state(store);
    expectFailure(() => store.commitScan(scan({ from: MID, to: END })));
    expect(state(store)).toEqual(before);
    store.commitScan({ ...legacy, from: MID, to: END });
    expect(store.getCursor("sub-one")?.nextAt).toBe(END);
  });

  it("refuses attaching a policy to retained legacy events even after an edit resets the cursor", () => {
    const store = create();
    const { policyKey: _key, ...legacy } = scan({ events: [event()] });
    store.commitScan(legacy);
    store.updateSubscription("sub-one", 1, spec(), NOW + 1);
    const before = state(store);
    expectFailure(() => store.commitScan(scan({ expectedRevision: 2, now: NOW + 1 })));
    expect(state(store)).toEqual(before);
  });

  it("allows a full rescan after an edit resets an empty legacy window", () => {
    const store = create();
    const { policyKey: _key, ...legacy } = scan();
    store.commitScan(legacy);
    store.updateSubscription("sub-one", 1, spec(), NOW + 1);
    store.commitScan(scan({ expectedRevision: 2, now: NOW + 1 }));
    expect(store.getScanPolicy("sub-one")).toBe(POLICY);
  });

  it("keeps the database pin immutable against direct updates, deletes and replacements", () => {
    const store = create();
    store.commitScan(scan());
    const db = new DatabaseSync(path);
    try {
      db.exec("PRAGMA recursive_triggers = ON");
      for (const sql of [
        "UPDATE scan_policies SET policy_key = 'changed'",
        "DELETE FROM scan_policies",
        "INSERT OR REPLACE INTO scan_policies VALUES ('sub-one', 'changed')",
      ]) expect(() => db.exec(sql)).toThrow(/immutable/u);
    } finally {
      db.close();
    }
    expect(store.getScanPolicy("sub-one")).toBe(POLICY);
  });

  it.each(["", "a".repeat(257), "invalid policy", "bad\0policy", null, 1])("rejects malformed policy keys %#", policyKey => {
    const store = create();
    const before = state(store);
    expectFailure(() => store.commitScan({ ...scan(), policyKey } as ScanCommit), "invalid-input");
    expect(state(store)).toEqual(before);
  });

  it("validates policy reads and respects closed handles", () => {
    const store = create();
    expect(store.getScanPolicy("missing")).toBeUndefined();
    expectFailure(() => store.getScanPolicy("invalid id"), "invalid-input");
    store.close();
    expectFailure(() => store.getScanPolicy("sub-one"), "closed");
  });
});

describe("scan policy migration from the deployed v1 schema", () => {
  it.each([false, true])("upgrades without guessing a policy for existing history (progressed: %s)", progressed => {
    legacyDatabase(progressed);
    const store = open();
    expect(store.getScanPolicy("sub-one")).toBeUndefined();
    expect(store.getCursor("sub-one")?.nextAt).toBe(progressed ? MID : START);
    const db = new DatabaseSync(path);
    try {
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(STORAGE_SCHEMA_VERSION);
      expect(db.prepare("SELECT checksum, applied_at FROM schema_migrations WHERE version = 1").get())
        .toEqual({ checksum: V1_CHECKSUM, applied_at: START - 1 });
    } finally {
      db.close();
    }
    if (progressed) {
      expectFailure(() => store.commitScan(scan({ from: MID, to: END })));
      expect(store.getScanPolicy("sub-one")).toBeUndefined();
      expect(store.getCursor("sub-one")?.nextAt).toBe(MID);
    } else {
      store.commitScan(scan());
      expect(store.getScanPolicy("sub-one")).toBe(POLICY);
    }
  });
});
