import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue, SQLOutputValue } from "node:sqlite";
import { openDatabase } from "./storage-db.js";
import { parseStoredSubscription, parseSubscription, SubscriptionValidationError } from "./subscription.js";
import { deliveryDisposition, parseDeliveryPolicy, type DeliveryPolicy } from "./delivery-policy.js";
import type {
  AttemptDisposition, AttemptInput, AttemptResult, DeadLetterReason, DeliveryClaim, NewEvent, Page,
  ScanCommit, ScanCursor, StoredAttempt, StoredDeadLetter, StoredDelivery,
  StoredEvent, StoredSubscription
} from "./storage-types.js";

export const STORAGE_LIMITS = Object.freeze({
  identifierBytes: 256,
  payloadBytes: 262_144,
  eventsPerScan: 1000,
  defaultPageSize: 100,
  maxPageSize: 1000
});

export type StorageErrorCode = "invalid-input" | "not-found" | "conflict" | "closed" | "storage-failure";

/** Messages deliberately exclude SQL, payloads, destinations and caller values. */
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) {
    super(`Webhook storage: ${code}.`);
    this.name = "StorageError";
  }
}

type Row = Record<string, SQLOutputValue>;
function fail(code: StorageErrorCode): never { throw new StorageError(code); }
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/u.test(value)) fail("invalid-input");
}
function time(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > 8_640_000_000_000_000) {
    fail("invalid-input");
  }
}
function positive(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) fail("invalid-input");
}
function page(input: Page = {}): { after: string; limit: number } {
  if (!input || typeof input !== "object") fail("invalid-input");
  if (input.afterId !== undefined) identifier(input.afterId);
  const limit = input.limit === undefined ? STORAGE_LIMITS.defaultPageSize : input.limit;
  positive(limit);
  if (limit > STORAGE_LIMITS.maxPageSize) fail("invalid-input");
  return { after: input.afterId ?? "", limit };
}
function payload(value: unknown): asserts value is string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > STORAGE_LIMITS.payloadBytes ||
      Buffer.from(value, "utf8").toString("utf8") !== value) fail("invalid-input");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { fail("invalid-input"); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) fail("invalid-input");
}
function event(input: NewEvent): NewEvent {
  if (!input || typeof input !== "object") fail("invalid-input");
  identifier(input.id);
  identifier(input.occurrenceKey);
  identifier(input.idempotencyKey);
  time(input.occurredAt);
  payload(input.payload);
  return { id: input.id, occurrenceKey: input.occurrenceKey, idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt, payload: input.payload };
}
function result(input: AttemptResult): AttemptResult {
  if (!input || typeof input !== "object") fail("invalid-input");
  switch (input.kind) {
    case "http":
      if (!Number.isInteger(input.status) || input.status < 100 || input.status > 599) fail("invalid-input");
      return Object.freeze({ kind: input.kind, status: input.status });
    case "timeout": case "network-error": case "destination-rejected":
    case "cancelled": case "interrupted": case "signing-error":
      return Object.freeze({ kind: input.kind });
    default: return fail("invalid-input");
  }
}

function subscriptionRow(row: Row): StoredSubscription {
  return Object.freeze({
    id: row.id as string, revision: row.revision as number,
    spec: parseStoredSubscription(JSON.parse(row.spec_json as string)),
    createdAt: row.created_at as number, updatedAt: row.updated_at as number,
    deletedAt: row.deleted_at as number | null
  });
}
function cursorRow(row: Row): ScanCursor {
  return Object.freeze({ subscriptionId: row.subscription_id as string,
    revision: row.revision as number, nextAt: row.next_at as number });
}
function eventRow(row: Row): StoredEvent {
  return Object.freeze({
    id: row.id as string, subscriptionId: row.subscription_id as string,
    subscriptionRevision: row.subscription_revision as number,
    occurrenceKey: row.occurrence_key as string, idempotencyKey: row.idempotency_key as string,
    occurredAt: row.occurred_at as number, payload: row.payload as string,
    payloadSha256: row.payload_sha256 as string, createdAt: row.created_at as number
  });
}
function deliveryRow(row: Row): StoredDelivery {
  return Object.freeze({
    eventId: row.event_id as string, idempotencyKey: row.idempotency_key as string,
    callbackUrl: row.callback_url as string, secretRef: row.secret_ref as string,
    status: row.status as StoredDelivery["status"], availableAt: row.available_at as number,
    attemptCount: row.attempt_count as number, updatedAt: row.updated_at as number
  });
}
function deadLetterRow(row: Row): StoredDeadLetter {
  return Object.freeze({ eventId: row.event_id as string, attemptNumber: row.attempt_number as number,
    reason: row.reason as DeadLetterReason, createdAt: row.created_at as number });
}

