import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageError, WebhookStore } from '../src/storage.js';
import { SubscriptionValidationError } from '../src/subscription.js';
import type { AttemptDisposition, AttemptInput, NewEvent, ScanCommit } from '../src/storage-types.js';

const START = Date.parse('2000-01-01T00:00:00Z');
const END = START + 10_000;
const NOW = END + 1_000;
const CACHE = fileURLToPath(new URL('../.cache/', import.meta.url));
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function input() {
  return {
    callbackUrl: 'https://callbacks.example/events',
    secretRef: 'callback_key',
    filter: { kind: 'eclipse', type: 'solar' },
    window: { start: new Date(START).toISOString(), end: new Date(END).toISOString() },
  };
}

function event(id = 'event-1', overrides: Partial<NewEvent> = {}): NewEvent {
  return {
    id,
    occurrenceKey: `occurrence:${id}`,
    idempotencyKey: `delivery:${id}`,
    occurredAt: START + 100,
    payload: JSON.stringify({ synthetic: true, id }),
    ...overrides,
  };
}

function scan(events: readonly NewEvent[] = [event()], overrides: Partial<ScanCommit> = {}): ScanCommit {
  return { subscriptionId: 'sub-1', expectedRevision: 1, from: START, to: END, now: NOW, events, ...overrides };
}

function attempt(overrides: Partial<AttemptInput> = {}): AttemptInput {
  return {
    eventId: 'event-1', number: 1, startedAt: NOW, finishedAt: NOW + 10,
    result: { kind: 'http', status: 503 }, ...overrides,
  };
}

function failure(operation: () => unknown, code: StorageError['code']): StorageError {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(StorageError);
  const error = caught as StorageError;
  expect(error.code).toBe(code);
  return error;
}

let directory: string;
let databasePath: string;
let store: WebhookStore;
let connections: WebhookStore[];

function open(): WebhookStore {
  const connection = new WebhookStore(databasePath);
  connections.push(connection);
  return connection;
}

function reopen(): WebhookStore {
  store.close();
  store = open();
  return store;
}

function enqueue(events: readonly NewEvent[] = [event()]): void {
  store.createSubscription('sub-1', input(), START - 1);
  store.commitScan(scan(events));
}

beforeEach(() => {
  mkdirSync(CACHE, { recursive: true });
  directory = mkdtempSync(join(CACHE, 'storage-'));
  databasePath = join(directory, 'webhook.sqlite');
  connections = [];
  store = open();
});

