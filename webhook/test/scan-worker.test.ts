import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calc } from '../../src/calc.js';
import { searchEvents } from '../src/event-search.js';
import type { EventSearchDependencies, EventSearchRequest, EventSearchResult } from '../src/event-search-types.js';
import { ScanWorker, ScanWorkerError } from '../src/scan-worker.js';
import type { ScanPolicy } from '../src/scan-types.js';
import { STORAGE_LIMITS, WebhookStore } from '../src/storage.js';
import type { SubscriptionSpec } from '../src/types.js';

// Invented schedules and motion exercise discovery and persistence, not sky accuracy.
const BASE = Date.parse('2000-01-01T12:00:00.000Z');
const NOW = BASE + 20_000;
const CACHE = fileURLToPath(new URL('../.cache/', import.meta.url));
const iso = (offset: number): string => new Date(BASE + offset).toISOString();
const wrap = (value: number): number => ((value % 360) + 360) % 360;
const policy: ScanPolicy = { maxWindowMs: 5000, stepMs: 1000, maxEvaluations: 10_000 };
const request = { now: NOW, through: BASE + 10_000 };

function specification(overrides: Partial<SubscriptionSpec> = {}): SubscriptionSpec {
  return {
    callbackUrl: 'https://callbacks.example/events', secretRef: 'callback_key', enabled: true,
    filter: { kind: 'ingress', body: 'Mercury', sign: 'taurus', direction: 'any' },
    window: { start: iso(0), end: iso(10_000) }, ...overrides,
  };
}

function syntheticSearch(root = 5000): (input: EventSearchRequest) => EventSearchResult {
  const motion: NonNullable<EventSearchDependencies['motion']> = context => ({
    context,
    sample: (_body, atMs) => context.evaluate(() => ({
      longitude: wrap(30 + (atMs - BASE - root) / 1000), speedDegreesPerDay: 86_400,
    })),
  });
  return input => searchEvents(input, { motion });
}

let directory: string;
let databasePath: string;
let store: WebhookStore;
let connections: WebhookStore[];

function open(path = databasePath): WebhookStore {
  const connection = new WebhookStore(path);
  connections.push(connection);
  return connection;
}

function reopen(): void {
  store.close();
  store = open();
}

function create(id = 'sub-1', overrides: Partial<SubscriptionSpec> = {}): void {
  store.createSubscription(id, specification(overrides), BASE - 1);
}

function untouched(nextAt = BASE, revision = 1): void {
  expect(store.getCursor('sub-1')).toEqual({ subscriptionId: 'sub-1', revision, nextAt });
  expect(store.listEvents('sub-1')).toEqual([]);
  expect(store.listDeliveries()).toEqual([]);
  expect(store.getScanPolicy('sub-1')).toBeUndefined();
}

beforeEach(() => {
  mkdirSync(CACHE, { recursive: true });
  directory = mkdtempSync(join(CACHE, 'scan-worker-'));
  databasePath = join(directory, 'webhook.sqlite');
  connections = [];
  store = open();
});

