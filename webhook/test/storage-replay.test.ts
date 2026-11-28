import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, STORAGE_SCHEMA_VERSION } from "../src/storage-db.js";
import { StorageError, WebhookStore } from "../src/storage.js";
import type { AttemptResult, ReplayRequest } from "../src/storage-types.js";
import { claimed, deliveryFixture, EVENT, NOW, POLICY } from "./delivery-fixture.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
let fixture: ReturnType<typeof deliveryFixture>;
beforeEach(() => { fixture = deliveryFixture(); fixture.enqueue(); });
afterEach(() => fixture.cleanup());
function sql(statement: string) {
  const db = new DatabaseSync(fixture.path, { enableForeignKeyConstraints: true });
  try { db.exec("PRAGMA recursive_triggers = ON"); db.exec(statement); } finally { db.close(); }
}
function fail(operation: () => unknown, code: StorageError["code"] = "conflict") {
  expect(operation).toThrowError(new StorageError(code));
}
function deadLetter(policy = POLICY, outcome: AttemptResult = { kind: "timeout" }) {
  for (;;) {
    const delivery = fixture.store.getDelivery(EVENT.id)!;
    if (delivery.status === "dead-letter") return fixture.store.getDeadLetter(EVENT.id)!;
    const { lease } = claimed(fixture.store.claimDelivery(delivery.availableAt, policy));
    fixture.store.finishDelivery(EVENT.id, lease.token, outcome, lease.startedAt + 1);
  }
}
function request(requestId = "replay-one"): ReplayRequest {
  const letter = fixture.store.getDeadLetter(EVENT.id)!;
  return { requestId, eventId: EVENT.id, expectedAttemptNumber: letter.attemptNumber, now: letter.createdAt + 1 };
}