const DELIVERY_SELECT = `SELECT d.*, e.idempotency_key FROM deliveries d
  JOIN events e ON e.id = d.event_id`;

/** Synchronous local SQLite repository. No network calls or background timers. */
export class WebhookStore {
  #db: DatabaseSync;
  #closed = false;

  constructor(path: string) {
    if (typeof path !== "string" || path.length === 0 || path.includes("\0")) fail("invalid-input");
    try { this.#db = openDatabase(path); } catch { fail("storage-failure"); }
  }

  close(): void {
    if (this.#closed) return;
    this.#run(() => this.#db.close());
    this.#closed = true;
  }

  #run<T>(operation: () => T): T {
    if (this.#closed) fail("closed");
    try { return operation(); } catch (error) {
      if (error instanceof StorageError || error instanceof SubscriptionValidationError) throw error;
      // SQLite extended constraint codes share the low byte with SQLITE_CONSTRAINT.
      const code: unknown = error && typeof error === "object" && "errcode" in error ? error.errcode : undefined;
      fail(typeof code === "number" && (code & 255) === 19 ? "conflict" : "storage-failure");
    }
  }

  #transaction<T>(operation: () => T): T {
    return this.#run(() => {
      this.#db.exec("BEGIN IMMEDIATE");
      try {
        const value = operation();
        this.#db.exec("COMMIT");
        return value;
      } catch (error) {
        try { this.#db.exec("ROLLBACK"); } catch { /* Preserve the original failure. */ }
        throw error;
      }
    });
  }

  #get(sql: string, ...params: SQLInputValue[]): Row | undefined { return this.#db.prepare(sql).get(...params); }
  #all(sql: string, ...params: SQLInputValue[]): Row[] { return this.#db.prepare(sql).all(...params); }
  #write(sql: string, ...params: SQLInputValue[]): void { this.#db.prepare(sql).run(...params); }