afterEach(() => {
  for (const connection of connections) connection.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('SQLite subscriptions and scan cursors', () => {
  it('creates detached validated subscriptions and preserves them after reopening', () => {
    const raw = input();
    const created = store.createSubscription('sub-1', raw, START - 1);
    expect(created).toEqual({
      id: 'sub-1', revision: 1, spec: { ...input(), enabled: true },
      createdAt: START - 1, updatedAt: START - 1, deletedAt: null,
    });
    raw.window.start = '2001-01-01T00:00:00Z';
    raw.filter.type = 'lunar';
    expect(store.getSubscription('sub-1')).toEqual(created);
    expect(store.getCursor('sub-1')).toEqual({ subscriptionId: 'sub-1', revision: 1, nextAt: START });
    reopen();
    expect(store.getSubscription('sub-1')).toEqual(created);
    expect(store.listSubscriptions()).toEqual([created]);
    expect(store.getCursor('sub-1')).toEqual({ subscriptionId: 'sub-1', revision: 1, nextAt: START });
  });

  it('updates by revision and resets the scan cursor to the replacement schedule', () => {
    enqueue();
    const replacement = {
      ...input(), callbackUrl: 'https://replacement.example/notify', secretRef: 'rotated_key',
      window: { start: new Date(START + 200).toISOString(), end: new Date(END).toISOString() },
    };
    const updated = store.updateSubscription('sub-1', 1, replacement, NOW + 1);
    expect(updated).toMatchObject({ revision: 2, createdAt: START - 1, updatedAt: NOW + 1, deletedAt: null });
    expect(updated.spec).toEqual({ ...replacement, enabled: true });
    expect(store.getCursor('sub-1')).toEqual({ subscriptionId: 'sub-1', revision: 2, nextAt: START + 200 });
    failure(() => store.updateSubscription('sub-1', 1, input(), NOW + 2), 'conflict');
    failure(() => store.deleteSubscription('sub-1', 1, NOW + 2), 'conflict');
    failure(() => store.updateSubscription('sub-1', 2, input(), NOW), 'invalid-input');
    expect(store.getSubscription('sub-1')).toEqual(updated);
    expect(store.getCursor('sub-1')?.nextAt).toBe(START + 200);
    reopen();
    expect(store.getSubscription('sub-1')).toEqual(updated);
    expect(store.getCursor('sub-1')?.nextAt).toBe(START + 200);
  });

  it('soft deletes a subscription while preserving its cursor and delivery history', () => {
    enqueue();
    const priorCursor = store.getCursor('sub-1');
    const priorEvent = store.getEvent('event-1');
    const priorDelivery = store.getDelivery('event-1');
    const removed = store.deleteSubscription('sub-1', 1, NOW + 1);
    expect(removed).toMatchObject({ revision: 2, deletedAt: NOW + 1, updatedAt: NOW + 1 });
    expect(store.listSubscriptions()).toEqual([]);
    expect(store.getSubscription('sub-1')).toEqual(removed);
    expect(store.getCursor('sub-1')).toEqual(priorCursor);
    expect(store.getEvent('event-1')).toEqual(priorEvent);
    expect(store.getDelivery('event-1')).toEqual(priorDelivery);
    failure(() => store.updateSubscription('sub-1', 2, input(), NOW + 2), 'not-found');
    failure(() => store.deleteSubscription('sub-1', 2, NOW + 2), 'not-found');
    failure(() => store.createSubscription('sub-1', input(), NOW + 2), 'conflict');
    reopen();
    expect(store.listSubscriptions()).toEqual([]);
    expect(store.getSubscription('sub-1')).toEqual(removed);
    expect(store.getCursor('sub-1')).toEqual(priorCursor);
    expect(store.listEvents('sub-1')).toEqual([priorEvent]);
  });

  it('enforces subscription uniqueness across connections and reopen', () => {
    const created = store.createSubscription('sub-1', input(), START);
    const second = open();
    failure(() => second.createSubscription('sub-1', input(), START), 'conflict');
    expect(second.getSubscription('sub-1')).toEqual(created);
    reopen();
    failure(() => store.createSubscription('sub-1', input(), START), 'conflict');
    expect(store.listSubscriptions()).toEqual([created]);
  });

  it('does not leave a subscription or cursor when validation fails', () => {
    expect(() => store.createSubscription('sub-1', { ...input(), callbackUrl: 'http://callbacks.example/' }, START))
      .toThrow(SubscriptionValidationError);
    expect(store.getSubscription('sub-1')).toBeUndefined();
    expect(store.getCursor('sub-1')).toBeUndefined();
    store.createSubscription('sub-1', input(), START);
    const before = store.getSubscription('sub-1');
    expect(() => store.updateSubscription('sub-1', 1, { ...input(), secretRef: 'invalid/ref' }, NOW))
      .toThrow(SubscriptionValidationError);
    expect(store.getSubscription('sub-1')).toEqual(before);
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
  });

  it('distinguishes missing records from invalid identifiers', () => {
    expect(store.getSubscription('missing')).toBeUndefined();
    expect(store.getCursor('missing')).toBeUndefined();
    expect(store.getEvent('missing')).toBeUndefined();
    expect(store.getDelivery('missing')).toBeUndefined();
    expect(store.getDeadLetter('missing')).toBeUndefined();
    expect(store.listEvents('missing')).toEqual([]);
    expect(store.listAttempts('missing')).toEqual([]);
    failure(() => store.updateSubscription('missing', 1, input(), NOW), 'not-found');
    failure(() => store.deleteSubscription('missing', 1, NOW), 'not-found');
    failure(() => store.commitScan(scan([], { subscriptionId: 'missing' })), 'not-found');
    failure(() => store.recordAttempt(attempt(), { status: 'delivered' }), 'not-found');
  });
});

describe('transactional event outbox', () => {
  it('persists exact payload bytes, their hash, and the subscription destination snapshot', () => {
    const payload = ' \n{ "synthetic" : true, "label" : "café ☾" }\n';
    const original = event('event-1', { payload });
    enqueue([original]);
    const stored = store.getEvent(original.id);
    expect(stored).toEqual({
      ...original, subscriptionId: 'sub-1', subscriptionRevision: 1, createdAt: NOW,
      payloadSha256: createHash('sha256').update(Buffer.from(payload, 'utf8')).digest('hex'),
    });
    const delivery = {
      eventId: original.id, idempotencyKey: original.idempotencyKey,
      callbackUrl: input().callbackUrl, secretRef: input().secretRef,
      status: 'pending', availableAt: NOW, attemptCount: 0, updatedAt: NOW,
    };
    expect(store.getDelivery(original.id)).toEqual(delivery);
    store.updateSubscription('sub-1', 1, {
      ...input(), callbackUrl: 'https://replacement.example/events', secretRef: 'replacement_key',
    }, NOW + 1);
    reopen();
    expect(store.getEvent(original.id)).toEqual(stored);
    expect(store.getDelivery(original.id)).toEqual(delivery);
  });

  it('holds future events until their occurrence even when discovered earlier', () => {
    store.createSubscription('sub-1', input(), START - 1);
    store.commitScan(scan([event()], { now: START }));
    expect(store.getDelivery('event-1')).toMatchObject({ availableAt: START + 100, updatedAt: START });
    failure(() => store.recordAttempt(attempt({ startedAt: START + 99, finishedAt: START + 100 }), { status: 'pending', availableAt: NOW }), 'invalid-input');
    expect(store.listAttempts('event-1')).toEqual([]);
  });

  it('advances empty scans and assigns boundary events to the following adjacent scan', () => {
    store.createSubscription('sub-1', input(), START - 1);
    const first = store.commitScan(scan([], { to: START + 100 }));
    expect(first).toEqual({ inserted: 0, duplicates: 0, cursor: { subscriptionId: 'sub-1', revision: 1, nextAt: START + 100 } });
    const second = store.commitScan(scan([event()], { from: START + 100 }));
    expect(second).toEqual({ inserted: 1, duplicates: 0, cursor: { subscriptionId: 'sub-1', revision: 1, nextAt: END } });
    reopen();
    expect(store.getCursor('sub-1')?.nextAt).toBe(END);
    expect(store.listEvents('sub-1').map(item => item.id)).toEqual(['event-1']);
  });

  it('rejects events outside the half-open scan without moving its cursor', () => {
    store.createSubscription('sub-1', input(), START);
    for (const occurredAt of [START - 1, END]) {
      failure(() => store.commitScan(scan([event('event-1', { occurredAt })])), 'invalid-input');
      expect(store.getCursor('sub-1')?.nextAt).toBe(START);
      expect(store.listEvents('sub-1')).toEqual([]);
      expect(store.listDeliveries()).toEqual([]);
    }
    store.commitScan(scan([event('event-1', { occurredAt: START })]));
    expect(store.getEvent('event-1')?.occurredAt).toBe(START);
  });

  it('refuses cursor gaps, stale scan positions and ranges beyond the schedule', () => {
    store.createSubscription('sub-1', input(), START);
    failure(() => store.commitScan(scan([], { from: START + 1 })), 'conflict');
    failure(() => store.commitScan(scan([], { to: END + 1 })), 'invalid-input');
    failure(() => store.commitScan(scan([], { now: START - 1 })), 'invalid-input');
    failure(() => store.commitScan(scan([], { to: START })), 'invalid-input');
    failure(() => store.commitScan(scan([], { to: START - 1 })), 'invalid-input');
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
    store.commitScan(scan([], { to: START + 100 }));
    failure(() => store.commitScan(scan()), 'conflict');
    expect(store.getCursor('sub-1')?.nextAt).toBe(START + 100);
    expect(store.listDeliveries()).toEqual([]);
  });

  it('requires the current revision and an enabled, live subscription', () => {
    store.createSubscription('sub-1', input(), START);
    store.updateSubscription('sub-1', 1, { ...input(), enabled: false }, NOW);
    failure(() => store.commitScan(scan()), 'conflict');
    failure(() => store.commitScan(scan([], { expectedRevision: 2 })), 'conflict');
    store.updateSubscription('sub-1', 2, input(), NOW + 1);
    failure(() => store.commitScan(scan([], { expectedRevision: 2, now: NOW + 1 })), 'conflict');
    store.deleteSubscription('sub-1', 3, NOW + 2);
    failure(() => store.commitScan(scan([], { expectedRevision: 4, now: NOW + 2 })), 'not-found');
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
    expect(store.listDeliveries()).toEqual([]);
  });

  it('deduplicates identical occurrences after a revision resets the window', () => {
    enqueue();
    const prior = store.getEvent('event-1');
    store.updateSubscription('sub-1', 1, input(), NOW + 1);
    const result = store.commitScan(scan([event(), event()], { expectedRevision: 2, now: NOW + 1 }));
    expect(result).toEqual({ inserted: 0, duplicates: 2, cursor: { subscriptionId: 'sub-1', revision: 2, nextAt: END } });
    expect(store.getEvent('event-1')).toEqual(prior);
    expect(store.listDeliveries()).toHaveLength(1);
    reopen();
    expect(store.getEvent('event-1')).toEqual(prior);
    expect(store.listDeliveries()).toHaveLength(1);
  });

  it.each([
    { id: 'different-event' },
    { idempotencyKey: 'different-key' },
    { occurredAt: START + 101 },
    { payload: '{ "synthetic":true,"id":"event-1"}' },
  ])('rolls back the whole batch when a stored occurrence changes field %#', changed => {
    enqueue();
    const prior = store.getEvent('event-1');
    store.updateSubscription('sub-1', 1, input(), NOW + 1);
    failure(() => store.commitScan(scan([
      event('event-new'), event('event-1', changed),
    ], { expectedRevision: 2, now: NOW + 1 })), 'conflict');
    expect(store.getEvent('event-new')).toBeUndefined();
    expect(store.getDelivery('event-new')).toBeUndefined();
    expect(store.getCursor('sub-1')).toEqual({ subscriptionId: 'sub-1', revision: 2, nextAt: START });
    expect(store.getEvent('event-1')).toEqual(prior);
    reopen();
    expect(store.listEvents('sub-1')).toEqual([prior]);
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
  });

  it('rolls back conflicting occurrences within the same new batch', () => {
    store.createSubscription('sub-1', input(), START);
    failure(() => store.commitScan(scan([event(), event('event-2', { occurrenceKey: event().occurrenceKey })])), 'conflict');
    expect(store.listEvents('sub-1')).toEqual([]);
    expect(store.listDeliveries()).toEqual([]);
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
  });

  it.each(['id', 'idempotencyKey'] as const)('enforces global %s uniqueness across connections and subscriptions', field => {
    enqueue();
    const second = open();
    second.createSubscription('sub-2', input(), START);
    const duplicate = event('event-2', { [field]: event()[field] });
    failure(() => second.commitScan(scan([event('event-3'), duplicate], { subscriptionId: 'sub-2' })), 'conflict');
    expect(store.getEvent('event-3')).toBeUndefined();
    expect(second.getCursor('sub-2')?.nextAt).toBe(START);
    reopen();
    failure(() => store.commitScan(scan([duplicate], { subscriptionId: 'sub-2' })), 'conflict');
    expect(store.listEvents('sub-2')).toEqual([]);
  });

  it('allows the same occurrence label for different subscriptions', () => {
    enqueue();
    store.createSubscription('sub-2', input(), START);
    store.commitScan(scan([event('event-2', { occurrenceKey: event().occurrenceKey })], { subscriptionId: 'sub-2' }));
    expect(store.listEvents('sub-1').map(item => item.id)).toEqual(['event-1']);
    expect(store.listEvents('sub-2').map(item => item.id)).toEqual(['event-2']);
  });

  it('prevents two connections from committing the same cursor', () => {
    store.createSubscription('sub-1', input(), START);
    const second = open();
    expect(second.getCursor('sub-1')?.nextAt).toBe(START);
    store.commitScan(scan());
    failure(() => second.commitScan(scan([event('event-2')])), 'conflict');
    expect(second.getCursor('sub-1')?.nextAt).toBe(END);
    expect(second.listEvents('sub-1').map(item => item.id)).toEqual(['event-1']);
    expect(second.getDelivery('event-2')).toBeUndefined();
  });
});

describe('delivery attempts and dead letters', () => {
  it('atomically persists retry attempts, scheduling and a final dead letter across reopening', () => {
    enqueue();
    const first = attempt();
    const retryAt = NOW + 100;
    expect(store.recordAttempt(first, { status: 'pending', availableAt: retryAt })).toMatchObject({
      status: 'pending', attemptCount: 1, availableAt: retryAt, updatedAt: first.finishedAt,
    });
    reopen();
    expect(store.listAttempts('event-1')).toEqual([first]);
    expect(store.getDelivery('event-1')).toMatchObject({ status: 'pending', attemptCount: 1, availableAt: retryAt });
    const second = attempt({ number: 2, startedAt: retryAt, finishedAt: retryAt + 10, result: { kind: 'timeout' } });
    store.recordAttempt(second, { status: 'dead-letter', reason: 'attempts-exhausted' });
    const deadLetter = { eventId: 'event-1', attemptNumber: 2, reason: 'attempts-exhausted', createdAt: second.finishedAt };
    expect(store.listAttempts('event-1')).toEqual([first, second]);
    expect(store.getDeadLetter('event-1')).toEqual(deadLetter);
    expect(store.getDelivery('event-1')).toMatchObject({ status: 'dead-letter', attemptCount: 2, updatedAt: second.finishedAt });
    reopen();
    expect(store.listAttempts('event-1')).toEqual([first, second]);
    expect(store.getDeadLetter('event-1')).toEqual(deadLetter);
    expect(store.listDeadLetters()).toEqual([deadLetter]);
    failure(() => store.recordAttempt(attempt({ number: 3, startedAt: retryAt + 20, finishedAt: retryAt + 21 }), { status: 'pending', availableAt: retryAt + 100 }), 'conflict');
    expect(store.listAttempts('event-1')).toEqual([first, second]);
  });

  it.each([200, 204, 299])('marks HTTP %i as delivered and rejects later attempts', status => {
    enqueue();
    const accepted = attempt({ result: { kind: 'http', status } });
    store.recordAttempt(accepted, { status: 'delivered' });
    reopen();
    expect(store.getDelivery('event-1')).toMatchObject({ status: 'delivered', attemptCount: 1, updatedAt: accepted.finishedAt });
    expect(store.listAttempts('event-1')).toEqual([accepted]);
    expect(store.getDeadLetter('event-1')).toBeUndefined();
    failure(() => store.recordAttempt(attempt({ number: 2, startedAt: NOW + 20, finishedAt: NOW + 21 }), { status: 'dead-letter', reason: 'operator' }), 'conflict');
    expect(store.listDeadLetters()).toEqual([]);
  });

  it('does not insert an attempt or change scheduling when an attempt conflicts', () => {
    enqueue();
    const first = attempt();
    store.recordAttempt(first, { status: 'pending', availableAt: NOW + 100 });
    const before = store.getDelivery('event-1');
    const cases: AttemptInput[] = [
      attempt({ number: 1, startedAt: NOW + 100, finishedAt: NOW + 110 }),
      attempt({ number: 3, startedAt: NOW + 100, finishedAt: NOW + 110 }),
    ];
    for (const value of cases) {
      failure(() => store.recordAttempt(value, { status: 'pending', availableAt: NOW + 200 }), 'conflict');
      expect(store.getDelivery('event-1')).toEqual(before);
      expect(store.listAttempts('event-1')).toEqual([first]);
      expect(store.getDeadLetter('event-1')).toBeUndefined();
    }
    failure(() => store.recordAttempt(
      attempt({ number: 2, startedAt: NOW + 99, finishedAt: NOW + 110 }),
      { status: 'pending', availableAt: NOW + 200 },
    ), 'invalid-input');
    expect(store.getDelivery('event-1')).toEqual(before);
    expect(store.listAttempts('event-1')).toEqual([first]);
  });

  it('rejects invalid completion decisions without writing a second attempt', () => {
    enqueue();
    store.recordAttempt(attempt(), { status: 'pending', availableAt: NOW + 100 });
    const before = store.getDelivery('event-1');
    const second = attempt({ number: 2, startedAt: NOW + 100, finishedAt: NOW + 110 });
    const cases: Array<[AttemptInput, AttemptDisposition]> = [
      [second, { status: 'delivered' }],
      [{ ...second, result: { kind: 'http', status: 200 } }, { status: 'pending', availableAt: NOW + 200 }],
      [{ ...second, result: { kind: 'http', status: 204 } }, { status: 'dead-letter', reason: 'operator' }],
      [second, { status: 'pending', availableAt: NOW + 109 }],
      [{ ...second, finishedAt: NOW + 99 }, { status: 'dead-letter', reason: 'attempts-exhausted' }],
    ];
    for (const [value, disposition] of cases) {
      failure(() => store.recordAttempt(value, disposition), 'invalid-input');
      expect(store.getDelivery('event-1')).toEqual(before);
      expect(store.listAttempts('event-1')).toEqual([attempt()]);
      expect(store.listDeadLetters()).toEqual([]);
    }
    reopen();
    expect(store.getDelivery('event-1')).toEqual(before);
    expect(store.listAttempts('event-1')).toEqual([attempt()]);
    expect(store.getDeadLetter('event-1')).toBeUndefined();
  });

  it('enforces attempt-number uniqueness across connections', () => {
    enqueue();
    const second = open();
    store.recordAttempt(attempt(), { status: 'pending', availableAt: NOW + 10 });
    failure(() => second.recordAttempt(attempt({ startedAt: NOW + 10, finishedAt: NOW + 20 }), { status: 'dead-letter', reason: 'operator' }), 'conflict');
    expect(second.listAttempts('event-1')).toEqual([attempt()]);
    expect(second.getDelivery('event-1')?.status).toBe('pending');
    expect(second.getDeadLetter('event-1')).toBeUndefined();
  });

  it.each([
    'BEFORE UPDATE ON deliveries',
    'BEFORE INSERT ON dead_letters',
  ])('rolls back attempt completion when SQLite rejects a later write: %s', boundary => {
    enqueue();
    const before = store.getDelivery('event-1');
    const faultConnection = new DatabaseSync(databasePath);
    try {
      // Inject a database failure after the attempt insert, independently of input validation.
      faultConnection.exec(`CREATE TRIGGER test_write_failure ${boundary}
        BEGIN SELECT RAISE(ABORT, 'synthetic-database-failure'); END`);
    } finally {
      faultConnection.close();
    }
    const error = failure(() => store.recordAttempt(attempt(), {
      status: 'dead-letter', reason: 'attempts-exhausted',
    }), 'conflict');
    expect(String(error)).not.toContain('synthetic-database-failure');
    expect(store.getDelivery('event-1')).toEqual(before);
    expect(store.listAttempts('event-1')).toEqual([]);
    expect(store.listDeadLetters()).toEqual([]);
    const repairConnection = new DatabaseSync(databasePath);
    try {
      repairConnection.exec('DROP TRIGGER test_write_failure');
    } finally {
      repairConnection.close();
    }
    reopen();
    expect(store.getDelivery('event-1')).toEqual(before);
    expect(store.listAttempts('event-1')).toEqual([]);
    expect(store.getDeadLetter('event-1')).toBeUndefined();
    store.recordAttempt(attempt(), { status: 'dead-letter', reason: 'attempts-exhausted' });
    expect(store.listAttempts('event-1')).toEqual([attempt()]);
    expect(store.getDelivery('event-1')?.status).toBe('dead-letter');
    expect(store.getDeadLetter('event-1')?.attemptNumber).toBe(1);
  });

  it.each(['timeout', 'network-error', 'destination-rejected'] as const)('stores structured %s outcomes without free-text diagnostics', kind => {
    enqueue();
    const value = attempt({ result: { kind } });
    const reason = kind === 'destination-rejected' ? 'destination-rejected' : 'operator';
    store.recordAttempt(value, { status: 'dead-letter', reason });
    expect(store.listAttempts('event-1')).toEqual([value]);
    expect(store.getDeadLetter('event-1')?.reason).toBe(reason);
  });
});

describe('bounded storage inputs and pages', () => {
  it('rejects SQL-shaped identifiers without exposing them in errors', () => {
    store.createSubscription('sub-1', input(), START);
    const marker = "untrusted-marker'); DROP TABLE subscriptions;--";
    const calls = [
      () => store.createSubscription(marker, input(), START),
      () => store.getSubscription(marker),
      () => store.getCursor(marker),
      () => store.getEvent(marker),
      () => store.getDelivery(marker),
      () => store.getDeadLetter(marker),
      () => store.listSubscriptions({ afterId: marker }),
      () => store.commitScan(scan([event(marker)])),
      () => store.commitScan(scan([event('event-1', { occurrenceKey: marker })])),
      () => store.commitScan(scan([event('event-1', { idempotencyKey: marker })])),
    ];
    for (const operation of calls) {
      const error = failure(operation, 'invalid-input');
      expect(String(error)).not.toContain('untrusted-marker');
      expect(JSON.stringify(error)).not.toContain('untrusted-marker');
    }
    expect(store.listSubscriptions().map(item => item.id)).toEqual(['sub-1']);
    expect(store.listDeliveries()).toEqual([]);
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
  });

  it('bounds ASCII identifiers and accepts punctuation only after the first character', () => {
    for (const id of ['', '.bad', 'white space', 'unicode-é', 'a'.repeat(257)]) {
      failure(() => store.createSubscription(id, input(), START), 'invalid-input');
    }
    for (const id of ['A', '0a_.:-Z', 'a'.repeat(256)]) {
      expect(store.createSubscription(id, input(), START).id).toBe(id);
    }
  });

  it('preserves negative epoch milliseconds without rounding', () => {
    const start = Date.parse('1900-01-01T00:00:00Z');
    const end = start + 1_000;
    store.createSubscription('sub-1', {
      ...input(), window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    }, start - 1);
    const original = event('event-1', { occurredAt: start });
    store.commitScan(scan([original], { from: start, to: end, now: start }));
    const value = attempt({ startedAt: start, finishedAt: start + 1, result: { kind: 'http', status: 204 } });
    store.recordAttempt(value, { status: 'delivered' });
    reopen();
    expect(store.getEvent('event-1')?.occurredAt).toBe(start);
    expect(store.getSubscription('sub-1')?.createdAt).toBe(start - 1);
    expect(store.listAttempts('event-1')).toEqual([value]);
  });

  it.each([NaN, Infinity, 1.5, 8_640_000_000_000_001])('rejects a nonrepresentable integer time %#', now => {
    failure(() => store.createSubscription('sub-1', input(), now), 'invalid-input');
    expect(store.getSubscription('sub-1')).toBeUndefined();
    store.createSubscription('sub-1', input(), START);
    failure(() => store.commitScan(scan([], { now })), 'invalid-input');
    failure(() => store.commitScan(scan([event('event-1', { occurredAt: now })])), 'invalid-input');
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
  });

  it('rejects invalid JSON and bounds payloads by UTF-8 bytes, preserving the accepted boundary', () => {
    store.createSubscription('sub-1', input(), START);
    for (const payload of ['', '{', 'null', '[]', 'true', '123', '"text"', '{"x":"\ud800"}']) {
      failure(() => store.commitScan(scan([event('event-1', { payload })])), 'invalid-input');
    }
    const overhead = Buffer.byteLength(JSON.stringify({ text: '' }));
    const room = 262_144 - overhead;
    const text = 'é'.repeat(Math.floor(room / 2)) + 'x'.repeat(room % 2);
    const payload = JSON.stringify({ text });
    expect(Buffer.byteLength(payload)).toBe(262_144);
    failure(() => store.commitScan(scan([event('event-1', { payload: JSON.stringify({ text: text + 'x' }) })])), 'invalid-input');
    expect(store.listEvents('sub-1')).toEqual([]);
    store.commitScan(scan([event('event-1', { payload })]));
    reopen();
    expect(store.getEvent('event-1')?.payload).toBe(payload);
  });

  it('rejects oversized scan batches before writing any event', () => {
    store.createSubscription('sub-1', input(), START);
    const events = Array.from({ length: 1_001 }, (_, index) => event(`event-${index}`));
    failure(() => store.commitScan(scan(events)), 'invalid-input');
    expect(store.listEvents('sub-1')).toEqual([]);
    expect(store.getCursor('sub-1')?.nextAt).toBe(START);
  });

  it('paginates subscriptions, events, deliveries and dead letters in stable identifier order', () => {
    for (const id of ['sub-c', 'sub-a', 'sub-b']) store.createSubscription(id, input(), START);
    expect(store.listSubscriptions({ limit: 2 }).map(item => item.id)).toEqual(['sub-a', 'sub-b']);
    expect(store.listSubscriptions({ afterId: 'sub-b', limit: 2 }).map(item => item.id)).toEqual(['sub-c']);
    const events = ['event-c', 'event-a', 'event-b'].map(id => event(id));
    store.commitScan(scan(events, { subscriptionId: 'sub-a' }));
    for (const original of events) {
      store.recordAttempt(attempt({ eventId: original.id }), { status: 'dead-letter', reason: 'operator' });
    }
    expect(store.listEvents('sub-a', { limit: 2 }).map(item => item.id)).toEqual(['event-a', 'event-b']);
    expect(store.listEvents('sub-a', { afterId: 'event-b', limit: 2 }).map(item => item.id)).toEqual(['event-c']);
    expect(store.listEvents('sub-b')).toEqual([]);
    expect(store.listDeliveries({ limit: 2 }).map(item => item.eventId)).toEqual(['event-a', 'event-b']);
    expect(store.listDeliveries({ afterId: 'event-b', limit: 2 }).map(item => item.eventId)).toEqual(['event-c']);
    expect(store.listDeadLetters({ limit: 2 }).map(item => item.eventId)).toEqual(['event-a', 'event-b']);
    expect(store.listDeadLetters({ afterId: 'event-b', limit: 2 }).map(item => item.eventId)).toEqual(['event-c']);
  });

  it('paginates attempts by their increasing attempt number', () => {
    enqueue();
    for (let number = 1; number <= 3; number++) {
      store.recordAttempt(attempt({ number, startedAt: NOW + number * 10, finishedAt: NOW + number * 10 + 1 }), {
        status: 'pending', availableAt: NOW + number * 10 + 2,
      });
    }
    expect(store.listAttempts('event-1', 0, 2).map(item => item.number)).toEqual([1, 2]);
    expect(store.listAttempts('event-1', 2, 2).map(item => item.number)).toEqual([3]);
    expect(store.listAttempts('event-1', 3, 2)).toEqual([]);
  });

  it('defaults to a bounded page and rejects invalid page sizes and attempt offsets', () => {
    for (let index = 0; index < 101; index++) store.createSubscription(`sub-${index}`, input(), START);
    expect(store.listSubscriptions()).toHaveLength(100);
    expect(store.listSubscriptions({ limit: 1_000 })).toHaveLength(101);
    for (const limit of [0, -1, 1.5, 1_001, Infinity]) {
      failure(() => store.listSubscriptions({ limit }), 'invalid-input');
      failure(() => store.listEvents('sub-1', { limit }), 'invalid-input');
      failure(() => store.listDeliveries({ limit }), 'invalid-input');
      failure(() => store.listDeadLetters({ limit }), 'invalid-input');
      failure(() => store.listAttempts('event-1', 0, limit), 'invalid-input');
    }
    for (const afterNumber of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      failure(() => store.listAttempts('event-1', afterNumber), 'invalid-input');
    }
  });

  it('rejects out-of-range revisions, attempt numbers and HTTP status codes', () => {
    enqueue();
    for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      failure(() => store.updateSubscription('sub-1', revision, input(), NOW), 'invalid-input');
      failure(() => store.commitScan(scan([], { expectedRevision: revision })), 'invalid-input');
    }
    for (const number of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      failure(() => store.recordAttempt(attempt({ number }), { status: 'dead-letter', reason: 'operator' }), 'invalid-input');
    }
    for (const status of [99, 600, 200.5, NaN]) {
      failure(() => store.recordAttempt(attempt({ result: { kind: 'http', status } }), { status: 'dead-letter', reason: 'operator' }), 'invalid-input');
    }
    expect(store.listAttempts('event-1')).toEqual([]);
    expect(store.getDelivery('event-1')?.attemptCount).toBe(0);
  });

  it('allows repeated close calls and returns a typed failure for later reads and writes', () => {
    store.close();
    store.close();
    failure(() => store.getSubscription('sub-1'), 'closed');
    failure(() => store.createSubscription('sub-1', input(), START), 'closed');
    failure(() => store.listDeliveries(), 'closed');
    failure(() => store.commitScan(scan()), 'closed');
    failure(() => store.recordAttempt(attempt(), { status: 'dead-letter', reason: 'operator' }), 'closed');
  });
});