afterEach(() => {
  for (const connection of connections) connection.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('bounded discovery and durable occurrence ownership', () => {
  it('owns an exact chunk boundary once and resumes from disk without rediscovery', () => {
    create();
    const search = vi.fn(syntheticSearch());
    let worker = new ScanWorker(store, policy, search);
    expect(worker.scanSubscription('sub-1', request)).toMatchObject({
      status: 'committed', inserted: 0, duplicates: 0,
      window: { start: iso(0), end: iso(5000) }, cursor: { nextAt: BASE + 5000 },
    });
    expect(store.listEvents('sub-1')).toEqual([]);
    reopen();
    worker = new ScanWorker(store, policy, search);
    expect(worker.scanSubscription('sub-1', request)).toMatchObject({
      status: 'committed', inserted: 1, duplicates: 0,
      window: { start: iso(5000), end: iso(10_000) }, cursor: { nextAt: BASE + 10_000 },
    });
    const event = store.listEvents('sub-1')[0]!;
    expect(event.occurredAt).toBe(BASE + 5000);
    expect(store.getDelivery(event.id)).toMatchObject({ eventId: event.id, idempotencyKey: event.idempotencyKey });
    expect(worker.scanSubscription('sub-1', request)).toEqual({
      status: 'idle', subscriptionId: 'sub-1', reason: 'schedule-complete',
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(store.listEvents('sub-1')).toHaveLength(1);
    expect(store.listDeliveries()).toHaveLength(1);
  });

  it('keeps off-grid event bytes through schedule, chunk, revision and destination changes', () => {
    create('sub-1', { window: { start: iso(101), end: iso(9876) } });
    const search = syntheticSearch(5123.25);
    const first = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search);
    expect(first.scanSubscription('sub-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
    const original = store.listEvents('sub-1')[0]!;
    const delivery = store.recordAttempt({ eventId: original.id, number: 1,
      startedAt: NOW, finishedAt: NOW, result: { kind: 'http', status: 204 } }, { status: 'delivered' });
    const originalPolicy = store.getScanPolicy('sub-1');
    store.updateSubscription('sub-1', 1, specification({
      window: { start: iso(4999), end: iso(6137) },
      callbackUrl: 'https://replacement.example/events', secretRef: 'replacement_key',
    }), NOW + 1);
    reopen();
    const revised = new ScanWorker(store, { ...policy, maxWindowMs: 500, maxEvaluations: 20_000 }, search);
    expect(revised.scanSubscription('sub-1', { ...request, now: NOW + 1 })).toMatchObject({
      status: 'committed', inserted: 0, duplicates: 1, cursor: { nextAt: BASE + 5499, revision: 2 },
    });
    expect(store.listEvents('sub-1')).toEqual([original]);
    expect(store.getDelivery(original.id)).toEqual(delivery);
    expect(store.getScanPolicy('sub-1')).toBe(originalPolicy);
    expect(store.listAttempts(original.id)).toHaveLength(1);
    const independentlyPartitioned = open(join(directory, 'partition.sqlite'));
    independentlyPartitioned.createSubscription('sub-1', specification({
      window: { start: iso(4999), end: iso(6137) },
    }), BASE - 1);
    new ScanWorker(independentlyPartitioned, { ...policy, maxWindowMs: 500 }, search)
      .scanSubscription('sub-1', request);
    const matching = independentlyPartitioned.listEvents('sub-1')[0]!;
    expect(matching.id).toBe(original.id);
    expect(matching.idempotencyKey).toBe(original.idempotencyKey);
    expect(matching.occurrenceKey).toBe(original.occurrenceKey);
    expect(matching.payload).toBe(original.payload);
  });

  it('queues future discovery no earlier than its event instant', () => {
    create();
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, syntheticSearch());
    expect(worker.scanSubscription('sub-1', { ...request, now: BASE })).toMatchObject({ status: 'committed', inserted: 1 });
    const event = store.listEvents('sub-1')[0]!;
    expect(store.getDelivery(event.id)).toMatchObject({ availableAt: BASE + 5000, updatedAt: BASE, status: 'pending' });
  });

  it('clips to the caller horizon and schedule end while committing complete empty slices', () => {
    create('sub-1', { filter: { kind: 'ingress', body: 'Mercury', sign: 'cancer', direction: 'any' } });
    const search = vi.fn(syntheticSearch());
    const worker = new ScanWorker(store, policy, search);
    const horizon = { ...request, through: BASE + 7500 };
    expect(worker.scanSubscription('sub-1', horizon)).toMatchObject({ status: 'committed', inserted: 0,
      window: { start: iso(0), end: iso(5000) } });
    expect(worker.scanSubscription('sub-1', horizon)).toMatchObject({ status: 'committed', inserted: 0,
      window: { start: iso(5000), end: iso(7500) } });
    expect(worker.scanSubscription('sub-1', horizon)).toMatchObject({ status: 'idle', reason: 'not-due' });
    expect(worker.scanSubscription('sub-1', { ...request, through: BASE + 50_000 })).toMatchObject({
      status: 'committed', inserted: 0, window: { start: iso(7500), end: iso(10_000) },
    });
    expect(search).toHaveBeenCalledTimes(3);
    expect(store.listEvents('sub-1')).toEqual([]);
    expect(store.listDeliveries()).toEqual([]);
  });

  it('retains an existing occurrence and refuses changed receipt bytes on rescan', () => {
    create();
    const search = syntheticSearch();
    const fullPolicy = { ...policy, maxWindowMs: 10_000 };
    new ScanWorker(store, fullPolicy, search).scanSubscription('sub-1', request);
    const original = store.listEvents('sub-1')[0]!;
    const delivery = store.getDelivery(original.id);
    store.updateSubscription('sub-1', 1, specification(), NOW + 1);
    const changed = new ScanWorker(store, fullPolicy, input => {
      const result = structuredClone(search(input));
      if (result.status !== 'complete') throw new Error('Expected completed synthetic search.');
      const event = result.events[0]!;
      const position = event.positions[0]!;
      return { ...result, events: [{ ...event, positions: [{ ...position,
        receipt: { ...position.receipt, syntheticRevision: 1 } }] }] };
    });
    expect(changed.scanSubscription('sub-1', { ...request, now: NOW + 1 })).toMatchObject({ status: 'conflict' });
    expect(store.getCursor('sub-1')).toMatchObject({ revision: 2, nextAt: BASE });
    expect(store.listEvents('sub-1')).toEqual([original]);
    expect(store.getDelivery(original.id)).toEqual(delivery);
  });
});

describe('refusal and failure atomicity', () => {
  it('does not advance when the budget is exhausted after discovery during receipt capture', () => {
    create();
    const search = syntheticSearch();
    const full = search({ filter: specification().filter, window: specification().window,
      stepMs: policy.stepMs, maxEvaluations: policy.maxEvaluations });
    expect(full.status).toBe('complete');
    expect(full.events).toHaveLength(1);
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000, maxEvaluations: full.evaluations - 1 }, search);
    expect(worker.scanSubscription('sub-1', request)).toMatchObject({
      status: 'refused', reason: 'evaluation-budget', evaluations: full.evaluations - 1,
    });
    untouched();
    expect(new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search)
      .scanSubscription('sub-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
  });

  it('rejects unsupported custom subscriptions before creating a cursor', () => {
    expect(() => create('sub-1', { filter: { kind: 'custom', expression: 'synthetic event expression' } }))
      .toThrow('Invalid subscription field: filter.expression.');
    expect(store.getSubscription('sub-1')).toBeUndefined();
    expect(store.getCursor('sub-1')).toBeUndefined();
    expect(store.listDeliveries()).toEqual([]);
  });

  it('discards completed calculations if cancelled before commit', () => {
    create();
    const controller = new AbortController();
    const search = vi.fn((input: EventSearchRequest) => {
      const result = syntheticSearch()(input);
      controller.abort();
      return result;
    });
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search);
    expect(worker.scanSubscription('sub-1', { ...request, signal: controller.signal })).toMatchObject({
      status: 'refused', reason: 'cancelled',
    });
    untouched();
    expect(worker.scanSubscription('sub-1', { ...request, signal: controller.signal })).toMatchObject({
      status: 'refused', reason: 'cancelled', evaluations: 0,
    });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('keeps computation failures redacted and leaves the complete scan uncommitted', () => {
    create();
    const worker = new ScanWorker(store, policy, () => { throw new Error('private provider diagnostics'); });
    expect(() => worker.scanSubscription('sub-1', request)).toThrow(new ScanWorkerError('search-failed'));
    untouched();
  });

  it.each(['event-limit', 'payload-limit'] as const)('refuses %s before persisting any result', reason => {
    create();
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, input => {
      const result = syntheticSearch()(input);
      if (result.status !== 'complete') throw new Error('Expected completed synthetic search.');
      const event = result.events[0]!;
      return { ...result, events: reason === 'event-limit'
        ? Array.from({ length: STORAGE_LIMITS.eventsPerScan + 1 }, () => event)
        : [{ ...event, positions: [{ ...event.positions[0]!,
          diagnostic: 'x'.repeat(STORAGE_LIMITS.payloadBytes) }] }] };
    });
    expect(worker.scanSubscription('sub-1', request)).toMatchObject({ status: 'refused', reason });
    untouched();
  });

  it.each(['wrong-window', 'outside-owned-window', 'excess-evaluations', 'partial-refusal'] as const)(
    'rejects a malformed search result: %s', fault => {
      create();
      const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, input => {
        const result = syntheticSearch()(input);
        if (result.status !== 'complete') throw new Error('Expected completed synthetic search.');
        switch (fault) {
          case 'wrong-window': return { ...result, search: { ...result.search, window: { start: iso(1), end: iso(10_000) } } };
          case 'outside-owned-window': return { ...result, events: [{ ...result.events[0]!, atMs: BASE + 10_000 }] };
          case 'excess-evaluations': return { ...result, evaluations: input.maxEvaluations + 1 };
          case 'partial-refusal': return { ...result, status: 'refused', reason: 'evaluation-budget' } as unknown as EventSearchResult;
        }
      });
      expect(() => worker.scanSubscription('sub-1', request)).toThrow(new ScanWorkerError('invalid-search-result'));
      untouched();
    },
  );
});

describe('concurrent discovery and bounded pages', () => {
  it.each(['disable', 'update', 'delete'] as const)('rejects a stale search after concurrent %s', mutation => {
    create();
    const second = open();
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, input => {
      const result = syntheticSearch()(input);
      if (mutation === 'delete') second.deleteSubscription('sub-1', 1, NOW);
      else second.updateSubscription('sub-1', 1, specification(mutation === 'disable'
        ? { enabled: false } : { callbackUrl: 'https://updated.example/events' }), NOW);
      return result;
    });
    expect(worker.scanSubscription('sub-1', request)).toMatchObject({ status: 'conflict' });
    expect(store.getCursor('sub-1')!.nextAt).toBe(BASE);
    expect(store.listEvents('sub-1')).toEqual([]);
    expect(store.listDeliveries()).toEqual([]);
    expect(store.getScanPolicy('sub-1')).toBeUndefined();
  });

  it('loses a competing scan without adding duplicate events or deliveries', () => {
    create();
    const second = open();
    const fullPolicy = { ...policy, maxWindowMs: 10_000 };
    const winning = new ScanWorker(second, fullPolicy, syntheticSearch());
    const worker = new ScanWorker(store, fullPolicy, input => {
      const result = syntheticSearch()(input);
      expect(winning.scanSubscription('sub-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
      return result;
    });
    expect(worker.scanSubscription('sub-1', request)).toMatchObject({ status: 'conflict' });
    expect(store.getCursor('sub-1')!.nextAt).toBe(BASE + 10_000);
    expect(store.listEvents('sub-1')).toHaveLength(1);
    expect(store.listDeliveries()).toHaveLength(1);
  });

  it('advances pagination past refused subscriptions and limits every subscription to one slice', () => {
    create('sub-a', { filter: { kind: 'station', body: 'Mercury', direction: 'any' } });
    create('sub-b');
    create('sub-c', { enabled: false });
    const worker = new ScanWorker(store, policy, input => input.filter.kind === 'station'
      ? searchEvents(input, {
        motion: context => ({ context, sample: () => {
          while (true) context.evaluate(() => 0);
        } })
      }) : syntheticSearch()(input));
    const first = worker.scanPage({ ...request, limit: 2 });
    expect(first).toMatchObject({ lastId: 'sub-b', exhausted: false,
      results: [{ subscriptionId: 'sub-a', status: 'refused', reason: 'evaluation-budget' },
        { subscriptionId: 'sub-b', status: 'committed', inserted: 0 }] });
    expect(store.getCursor('sub-a')!.nextAt).toBe(BASE);
    expect(store.getCursor('sub-b')!.nextAt).toBe(BASE + 5000);
    expect(worker.scanPage({ ...request, limit: 2, afterId: first.lastId! })).toEqual({
      results: [{ subscriptionId: 'sub-c', status: 'idle', reason: 'disabled' }], lastId: 'sub-c', exhausted: true,
    });
    expect(worker.scanPage({ ...request, limit: 2 }).results[1]).toMatchObject({ status: 'committed', inserted: 1 });
  });

  it('continues a page when an earlier search updates a later subscription after the captured now', () => {
    for (const id of ['sub-a', 'sub-b', 'sub-c']) create(id);
    const second = open();
    let searches = 0;
    const worker = new ScanWorker(store, policy, input => {
      searches++;
      if (searches === 1) second.updateSubscription('sub-b', 1, specification(), NOW + 1);
      return syntheticSearch()(input);
    });
    const page = worker.scanPage({ ...request, limit: 3 });
    expect(page.results.map(result => result.status)).toEqual(['committed', 'conflict', 'committed']);
    expect(searches).toBe(2);
    expect(store.getCursor('sub-b')).toMatchObject({ revision: 2, nextAt: BASE });
    expect(store.getCursor('sub-c')!.nextAt).toBe(BASE + 5000);
  });

  it('pins numerical policy across reopen and rejects changed sampling before calculation', () => {
    create();
    new ScanWorker(store, policy, syntheticSearch()).scanSubscription('sub-1', request);
    const pin = store.getScanPolicy('sub-1');
    reopen();
    const search = vi.fn(syntheticSearch());
    const changed = new ScanWorker(store, { ...policy, stepMs: 500 }, search);
    expect(changed.scanSubscription('sub-1', request)).toMatchObject({
      status: 'refused', reason: 'policy-conflict', evaluations: 0,
    });
    expect(search).not.toHaveBeenCalled();
    expect(store.getCursor('sub-1')!.nextAt).toBe(BASE + 5000);
    expect(store.getScanPolicy('sub-1')).toBe(pin);
    expect(new ScanWorker(store, { ...policy, maxWindowMs: 10_000, maxEvaluations: 20_000 }, search)
      .scanSubscription('sub-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
    expect(store.getScanPolicy('sub-1')).toBe(pin);
  });
});

describe('worker option boundaries and local engine integration', () => {
  it.each([0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid bounds %s', value => {
    for (const key of ['maxWindowMs', 'stepMs', 'maxEvaluations'] as const) {
      expect(() => new ScanWorker(store, { ...policy, [key]: value })).toThrow(new ScanWorkerError('invalid-options'));
    }
  });

  it('rejects invalid request times and pagination bounds before searching', () => {
    create();
    const search = vi.fn(syntheticSearch());
    const worker = new ScanWorker(store, policy, search);
    for (const value of [NaN, Infinity, BASE + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => worker.scanSubscription('sub-1', { ...request, now: value })).toThrow(new ScanWorkerError('invalid-options'));
      expect(() => worker.scanSubscription('sub-1', { ...request, through: value })).toThrow(new ScanWorkerError('invalid-options'));
    }
    for (const limit of [0, -1, 1.5, STORAGE_LIMITS.maxPageSize + 1]) {
      expect(() => worker.scanPage({ ...request, limit })).toThrow(new ScanWorkerError('invalid-options'));
    }
    expect(search).not.toHaveBeenCalled();
    untouched();
  });

  it('does not calculate for missing, disabled, deleted, or not-yet-due subscriptions', () => {
    create('disabled', { enabled: false });
    create('deleted');
    store.deleteSubscription('deleted', 1, BASE);
    create('future', { window: { start: iso(10_000), end: iso(20_000) } });
    const search = vi.fn(syntheticSearch());
    const worker = new ScanWorker(store, policy, search);
    for (const [id, reason] of [['missing', 'not-found'], ['disabled', 'disabled'],
      ['deleted', 'deleted'], ['future', 'not-due']] as const) {
      expect(worker.scanSubscription(id, request)).toEqual({ status: 'idle', subscriptionId: id, reason });
    }
    expect(search).not.toHaveBeenCalled();
  });

  it('persists real relative-source engine receipts unchanged across reopening', () => {
    const window = { start: '2000-01-01T00:00:00.000Z', end: '2000-02-01T00:00:00.000Z' };
    const start = Date.parse(window.start), end = Date.parse(window.end);
    store.createSubscription('real-engine', specification({ window,
      filter: { kind: 'ingress', body: 'Sun', sign: 'aquarius', direction: 'any' },
    }), start);
    const worker = new ScanWorker(store, { maxWindowMs: end - start, stepMs: 21_600_000, maxEvaluations: 20_000 });
    expect(worker.scanSubscription('real-engine', { now: start, through: end })).toMatchObject({ status: 'committed', inserted: 1 });
    const stored = store.listEvents('real-engine')[0]!;
    const payload = JSON.parse(stored.payload);
    const calculated = calc({ body: 'Sun', time: payload.event.at,
      center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical',
      flags: { correction: 'apparent', units: 'degrees', speeds: false, cartesian: false },
    });
    expect(payload.event.positions).toEqual([calculated]);
    expect(payload.event.positions[0].receipt.schema).toBe('zodiacs.calc-receipt.v1');
    expect(payload.event.positions[0].receipt.instants[0].timeScale.input).toBe('utc');
    expect(store.getDelivery(stored.id)!.availableAt).toBe(stored.occurredAt);
    reopen();
    expect(store.getEvent(stored.id)).toEqual(stored);
    expect(store.getCursor('real-engine')!.nextAt).toBe(end);
  });

  it.each([
    ['1700-01-01T00:00:00.000Z', '1700-01-01T00:00:10.000Z', 'engine-refused'],
    ['2016-12-31T23:59:59.000Z', '2017-01-01T00:00:01.000Z', 'time-discontinuity'],
  ] as const)('does not skip a real engine refusal at %s', (start, end, reason) => {
    const window = { start, end }, from = Date.parse(start);
    store.createSubscription('sub-1', specification({ window }), from);
    const worker = new ScanWorker(store, policy);
    expect(worker.scanSubscription('sub-1', { now: from, through: Date.parse(end) })).toMatchObject({ status: 'refused', reason });
    untouched(from);
  });
});