  #live(id: string, expectedRevision: number): StoredSubscription {
    identifier(id);
    positive(expectedRevision);
    const record = this.getSubscription(id);
    if (!record || record.deletedAt !== null) fail("not-found");
    if (record.revision !== expectedRevision) fail("conflict");
    return record;
  }

  createSubscription(id: string, input: unknown, now: number): StoredSubscription {
    return this.#transaction(() => {
      identifier(id); time(now);
      const spec = parseSubscription(input);
      this.#write(`INSERT INTO subscriptions (id, revision, spec_json, created_at, updated_at, deleted_at)
        VALUES (?, 1, ?, ?, ?, NULL)`, id, JSON.stringify(spec), now, now);
      this.#write("INSERT INTO scan_cursors (subscription_id, revision, next_at) VALUES (?, 1, ?)",
        id, Date.parse(spec.window.start));
      return this.getSubscription(id)!;
    });
  }

  getSubscription(id: string): StoredSubscription | undefined {
    return this.#run(() => {
      identifier(id);
      const row = this.#get("SELECT * FROM subscriptions WHERE id = ?", id);
      return row && subscriptionRow(row);
    });
  }

  listSubscriptions(input?: Page): StoredSubscription[] {
    return this.#run(() => {
      const { after, limit } = page(input);
      return this.#all("SELECT * FROM subscriptions WHERE deleted_at IS NULL AND id > ? ORDER BY id LIMIT ?",
        after, limit).map(subscriptionRow);
    });
  }

  updateSubscription(id: string, expectedRevision: number, input: unknown, now: number): StoredSubscription {
    return this.#transaction(() => {
      const current = this.#live(id, expectedRevision);
      time(now);
      if (now < current.updatedAt || current.revision === Number.MAX_SAFE_INTEGER) fail("invalid-input");
      const spec = parseSubscription(input);
      const revision = current.revision + 1;
      this.#write("UPDATE subscriptions SET revision = ?, spec_json = ?, updated_at = ? WHERE id = ?",
        revision, JSON.stringify(spec), now, id);
      this.#write("UPDATE scan_cursors SET revision = ?, next_at = ? WHERE subscription_id = ?",
        revision, Date.parse(spec.window.start), id);
      return this.getSubscription(id)!;
    });
  }

  /** A tombstone stops scans; already queued deliveries remain retained and deliverable. */
  deleteSubscription(id: string, expectedRevision: number, now: number): StoredSubscription {
    return this.#transaction(() => {
      const current = this.#live(id, expectedRevision);
      time(now);
      if (now < current.updatedAt || current.revision === Number.MAX_SAFE_INTEGER) fail("invalid-input");
      this.#write("UPDATE subscriptions SET revision = ?, updated_at = ?, deleted_at = ? WHERE id = ?",
        current.revision + 1, now, now, id);
      return this.getSubscription(id)!;
    });
  }

  getCursor(subscriptionId: string): ScanCursor | undefined {
    return this.#run(() => {
      identifier(subscriptionId);
      const row = this.#get("SELECT * FROM scan_cursors WHERE subscription_id = ?", subscriptionId);
      return row && cursorRow(row);
    });
  }

  /** The scan policy persists for the subscription's lifetime, across revisions. */
  getScanPolicy(subscriptionId: string): string | undefined {
    return this.#run(() => {
      identifier(subscriptionId);
      return this.#get("SELECT policy_key FROM scan_policies WHERE subscription_id = ?", subscriptionId)
        ?.policy_key as string | undefined;
    });
  }

  /**
   * Caller supplies only a complete search. Storage cannot establish astronomical completeness.
   * A first policy key requires the current cursor at schedule start and no retained events.
   */
  commitScan(input: ScanCommit): { inserted: number; duplicates: number; cursor: ScanCursor } {
    return this.#transaction(() => {
      if (!input || typeof input !== "object") fail("invalid-input");
      const current = this.#live(input.subscriptionId, input.expectedRevision);
      time(input.from); time(input.to); time(input.now);
      if (!current.spec.enabled) fail("conflict");
      if (input.from >= input.to || input.from < Date.parse(current.spec.window.start) ||
          input.to > Date.parse(current.spec.window.end) || input.now < current.updatedAt ||
          !Array.isArray(input.events) || input.events.length > STORAGE_LIMITS.eventsPerScan) fail("invalid-input");
      const cursor = this.getCursor(current.id);
      if (!cursor || cursor.revision !== current.revision || cursor.nextAt !== input.from) fail("conflict");
      if (input.policyKey !== undefined) identifier(input.policyKey);
      const policy = this.getScanPolicy(current.id);
      if (policy !== undefined && input.policyKey !== policy) fail("conflict");
      if (policy === undefined && input.policyKey !== undefined) {
        // Legacy cursors or occurrences have no compatible policy provenance.
        // Only an unscanned current window with no retained events may bind.
        if (cursor.nextAt !== Date.parse(current.spec.window.start) ||
            this.#get("SELECT 1 FROM events WHERE subscription_id = ? LIMIT 1", current.id)) fail("conflict");
        this.#write("INSERT INTO scan_policies (subscription_id, policy_key) VALUES (?, ?)",
          current.id, input.policyKey);
      }
      let inserted = 0;
      let duplicates = 0;
      for (const candidate of input.events) {
        const value = event(candidate);
        if (value.occurredAt < input.from || value.occurredAt >= input.to) fail("invalid-input");
        const existing = this.#get("SELECT * FROM events WHERE subscription_id = ? AND occurrence_key = ?",
          current.id, value.occurrenceKey);
        if (existing) {
          if (existing.id !== value.id || existing.idempotency_key !== value.idempotencyKey ||
              existing.occurred_at !== value.occurredAt || existing.payload !== value.payload) fail("conflict");
          duplicates++;
          continue;
        }
        const sha256 = createHash("sha256").update(value.payload, "utf8").digest("hex");
        this.#write(`INSERT INTO events (id, subscription_id, subscription_revision, occurrence_key,
          idempotency_key, occurred_at, payload, payload_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        value.id, current.id, current.revision, value.occurrenceKey, value.idempotencyKey,
        value.occurredAt, value.payload, sha256, input.now);
        this.#write(`INSERT INTO deliveries (event_id, callback_url, secret_ref, status, available_at,
          attempt_count, updated_at) VALUES (?, ?, ?, 'pending', ?, 0, ?)`,
        value.id, current.spec.callbackUrl, current.spec.secretRef, Math.max(input.now, value.occurredAt), input.now);
        inserted++;
      }
      this.#write("UPDATE scan_cursors SET next_at = ? WHERE subscription_id = ?", input.to, current.id);
      return { inserted, duplicates, cursor: this.getCursor(current.id)! };
    });
  }

  getEvent(id: string): StoredEvent | undefined {
    return this.#run(() => {
      identifier(id);
      const row = this.#get("SELECT * FROM events WHERE id = ?", id);
      return row && eventRow(row);
    });
  }

  listEvents(subscriptionId: string, input?: Page): StoredEvent[] {
    return this.#run(() => {
      identifier(subscriptionId);
      const { after, limit } = page(input);
      return this.#all("SELECT * FROM events WHERE subscription_id = ? AND id > ? ORDER BY id LIMIT ?",
        subscriptionId, after, limit).map(eventRow);
    });
  }

  getDelivery(eventId: string): StoredDelivery | undefined {
    return this.#run(() => {
      identifier(eventId);
      const row = this.#get(`${DELIVERY_SELECT} WHERE d.event_id = ?`, eventId);
      return row && deliveryRow(row);
    });
  }

  listDeliveries(input?: Page): StoredDelivery[] {
    return this.#run(() => {
      const { after, limit } = page(input);
      return this.#all(`${DELIVERY_SELECT} WHERE d.event_id > ? ORDER BY d.event_id LIMIT ?`,
        after, limit).map(deliveryRow);
    });
  }

  /** Legacy unleased writes are refused after the delivery's first managed claim. */
  recordAttempt(input: AttemptInput, disposition: AttemptDisposition): StoredDelivery {
    return this.#transaction(() => {
      if (!input || typeof input !== "object") fail("invalid-input");
      identifier(input.eventId);
      if (this.#get("SELECT 1 FROM delivery_policies WHERE event_id = ?", input.eventId)) fail("conflict");
      return this.#recordAttempt(input, disposition);
    });
  }

  #recordAttempt(input: AttemptInput, disposition: AttemptDisposition): StoredDelivery {
    if (!input || typeof input !== "object" || !disposition || typeof disposition !== "object") fail("invalid-input");
    identifier(input.eventId); positive(input.number); time(input.startedAt); time(input.finishedAt);
    const outcome = result(input.result);
    const delivery = this.getDelivery(input.eventId);
    if (!delivery) fail("not-found");
    if (delivery.status !== "pending" || input.number !== delivery.attemptCount + 1) fail("conflict");
    if (input.startedAt < delivery.availableAt || input.startedAt < delivery.updatedAt ||
        input.finishedAt < input.startedAt) fail("invalid-input");
    const success = outcome.kind === "http" && outcome.status >= 200 && outcome.status < 300;
    if ((disposition.status === "delivered") !== success) fail("invalid-input");
    let availableAt = delivery.availableAt;
    switch (disposition.status) {
      case "pending":
        time(disposition.availableAt);
        if (disposition.availableAt < input.finishedAt) fail("invalid-input");
        availableAt = disposition.availableAt;
        break;
      case "delivered": break;
      case "dead-letter":
        if (!["attempts-exhausted", "destination-rejected", "operator"].includes(disposition.reason)) fail("invalid-input");
        break;
      default: fail("invalid-input");
    }
    this.#write(`INSERT INTO attempts (event_id, number, started_at, finished_at, result_json)
      VALUES (?, ?, ?, ?, ?)`, input.eventId, input.number, input.startedAt, input.finishedAt, JSON.stringify(outcome));
    this.#write("UPDATE deliveries SET status = ?, available_at = ?, attempt_count = ?, updated_at = ? WHERE event_id = ?",
      disposition.status, availableAt, input.number, input.finishedAt, input.eventId);
    if (disposition.status === "dead-letter") {
      this.#write("INSERT INTO dead_letters (event_id, attempt_number, reason, created_at) VALUES (?, ?, ?, ?)",
        input.eventId, input.number, disposition.reason, input.finishedAt);
    }
    return this.getDelivery(input.eventId)!;
  }

  #deliveryPolicy(eventId: string): DeliveryPolicy {
    const row = this.#get("SELECT policy_json FROM delivery_policies WHERE event_id = ?", eventId);
    if (!row) fail("conflict");
    return parseDeliveryPolicy(JSON.parse(row.policy_json as string) as DeliveryPolicy);
  }

  /** Claim or recover one due record under a short write transaction, never over HTTP. */
  claimDelivery(now: number, inputPolicy: DeliveryPolicy): DeliveryClaim {
    return this.#transaction(() => {
      time(now);
      let requested: DeliveryPolicy;
      try { requested = parseDeliveryPolicy(inputPolicy); } catch { fail("invalid-input"); }
      const row = this.#get(`${DELIVERY_SELECT}
        LEFT JOIN delivery_leases l ON l.event_id = d.event_id
        WHERE d.status = 'pending' AND d.available_at <= ? AND d.updated_at <= ?
          AND (l.event_id IS NULL OR l.expires_at <= ?)
        ORDER BY d.available_at, d.event_id LIMIT 1`, now, now, now);
      if (!row) return { status: "idle" };
      const delivery = deliveryRow(row);
      if (!this.#get("SELECT 1 FROM delivery_policies WHERE event_id = ?", delivery.eventId)) {
        this.#write("INSERT INTO delivery_policies (event_id, policy_json) VALUES (?, ?)",
          delivery.eventId, JSON.stringify(requested));
      }
      const policy = this.#deliveryPolicy(delivery.eventId);
      const expired = this.#get("SELECT * FROM delivery_leases WHERE event_id = ?", delivery.eventId);
      if (expired) {
        // A crash can happen before send, during send, or after receiver acknowledgement.
        // Recovery cannot distinguish these cases. Count it and preserve the identity.
        const number = expired.number as number;
        const finishedAt = expired.expires_at as number;
        const outcome: AttemptResult = { kind: "interrupted" };
        this.#write("DELETE FROM delivery_leases WHERE event_id = ?", delivery.eventId);
        const updated = this.#recordAttempt({ eventId: delivery.eventId, number,
          startedAt: expired.started_at as number, finishedAt, result: outcome },
        deliveryDisposition(policy, number, outcome, finishedAt));
        return { status: "recovered", delivery: updated };
      }
      // Existing unleased history can already have consumed the requested budget.
      if (delivery.attemptCount >= policy.maxAttempts) {
        this.#write("UPDATE deliveries SET status = 'dead-letter', updated_at = ? WHERE event_id = ?", now, delivery.eventId);
        this.#write("INSERT INTO dead_letters (event_id, attempt_number, reason, created_at) VALUES (?, ?, 'attempts-exhausted', ?)",
          delivery.eventId, delivery.attemptCount, now);
        return { status: "recovered", delivery: this.getDelivery(delivery.eventId)! };
      }
      const expiresAt = now + policy.leaseMs;
      time(expiresAt);
      const lease = Object.freeze({ eventId: delivery.eventId, token: randomUUID(),
        number: delivery.attemptCount + 1, startedAt: now, expiresAt });
      this.#write("INSERT INTO delivery_leases (event_id, token, number, started_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        lease.eventId, lease.token, lease.number, lease.startedAt, lease.expiresAt);
      return { status: "claimed", lease, delivery, event: this.getEvent(delivery.eventId)! };
    });
  }

  /** A stale or expired token cannot acknowledge, retry or dead-letter any attempt. */
  finishDelivery(eventId: string, token: string, outcome: AttemptResult, finishedAt: number): StoredDelivery {
    return this.#transaction(() => {
      identifier(eventId); identifier(token); time(finishedAt);
      const checked = result(outcome);
      if (checked.kind === "interrupted") fail("invalid-input"); // Recovery owns this diagnostic.
      const lease = this.#get("SELECT * FROM delivery_leases WHERE event_id = ? AND token = ?", eventId, token);
      if (!lease || finishedAt >= (lease.expires_at as number)) fail("conflict");
      const number = lease.number as number;
      const policy = this.#deliveryPolicy(eventId);
      this.#write("DELETE FROM delivery_leases WHERE event_id = ?", eventId);
      return this.#recordAttempt({ eventId, number, startedAt: lease.started_at as number,
        finishedAt, result: checked }, deliveryDisposition(policy, number, checked, finishedAt));
    });
  }

  listAttempts(eventId: string, afterNumber = 0, limit: number = STORAGE_LIMITS.defaultPageSize): StoredAttempt[] {
    return this.#run(() => {
      identifier(eventId);
      if (!Number.isSafeInteger(afterNumber) || afterNumber < 0) fail("invalid-input");
      page({ limit });
      return this.#all("SELECT * FROM attempts WHERE event_id = ? AND number > ? ORDER BY number LIMIT ?",
        eventId, afterNumber, limit).map((row) => Object.freeze({
        eventId: row.event_id as string, number: row.number as number,
        startedAt: row.started_at as number, finishedAt: row.finished_at as number,
        result: result(JSON.parse(row.result_json as string) as AttemptResult)
      }));
    });
  }

  getDeadLetter(eventId: string): StoredDeadLetter | undefined {
    return this.#run(() => {
      identifier(eventId);
      const row = this.#get("SELECT * FROM dead_letters WHERE event_id = ?", eventId);
      return row && deadLetterRow(row);
    });
  }

  listDeadLetters(input?: Page): StoredDeadLetter[] {
    return this.#run(() => {
      const { after, limit } = page(input);
      return this.#all("SELECT * FROM dead_letters WHERE event_id > ? ORDER BY event_id LIMIT ?",
        after, limit).map(deadLetterRow);
    });
  }
}
