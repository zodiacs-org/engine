import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchEvents } from '../src/event-search.js';
import type { EventSearchDependencies, EventSearchRequest, EventSearchResult } from '../src/event-search-types.js';
import { ScanWorker, ScanWorkerError } from '../src/scan-worker.js';
import type { ScanPolicy } from '../src/scan-types.js';
import { openDatabase } from '../src/storage-db.js';
import { WebhookStore } from '../src/storage.js';
import type { SubscriptionSpec } from '../src/types.js';

// Synthetic schedules and motion test persistence and identity, not sky accuracy.
const BASE = Date.parse('2000-01-01T00:00:00.000Z');
const NOW = BASE + 20_000;
const CACHE = fileURLToPath(new URL('../.cache/', import.meta.url));
const iso = (offset: number): string => new Date(BASE + offset).toISOString();
const wrap = (value: number): number => ((value % 360) + 360) % 360;
const policy: ScanPolicy = { maxWindowMs: 5000, stepMs: 1000, maxEvaluations: 10_000 };
const request = { now: NOW, through: BASE + 10_000 };

function specification(overrides: Partial<SubscriptionSpec> = {}): SubscriptionSpec {
  return {
    callbackUrl: 'https://callbacks.example/events', secretRef: 'runtime_key_ref', enabled: true,
    filter: { kind: 'custom', expression: 'all Mercury ingresses into Taurus from 2000-01-01 to 2000-01-02' },
    window: { start: iso(0), end: iso(10_000) }, ...overrides,
  };
}
function syntheticSearch(root = 5000): (input: EventSearchRequest) => EventSearchResult {
  const motion: NonNullable<EventSearchDependencies['motion']> = context => ({
    context, sample: (_body, atMs) => context.evaluate(() => ({
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
function reopen(): void { store.close(); store = open(); }
function untouched(start = BASE): void {
  expect(store.getCursor('custom-1')).toEqual({ subscriptionId: 'custom-1', revision: 1, nextAt: start });
  expect(store.getScanPolicy('custom-1')).toBeUndefined();
  expect(store.listEvents('custom-1')).toEqual([]);
  expect(store.listDeliveries()).toEqual([]);
}
beforeEach(() => {
  mkdirSync(CACHE, { recursive: true });
  directory = mkdtempSync(join(CACHE, 'custom-worker-'));
  databasePath = join(directory, 'webhook.sqlite');
  connections = [];
  store = open();
});
afterEach(() => {
  for (const connection of connections) connection.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('custom subscription scan durability', () => {
  it('owns a boundary event in the second slice after a database restart', () => {
    store.createSubscription('custom-1', specification(), BASE - 1);
    const search = vi.fn(syntheticSearch());
    expect(new ScanWorker(store, policy, search).scanSubscription('custom-1', request)).toMatchObject({
      status: 'committed', inserted: 0, duplicates: 0, cursor: { nextAt: BASE + 5000 },
    });
    const pinned = store.getScanPolicy('custom-1');
    reopen();
    const worker = new ScanWorker(store, policy, search);
    expect(worker.scanSubscription('custom-1', request)).toMatchObject({
      status: 'committed', inserted: 1, duplicates: 0, cursor: { nextAt: BASE + 10_000 },
    });
    expect(store.getScanPolicy('custom-1')).toBe(pinned);
    const event = store.listEvents('custom-1')[0]!;
    expect(event.occurredAt).toBe(BASE + 5000);
    expect(JSON.parse(event.payload)).toMatchObject({ event: {
      kind: 'custom', definition: { kind: 'sign-ingress', body: 'Mercury', toSign: 'Taurus' },
      positions: [{ receipt: { schema: 'zodiacs.calc-receipt.v1' } }],
    } });
    expect(store.getDelivery(event.id)).toMatchObject({ idempotencyKey: event.idempotencyKey, status: 'pending' });
    expect(worker.scanSubscription('custom-1', request)).toMatchObject({ status: 'idle', reason: 'schedule-complete' });
    expect(search).toHaveBeenCalledTimes(2);
    expect(store.listEvents('custom-1')).toHaveLength(1);
    expect(store.listDeliveries()).toHaveLength(1);
  });

  it('preserves payloads and acknowledged deliveries across overlap, rescan, restart and expression spelling', () => {
    store.createSubscription('custom-1', specification({ window: { start: iso(101), end: iso(9876) } }), BASE - 1);
    const search = syntheticSearch(5123.25);
    expect(new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search)
      .scanSubscription('custom-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
    const original = store.listEvents('custom-1')[0]!;
    const delivery = store.recordAttempt({ eventId: original.id, number: 1,
      startedAt: NOW, finishedAt: NOW, result: { kind: 'http', status: 204 } }, { status: 'delivered' });
    const pinned = store.getScanPolicy('custom-1');
    store.updateSubscription('custom-1', 1, specification({
      filter: { kind: 'custom', expression: 'ALL MERCURY INGRESSES INTO TAURUS FROM 2000-01-01 TO 2000-01-02 CLOCK UTC' },
      window: { start: iso(4999), end: iso(6137) },
      callbackUrl: 'https://replacement.example/events', secretRef: 'replacement_key_ref',
    }), NOW + 1);
    reopen();
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 500, maxEvaluations: 20_000 }, search);
    expect(worker.scanSubscription('custom-1', { ...request, now: NOW + 1 })).toMatchObject({
      status: 'committed', inserted: 0, duplicates: 1, cursor: { revision: 2, nextAt: BASE + 5499 },
    });
    expect(store.listEvents('custom-1')).toEqual([original]);
    expect(store.getDelivery(original.id)).toEqual(delivery);
    expect(store.listAttempts(original.id)).toHaveLength(1);
    expect(store.getScanPolicy('custom-1')).toBe(pinned);
    const independent = open(join(directory, 'partition.sqlite'));
    independent.createSubscription('custom-1', specification({ window: { start: iso(4999), end: iso(6137) } }), BASE - 1);
    new ScanWorker(independent, { ...policy, maxWindowMs: 500 }, search).scanSubscription('custom-1', request);
    const matching = independent.listEvents('custom-1')[0]!;
    expect(matching.id).toBe(original.id);
    expect(matching.occurrenceKey).toBe(original.occurrenceKey);
    expect(matching.idempotencyKey).toBe(original.idempotencyKey);
    expect(matching.payload).toBe(original.payload);
  });

  it('advances disjoint schedule slices without invoking any calculation provider', () => {
    store.createSubscription('custom-1', specification({ window: { start: iso(-10_000), end: iso(0) } }), BASE - 20_000);
    const motion = vi.fn<NonNullable<EventSearchDependencies['motion']>>(() => { throw new Error('Unexpected calculation.'); });
    const search = (input: EventSearchRequest) => searchEvents(input, { motion });
    const worker = new ScanWorker(store, policy, search);
    expect(worker.scanSubscription('custom-1', request)).toMatchObject({
      status: 'committed', evaluations: 0, inserted: 0, cursor: { nextAt: BASE - 5000 },
    });
    expect(worker.scanSubscription('custom-1', request)).toMatchObject({
      status: 'committed', evaluations: 0, inserted: 0, cursor: { nextAt: BASE },
    });
    expect(worker.scanSubscription('custom-1', request)).toMatchObject({ status: 'idle', reason: 'schedule-complete' });
    expect(motion).not.toHaveBeenCalled();
    expect(store.listEvents('custom-1')).toEqual([]);
    expect(store.listDeliveries()).toEqual([]);
  });

  it('forwards custom eclipse model settings and stores both body receipts', () => {
    store.createSubscription('custom-1', specification({ filter: {
      kind: 'custom', expression: 'all solar eclipses from 2000-01-01 to 2000-01-02',
    } }), BASE - 1);
    const eclipse = { model: { sunRadiusAu: 0.1, moonRadiusAu: 0.005, earthRadiusAu: 0.02 }, derivativeStepMs: 100 };
    const provider: NonNullable<EventSearchDependencies['eclipse']> = context => ({
      sample: atMs => context.evaluate(() => ({
        sun: [100, 0, 0] as const, moon: [1, (atMs - BASE - 5000) / 1_000_000, 0] as const,
      })),
    });
    const search = vi.fn((input: EventSearchRequest) => searchEvents(input, { eclipse: provider }));
    expect(new ScanWorker(store, { ...policy, maxWindowMs: 10_000, eclipse }, search)
      .scanSubscription('custom-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
    expect(search.mock.calls[0]![0].eclipse).toEqual(eclipse);
    const payload = JSON.parse(store.listEvents('custom-1')[0]!.payload);
    expect(payload.event).toMatchObject({ kind: 'custom', definition: { kind: 'solar', model: eclipse.model } });
    expect(payload.event.positions.map((position: { body: string }) => position.body)).toEqual(['Sun', 'Moon']);
  });
});

describe('custom worker refusal atomicity and legacy drafts', () => {
  it('keeps the cursor and outbox untouched after late receipt budget exhaustion, then retries', () => {
    const spec = specification();
    store.createSubscription('custom-1', spec, BASE - 1);
    const search = syntheticSearch();
    const full = search({ filter: spec.filter, window: spec.window, stepMs: 1000, maxEvaluations: 10_000 });
    expect(full.status).toBe('complete');
    expect(full.events).toHaveLength(1);
    const short = new ScanWorker(store, { ...policy, maxWindowMs: 10_000, maxEvaluations: full.evaluations - 1 }, search);
    expect(short.scanSubscription('custom-1', request)).toMatchObject({
      status: 'refused', reason: 'evaluation-budget', evaluations: full.evaluations - 1,
    });
    untouched();
    reopen();
    expect(new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search)
      .scanSubscription('custom-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
  });

  it('pins custom execution separately from builtin scans', () => {
    store.createSubscription('custom-1', specification(), BASE - 1);
    const search = vi.fn(syntheticSearch());
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search);
    expect(worker.scanSubscription('custom-1', request)).toMatchObject({ status: 'committed', inserted: 1 });
    const events = store.listEvents('custom-1');
    store.updateSubscription('custom-1', 1, specification({
      filter: { kind: 'ingress', body: 'Mercury', sign: 'taurus', direction: 'any' },
    }), NOW + 1);
    expect(worker.scanSubscription('custom-1', { ...request, now: NOW + 1 }))
      .toMatchObject({ status: 'refused', reason: 'policy-conflict', evaluations: 0 });
    expect(search).toHaveBeenCalledTimes(1);
    expect(store.getCursor('custom-1')).toMatchObject({ revision: 2, nextAt: BASE });
    expect(store.listEvents('custom-1')).toEqual(events);
  });

  it('rejects a trusted seam result whose point definition does not satisfy the expression', () => {
    store.createSubscription('custom-1', specification(), BASE - 1);
    const search = (input: EventSearchRequest): EventSearchResult => {
      const result = syntheticSearch()(input);
      if (result.status !== 'complete') return result;
      return { ...result, events: result.events.map(event => ({ ...event,
        definition: { ...event.definition, body: 'Venus' } as typeof event.definition,
      })) };
    };
    expect(() => new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search)
      .scanSubscription('custom-1', request)).toThrowError(new ScanWorkerError('invalid-search-result'));
    untouched();
  });

  it('keeps earlier unvalidated DSL drafts inspectable, refused and editable without stopping later subscriptions', () => {
    const draft = specification({ filter: { kind: 'custom', expression: 'synthetic legacy expression' } });
    store.createSubscription('custom-0', specification(), BASE - 1);
    store.createSubscription('custom-1', specification(), BASE - 1);
    store.createSubscription('custom-2', specification(), BASE - 1);
    store.close();
    const database = openDatabase(databasePath);
    try {
      database.prepare('UPDATE subscriptions SET spec_json = ? WHERE id = ?').run(JSON.stringify(draft), 'custom-0');
      database.prepare('UPDATE subscriptions SET spec_json = ? WHERE id = ?').run(JSON.stringify(draft), 'custom-1');
    } finally { database.close(); }
    store = open();
    expect(store.deleteSubscription('custom-0', 1, NOW)).toMatchObject({ deletedAt: NOW, spec: draft });
    expect(store.getSubscription('custom-1')?.spec).toEqual(draft);
    expect(store.listSubscriptions({ limit: 10 }).map(item => item.id)).toEqual(['custom-1', 'custom-2']);
    const search = vi.fn(syntheticSearch());
    const worker = new ScanWorker(store, { ...policy, maxWindowMs: 10_000 }, search);
    expect(worker.scanSubscription('custom-0', request)).toMatchObject({ status: 'idle', reason: 'deleted' });
    const page = worker.scanPage({ ...request, limit: 10 });
    expect(page.results).toMatchObject([
      { status: 'refused', subscriptionId: 'custom-1', reason: 'unsupported-filter', evaluations: 0 },
      { status: 'committed', subscriptionId: 'custom-2', inserted: 1 },
    ]);
    expect(page).toMatchObject({ lastId: 'custom-2', exhausted: true });
    expect(search).toHaveBeenCalledTimes(1);
    expect(store.getCursor('custom-1')).toMatchObject({ revision: 1, nextAt: BASE });
    expect(store.getScanPolicy('custom-1')).toBeUndefined();
    expect(store.listEvents('custom-1')).toEqual([]);
    expect(() => store.createSubscription('new-invalid', draft, NOW)).toThrow();
    expect(() => store.updateSubscription('custom-1', 1, draft, NOW)).toThrow();
    store.updateSubscription('custom-1', 1, specification(), NOW + 1);
    expect(worker.scanSubscription('custom-1', { ...request, now: NOW + 1 }))
      .toMatchObject({ status: 'committed', inserted: 1 });
    store.deleteSubscription('custom-1', 2, NOW + 2);
    expect(worker.scanSubscription('custom-1', { ...request, now: NOW + 2 }))
      .toMatchObject({ status: 'idle', reason: 'deleted' });
  });
});