describe("durable dead-letter replay", () => {
  it("previews without mutations and atomically preserves event bytes, destination and lifetime history on replay", () => {
    const letter = deadLetter();
    const input = request();
    const saved = fixture.store.getEvent(EVENT.id);
    const before = fixture.store.getDelivery(EVENT.id)!;
    const attempts = fixture.store.listAttempts(EVENT.id);
    const cursor = fixture.store.getCursor("synthetic-subscription");
    const preview = fixture.store.previewReplay(input);
    expect(preview).toEqual({ repeated: false, replay: { requestId: input.requestId, eventId: EVENT.id,
      attemptNumber: POLICY.maxAttempts, reason: "attempts-exhausted", deadLetterCreatedAt: letter.createdAt, requeuedAt: input.now } });
    expect(fixture.store.getDelivery(EVENT.id)).toEqual(before);
    expect(fixture.store.getDeadLetter(EVENT.id)).toEqual(letter);
    expect(fixture.store.listReplays(EVENT.id)).toEqual([]);
    expect(fixture.store.replayDeadLetter(input)).toEqual(preview);
    expect(fixture.store.getDelivery(EVENT.id)).toEqual({ ...before, status: "pending", availableAt: input.now, updatedAt: input.now });
    expect(fixture.store.getDeadLetter(EVENT.id)).toBeUndefined();
    expect(fixture.store.getEvent(EVENT.id)).toEqual(saved);
    expect(fixture.store.listAttempts(EVENT.id)).toEqual(attempts);
    expect(fixture.store.getCursor("synthetic-subscription")).toEqual(cursor);
    fixture.store.close();
    const reopened = fixture.open();
    expect(reopened.listReplays(EVENT.id)).toEqual([preview.replay]);
    expect(reopened.getEvent(EVENT.id)).toEqual(saved);
    expect(reopened.replayDeadLetter({ ...input, now: input.now + 1000 })).toEqual({ ...preview, repeated: true });
    expect(reopened.getDelivery(EVENT.id)?.availableAt).toBe(input.now);
  });

  it("grants a fresh bounded cycle under the immutable policy and starts the backoff again", () => {
    deadLetter({ ...POLICY, maxAttempts: 2 });
    const input = request();
    fixture.store.replayDeadLetter(input);
    const changed = { ...POLICY, maxAttempts: 100, baseDelayMs: 1, maxDelayMs: 1, leaseMs: 10 };
    const first = claimed(fixture.store.claimDelivery(input.now, changed));
    expect(first.lease.number).toBe(3);
    expect(first.lease.expiresAt - first.lease.startedAt).toBe(POLICY.leaseMs);
    const retry = fixture.store.finishDelivery(EVENT.id, first.lease.token, { kind: "timeout" }, input.now + 1);
    expect(retry).toMatchObject({ status: "pending", attemptCount: 3, availableAt: input.now + 1001 });
    const second = claimed(fixture.store.claimDelivery(retry.availableAt, changed));
    expect(second.lease.number).toBe(4);
    expect(fixture.store.finishDelivery(EVENT.id, second.lease.token, { kind: "timeout" }, retry.availableAt + 1).status).toBe("dead-letter");
    expect(fixture.store.getDeadLetter(EVENT.id)?.attemptNumber).toBe(4);
    expect(fixture.store.listAttempts(EVENT.id).map(value => value.number)).toEqual([1, 2, 3, 4]);
    expect(fixture.store.claimDelivery(retry.availableAt + 100_000, changed)).toEqual({ status: "idle" });
    // Repeating an old operation acknowledges that operation and cannot replay the new failed cycle.
    expect(fixture.store.replayDeadLetter({ ...input, now: retry.availableAt + 100_000 }).repeated).toBe(true);
    expect(fixture.store.getDelivery(EVENT.id)?.status).toBe("dead-letter");
    fail(() => fixture.store.replayDeadLetter({ ...input, requestId: "new-but-stale", now: retry.availableAt + 100_000 }));
    const next = request("replay-two");
    fixture.store.replayDeadLetter(next);
    const last = claimed(fixture.store.claimDelivery(next.now, changed));
    expect(last.lease.number).toBe(5);
    expect(fixture.store.finishDelivery(EVENT.id, last.lease.token, { kind: "http", status: 204 }, next.now).status).toBe("delivered");
    expect(fixture.store.listReplays(EVENT.id).map(value => value.attemptNumber)).toEqual([2, 4]);
    expect(fixture.store.replayDeadLetter({ ...input, now: next.now + 1 }).repeated).toBe(true);
    expect(fixture.store.getDelivery(EVENT.id)?.status).toBe("delivered");
    expect(fixture.store.listReplays(EVENT.id)).toHaveLength(2);
  });

  it("counts crashes during replay toward its cycle budget and fences the expired lease", () => {
    const policy = { ...POLICY, maxAttempts: 1 };
    deadLetter(policy);
    const input = request();
    fixture.store.replayDeadLetter(input);
    const first = claimed(fixture.store.claimDelivery(input.now, POLICY));
    expect(first.lease.number).toBe(2);
    fixture.store.close();
    const reopened = fixture.open();
    expect(reopened.claimDelivery(first.lease.expiresAt, POLICY)).toMatchObject({ status: "recovered", delivery: { status: "dead-letter", attemptCount: 2 } });
    expect(reopened.listAttempts(EVENT.id)[1]?.result).toEqual({ kind: "interrupted" });
    expect(reopened.getDeadLetter(EVENT.id)?.attemptNumber).toBe(2);
    fail(() => reopened.finishDelivery(EVENT.id, first.lease.token, { kind: "http", status: 204 }, first.lease.expiresAt));
  });

  it("recovers the first replay crash with the first-cycle delay rather than the lifetime exponent", () => {
    deadLetter();
    const input = request(); fixture.store.replayDeadLetter(input);
    const first = claimed(fixture.store.claimDelivery(input.now, POLICY));
    expect(fixture.store.claimDelivery(first.lease.expiresAt, POLICY)).toMatchObject({ status: "recovered",
      delivery: { status: "pending", availableAt: first.lease.expiresAt + POLICY.baseDelayMs } });
  });

  it("replays legacy unmanaged dead letters without treating their old attempts as the new budget", () => {
    fixture.store.recordAttempt({ eventId: EVENT.id, number: 1, startedAt: NOW + 100,
      finishedAt: NOW + 101, result: { kind: "timeout" } }, { status: "dead-letter", reason: "operator" });
    const input = request(); fixture.store.replayDeadLetter(input);
    const claim = claimed(fixture.store.claimDelivery(input.now, { ...POLICY, maxAttempts: 1 }));
    expect(claim.lease.number).toBe(2);
    expect(fixture.store.finishDelivery(EVENT.id, claim.lease.token, { kind: "http", status: 200 }, input.now).status).toBe("delivered");
  });

  it.each(["destination-rejected", "signing-error"] as const)("preserves %s reason and applies its normal terminal rule again", kind => {
    const letter = deadLetter(POLICY, { kind });
    const input = request(); fixture.store.replayDeadLetter(input);
    expect(fixture.store.listReplays(EVENT.id)[0]?.reason).toBe(letter.reason);
    const claim = claimed(fixture.store.claimDelivery(input.now, POLICY));
    expect(fixture.store.finishDelivery(EVENT.id, claim.lease.token, { kind }, input.now).status).toBe("dead-letter");
    expect(fixture.store.getDeadLetter(EVENT.id)?.attemptNumber).toBe(2);
  });

  it("preserves retained destination and signing reference even after subscription deletion", () => {
    deadLetter(); const input = request();
    fixture.store.updateSubscription("synthetic-subscription", 1,
      { ...fixture.spec, enabled: false, callbackUrl: "https://new.example/", secretRef: "new_key" }, input.now);
    fixture.store.deleteSubscription("synthetic-subscription", 2, input.now);
    fixture.store.replayDeadLetter(input);
    const claim = claimed(fixture.store.claimDelivery(input.now, POLICY));
    expect(claim.delivery.callbackUrl).toBe(fixture.spec.callbackUrl);
    expect(claim.delivery.secretRef).toBe(fixture.spec.secretRef);
    expect(claim.event.subscriptionRevision).toBe(1);
  });

  it("deduplicates competing connections and refuses another request for the same failed cycle", () => {
    deadLetter(); const input = request(); const second = fixture.open();
    expect(fixture.store.replayDeadLetter(input).repeated).toBe(false);
    expect(second.replayDeadLetter(input).repeated).toBe(true);
    fail(() => second.replayDeadLetter({ ...input, requestId: "competing-request" }));
    fail(() => second.replayDeadLetter({ ...input, eventId: "other-event" }));
    fail(() => second.replayDeadLetter({ ...input, expectedAttemptNumber: 1 }));
    expect(second.listReplays(EVENT.id)).toHaveLength(1);
    expect(second.getDelivery(EVENT.id)?.attemptCount).toBe(POLICY.maxAttempts);
  });

  it("refuses missing, pending, leased or delivered records, stale attempts and backwards clocks", () => {
    const input = { requestId: "replay-one", eventId: EVENT.id, expectedAttemptNumber: 1, now: NOW + 100 };
    fail(() => fixture.store.replayDeadLetter({ ...input, eventId: "missing" }), "not-found");
    fail(() => fixture.store.replayDeadLetter(input));
    const first = claimed(fixture.store.claimDelivery(NOW + 100, POLICY));
    fail(() => fixture.store.replayDeadLetter(input));
    fixture.store.finishDelivery(EVENT.id, first.lease.token, { kind: "http", status: 200 }, NOW + 100);
    fail(() => fixture.store.replayDeadLetter(input));
    expect(fixture.store.listReplays(EVENT.id)).toEqual([]);
  });

  it("validates replay identifiers, attempts and times before any write", () => {
    deadLetter(); const input = request();
    for (const requestId of ["", "bad id", "x".repeat(257), "secret\nmarker", null]) {
      fail(() => fixture.store.replayDeadLetter({ ...input, requestId } as never), "invalid-input");
    }
    for (const value of [0, -1, 0.5, NaN, Infinity, "1", undefined]) {
      fail(() => fixture.store.replayDeadLetter({ ...input, expectedAttemptNumber: value } as never), "invalid-input");
    }
    for (const value of [input.now - 2, 0.5, NaN, Infinity, 8640000000000001, undefined]) {
      fail(() => fixture.store.replayDeadLetter({ ...input, now: value } as never), "invalid-input");
    }
    fail(() => fixture.store.replayDeadLetter({ ...input, expectedAttemptNumber: 1 }));
    expect(fixture.store.listReplays(EVENT.id)).toEqual([]);
    expect(fixture.store.getDelivery(EVENT.id)?.status).toBe("dead-letter");
  });

  it.each(["audit", "delete", "update"])("rolls back replay if its %s write fails", stage => {
    deadLetter(); const input = request();
    const before = fixture.store.getDelivery(EVENT.id);
    const letter = fixture.store.getDeadLetter(EVENT.id);
    const trigger = stage === "audit" ? "BEFORE INSERT ON replay_requests"
      : stage === "delete" ? "BEFORE DELETE ON dead_letters" : "BEFORE UPDATE ON deliveries";
    sql(`CREATE TRIGGER injected_failure ${trigger} BEGIN SELECT RAISE(ABORT, 'private-marker'); END;`);
    fail(() => fixture.store.replayDeadLetter(input));
    expect(fixture.store.getDelivery(EVENT.id)).toEqual(before);
    expect(fixture.store.getDeadLetter(EVENT.id)).toEqual(letter);
    expect(fixture.store.listReplays(EVENT.id)).toEqual([]);
    sql("DROP TRIGGER injected_failure");
    expect(fixture.store.replayDeadLetter(input).repeated).toBe(false);
  });

  it("protects replay audit from updates, deletes and replacements and paginates history", () => {
    deadLetter({ ...POLICY, maxAttempts: 1 }); fixture.store.replayDeadLetter(request("b-request"));
    deadLetter(); fixture.store.replayDeadLetter(request("a-request"));
    const history = fixture.store.listReplays(EVENT.id);
    expect(history.map(value => value.requestId)).toEqual(["a-request", "b-request"]);
    expect(fixture.store.listReplays(EVENT.id, { limit: 1 })).toEqual([history[0]]);
    expect(fixture.store.listReplays(EVENT.id, { afterId: "a-request", limit: 1 })).toEqual([history[1]]);
    for (const statement of ["UPDATE replay_requests SET reason = 'operator'", "DELETE FROM replay_requests",
      "INSERT OR REPLACE INTO replay_requests SELECT * FROM replay_requests"]) {
      expect(() => sql(statement)).toThrow(/immutable/);
    }
    expect(fixture.store.listReplays(EVENT.id)).toEqual(history);
  });
});

describe("replay schema and read-only inspection", () => {
  it("migrates deployed storage without modifying historical migration checksums or retained records", () => {
    deadLetter(); const event = fixture.store.getEvent(EVENT.id);
    const attempts = fixture.store.listAttempts(EVENT.id); const letter = fixture.store.getDeadLetter(EVENT.id);
    fixture.store.close();
    sql("DROP TABLE replay_requests; DELETE FROM schema_migrations WHERE version = 4; PRAGMA user_version = 3;");
    expect(() => new WebhookStore(fixture.path, { readOnly: true })).toThrow(StorageError);
    const reopened = fixture.open();
    expect(reopened.getEvent(EVENT.id)).toEqual(event);
    expect(reopened.listAttempts(EVENT.id)).toEqual(attempts);
    expect(reopened.getDeadLetter(EVENT.id)).toEqual(letter);
    const source = readFileSync(new URL("../src/storage-db.ts", import.meta.url), "utf8");
    const migration = /version: 3,\s+sql: `([^`]+)`/u.exec(source)![1]!;
    const db = openDatabase(fixture.path);
    try {
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(STORAGE_SCHEMA_VERSION);
      expect(db.prepare("SELECT checksum FROM schema_migrations WHERE version = 3").get()?.checksum)
        .toBe(createHash("sha256").update(migration).digest("hex"));
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { db.close(); }
  });

  it("opens the current schema read-only and refuses repository and SQL writes", () => {
    deadLetter(); const input = request();
    const before = readFileSync(fixture.path);
    const store = new WebhookStore(fixture.path, { readOnly: true });
    try {
      expect(store.previewReplay(input).repeated).toBe(false);
      expect(store.listDeadLetters()).toHaveLength(1);
      fail(() => store.replayDeadLetter(input), "read-only");
      fail(() => store.claimDelivery(input.now, POLICY), "read-only");
    } finally { store.close(); }
    const db = openDatabase(fixture.path, { readOnly: true });
    try { expect(() => db.exec("DELETE FROM dead_letters")).toThrow(/readonly/); } finally { db.close(); }
    expect(readFileSync(fixture.path)).toEqual(before);
    expect(fixture.store.listReplays(EVENT.id)).toEqual([]);
  });
});
