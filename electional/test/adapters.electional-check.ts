import { describe, expect, it } from 'vitest';
import fixture from './fixtures/adapter-ownership.json';
import {
  AdapterRefused, EngineAdapter, EventsAdapter, WorkContext, clockWindow,
  loadEngineRuntime, loadEventsCapability,
} from '../src/index.js';
import type {
  Clock, ClockWindow, EngineReceipt, EngineRuntime, EventOperation, EventRecord,
  EventsCapability, EventsRuntime, WorkOptions,
} from '../src/index.js';

const window: ClockWindow = { startMs: 0, endMs: 10, clock: 'tt' };
const options = { maxEvaluations: 20, stepMs: 5 };
const receipt: EngineReceipt = {
  schema: 'contract-stub', request: {}, instants: [{ utc: 'a separate native clock label' }],
  conventions: ['synthetic-contract-only'],
  engine: { name: 'contract-stub', version: '0.0.0', ephemeris: { name: 'contract-stub', version: '0.0.0' } },
};
function engineStub(onCall?: (request: Parameters<EngineRuntime['calc']>[0]) => void): EngineRuntime {
  return { calc(request) {
    onCall?.(request);
    return { status: 'ok', lon: 32, lat: 1, speeds: request.flags.speeds ? { lon: 2 } : null,
      bounds: { test: 'not an accuracy bound' }, receipt: { ...receipt, request: request.time instanceof Date
        ? { iso: request.time.toISOString() } : request.time } };
  } };
}
// This context and the canned scanner below test API control flow. They find no roots.
class ContractContext {
  evaluations = 0;
  constructor(readonly window: ClockWindow, readonly options: WorkOptions) {}
  checkpoint(): void { if (this.options.signal?.aborted) throw new AdapterRefused('cancelled'); }
  evaluate<T>(run: () => T): T {
    this.checkpoint();
    if (this.evaluations >= this.options.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    this.evaluations++;
    const value = run();
    this.checkpoint();
    return value;
  }
}
type CannedResult = ReturnType<EventsRuntime['searchSignIngresses']>;
function capability(events: readonly EventRecord[], extra: Partial<CannedResult> = {}, samples = 1,
  inspect?: (args: readonly unknown[]) => void): EventsCapability {
  const scan = (context: InstanceType<EventsRuntime['EvaluationContext']>, args: readonly unknown[],
    provider: Parameters<EventsRuntime['searchSignIngresses']>[3]): CannedResult => {
    inspect?.(args);
    for (let i = 0; i < samples; i++) provider.sample('Moon', 0);
    return { status: 'complete', events, evaluations: context.evaluations, ...extra };
  };
  return { status: 'available', source: { moduleUrl: 'contract-stub', sha256: 'contract-stub' }, runtime: {
    EvaluationContext: ContractContext,
    searchSignIngresses: (ctx, ...args) => scan(ctx, args, args[2]),
    searchStations: (ctx, ...args) => scan(ctx, args, args[2]),
    searchRetrogradeIntervals: (ctx, ...args) => scan(ctx, args, args[2]),
    searchExactAspects: (ctx, ...args) => scan(ctx, args, args[4]),
    searchVoidOfCourseMoon: (ctx, ...args) => scan(ctx, args, args[2]),
  } };
}
const points = fixture.sourcePoints.map(atMs => ({ kind: 'sign-ingress', clock: 'tt' as const,
  atMs, bracket: [atMs, atMs], fromSign: 'Aries', toSign: 'Taurus' }));

describe('explicit clocks, bounds and request accounting', () => {
  it.each<Clock>(['utc', 'ut1', 'tt'])('passes %s coordinates without relabelling', clock => {
    const calls: Parameters<EngineRuntime['calc']>[0][] = [];
    const context = new WorkContext({ ...window, clock }, { maxEvaluations: 2 });
    const adapter = new EngineAdapter(context, engineStub(request => calls.push(request)));
    const result = adapter.position('Moon', 0, true);
    expect(calls[0]?.time).toEqual(clock === 'utc' ? new Date(0) : { jd: 2_440_587.5, scale: clock });
    expect(calls[0]?.flags).toEqual({ correction: 'apparent', units: 'degrees', speeds: true });
    expect(result.clock).toBe(clock);
    expect(result.instant).toEqual(receipt.instants[0]);
    expect(context.evaluations).toBe(1);
    expect(context.receipts).toEqual([result.receipt]);
    expect(Object.isFrozen(result.receipt.instants)).toBe(true);
    expect(Object.isFrozen(receipt)).toBe(false);
  });
  it('validates windows, budgets, bodies and samples before charging', () => {
    for (const bad of [null, { ...window, clock: 'TAI' }, { ...window, startMs: 10 },
      { ...window, endMs: 0.5 }, { ...window, extra: true }]) {
      expect(() => clockWindow(bad as ClockWindow)).toThrow();
    }
    for (const maxEvaluations of [0, NaN, Infinity, 1.5]) {
      expect(() => new WorkContext(window, { maxEvaluations })).toThrow();
    }
    expect(() => new WorkContext(window, { maxEvaluations: 1, signal: {} as AbortSignal })).toThrow();
    const context = new WorkContext(window, { maxEvaluations: 1 });
    const adapter = new EngineAdapter(context, engineStub());
    expect(() => adapter.position('Earth' as 'Moon', 0)).toThrow();
    expect(() => adapter.position('Moon', -1)).toThrow();
    expect(() => adapter.position('Moon', 11)).toThrow();
    expect(() => adapter.position('Moon', NaN)).toThrow();
    expect(context.evaluations).toBe(0);
    adapter.position('Moon', 10); // Inclusive sampling endpoint, independent of event ownership.
    expect(() => adapter.position('Moon', 0)).toThrowError(AdapterRefused);
    expect(context.evaluations).toBe(1);
  });
  it('charges and preserves a native refusal, with no invented receipt', () => {
    const context = new WorkContext(window, { maxEvaluations: 1 });
    const refusal = { status: 'refused' as const, reason: 'out-of-range', detail: 'native coverage', span: { from: 'a', to: 'b' } };
    const adapter = new EngineAdapter(context, { calc: () => refusal });
    try { adapter.position('Moon', 0); throw new Error('Expected refusal'); }
    catch (error) {
      expect(error).toBeInstanceOf(AdapterRefused);
      expect((error as AdapterRefused).detail).toEqual(refusal);
    }
    expect(context.evaluations).toBe(1);
    expect(context.receipts).toEqual([]);
  });
  it('discards the value when cancellation happens inside an indivisible call', () => {
    const controller = new AbortController();
    const context = new WorkContext(window, { maxEvaluations: 1, signal: controller.signal });
    const adapter = new EngineAdapter(context, engineStub(() => controller.abort()));
    expect(() => adapter.position('Moon', 0)).toThrowError('cancelled');
    expect(context.evaluations).toBe(1);
    expect(context.receipts).toHaveLength(1); // Audit of work performed, no usable position result.
  });
});

describe('events handoff against hand-derived set fixtures', () => {
  it('keeps left-boundary events, drops right-boundary events and never moves an instant', () => {
    const adapter = new EventsAdapter(capability(points), engineStub());
    const result = adapter.search({ kind: 'ingress', body: 'Moon' }, window, options);
    expect(result.status).toBe('complete');
    expect(result.sourceWindow).toEqual(fixture.sourceWindow);
    expect(result.events.map(x => x.atMs)).toEqual(fixture.ownedPoints);
    expect(result.events.map(x => x.bracket)).toEqual([[0, 0], [5, 5]]);
    expect(result.evaluations).toBe(1);
    expect(result.receipts).toHaveLength(1);
    expect(Object.isFrozen(result.events)).toBe(true);
    expect(Object.isFrozen(points)).toBe(false);
  });
  it('clips durations without shifting them and preserves unresolved tails', () => {
    const event: EventRecord = { kind: 'void-of-course', clock: 'tt', ...fixture.sourceInterval,
      clippedStart: false, lastContact: null, sign: 'Aries' };
    const adapter = new EventsAdapter(capability([event], { unresolved: [fixture.unresolved] }), engineStub());
    const result = adapter.search({ kind: 'void-of-course', bodies: ['Sun'], aspects: ['conjunction'] }, window, options);
    expect(result.status).toBe('unresolved');
    if (result.status !== 'unresolved') return;
    expect(result.events[0]).toMatchObject(fixture.clippedInterval);
    expect(result.events[0]?.sourceInterval).toEqual(fixture.sourceInterval);
    expect(result.events[0]?.clippedStart).toBe(true);
    expect(event.clippedStart).toBe(false);
    expect(result.unresolved).toEqual([fixture.unresolved]);
    expect(result.covered).toEqual(fixture.covered);
  });
  it('distinguishes empty known coverage, unknown coverage and missing capability', () => {
    const empty = new EventsAdapter(capability([]), engineStub()).search({ kind: 'ingress', body: 'Moon' }, window, options);
    expect(empty).toMatchObject({ status: 'complete', events: [], covered: [{ startMs: 0, endMs: 10 }] });
    const unknown = new EventsAdapter(capability([], { unresolved: [{ startMs: -1, endMs: 10, reason: 'next-ingress-outside-window' }] }), engineStub())
      .search({ kind: 'void-of-course', bodies: ['Sun'], aspects: ['trine'] }, window, options);
    expect(unknown).toMatchObject({ status: 'unresolved', events: [], covered: [], unresolved: [{ startMs: 0, endMs: 10 }] });
    const missing = new EventsAdapter({ status: 'missing' }, engineStub()).search({ kind: 'ingress', body: 'Moon' }, window, options);
    expect(missing).toMatchObject({ status: 'refused', reason: 'missing-capability', events: [], covered: [], evaluations: 0 });
  });
  it('discards partial events on shared budget exhaustion and cancellation', () => {
    const adapter = new EventsAdapter(capability(points, {}, 2), engineStub());
    expect(adapter.search({ kind: 'ingress', body: 'Moon' }, window, { ...options, maxEvaluations: 1 }))
      .toMatchObject({ status: 'refused', reason: 'evaluation-budget', events: [], covered: [], evaluations: 1 });
    const controller = new AbortController();
    controller.abort();
    expect(adapter.search({ kind: 'ingress', body: 'Moon' }, window, { ...options, signal: controller.signal }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 0 });
    const during = new AbortController();
    expect(new EventsAdapter(capability(points), engineStub(() => during.abort()))
      .search({ kind: 'ingress', body: 'Moon' }, window, { ...options, signal: during.signal }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', events: [], evaluations: 1 });
  });
  it('retains an engine refusal rather than completing an empty search', () => {
    const refusal = { status: 'refused' as const, reason: 'out-of-range', detail: 'native coverage' };
    expect(new EventsAdapter(capability(points), { calc: () => refusal })
      .search({ kind: 'ingress', body: 'Moon' }, window, options))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', detail: refusal, events: [], evaluations: 1 });
  });
  it.each<EventOperation>([
    { kind: 'ingress', body: 'Moon' }, { kind: 'station', body: 'Mercury' }, { kind: 'retrograde', body: 'Venus' },
    { kind: 'aspect', body: 'Moon', target: { kind: 'moving', body: 'Sun' }, aspects: ['sextile', 'trine'] },
    { kind: 'aspect', body: 'Moon', target: { kind: 'fixed', longitude: 20 }, aspects: ['conjunction'] },
    { kind: 'void-of-course', bodies: ['Sun', 'Venus'], aspects: ['square'] },
  ])('delegates $kind with the chosen policy', operation => {
    let args: readonly unknown[] = [];
    const adapter = new EventsAdapter(capability([], { unresolved: [] }, 1, values => { args = values; }), engineStub());
    expect(adapter.search(operation, window, options).status).toBe('complete');
    expect(args).toContainEqual({ stepMs: 5 });
    if (operation.kind === 'aspect') {
      expect(args[0]).toBe(operation.body);
      expect(args[1]).toEqual(operation.target);
      expect(args[2]).toMatchObject({ aspects: operation.aspects.map(id => ({ id })) });
    } else if (operation.kind === 'void-of-course') {
      expect(args[0]).toEqual({ bodies: ['Sun', 'Venus'], aspects: [{ id: 'square', angleDegrees: 90 }] });
    } else if (operation.kind !== 'phase-boundary') expect(args[0]).toBe(operation.body);
  });
  it('refuses when the ownership guard cannot be represented', () => {
    expect(new EventsAdapter(capability([]), engineStub()).search({ kind: 'ingress', body: 'Moon' },
      { ...window, startMs: -8_640_000_000_000_000 }, options))
      .toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
  });
  it('validates requests even if the capability is absent', () => {
    const adapter = new EventsAdapter({ status: 'missing' }, engineStub());
    const bad = [{ kind: 'ingress', body: 'Earth' }, { kind: 'ingress', body: 'Moon', surprise: true },
      { kind: 'aspect', body: 'Moon', target: { kind: 'moving', body: 'Moon' }, aspects: ['square'] },
      { kind: 'aspect', body: 'Moon', target: { kind: 'fixed', longitude: 360 }, aspects: ['trine'] },
      { kind: 'void-of-course', bodies: ['Moon'], aspects: ['square'] },
      { kind: 'void-of-course', bodies: ['Sun', 'Sun'], aspects: ['square'] },
      { kind: 'void-of-course', bodies: ['Sun'], aspects: ['square', 'square'] },
      { kind: 'void-of-course', bodies: ['Sun'], aspects: ['toString'] },
      { kind: 'void-of-course', bodies: Array(1), aspects: ['square'] },
      { kind: 'void-of-course', bodies: ['Sun'], aspects: Array(1) }];
    for (const operation of bad) expect(() => adapter.search(operation as EventOperation, window, options)).toThrow();
    for (const stepMs of [0, 0.1, Infinity]) expect(() => adapter.search({ kind: 'ingress', body: 'Moon' }, window, { ...options, stepMs })).toThrow();
  });
  it('rejects mismatched clocks, bad accounting and missing unresolved fields', () => {
    for (const source of [capability([{ ...points[0]!, clock: 'utc' }]),
      capability(points, { evaluations: 100 }), capability([{ ...points[0]!, atMs: -1 }])]) {
      expect(() => new EventsAdapter(source, engineStub()).search({ kind: 'ingress', body: 'Moon' }, window, options)).toThrow();
    }
    expect(() => new EventsAdapter(capability([]), engineStub()).search(
      { kind: 'void-of-course', bodies: ['Sun'], aspects: ['trine'] }, window, options)).toThrow('unresolved');
  });
});

describe('read-only source integration, not astronomical accuracy evidence', () => {
  it.each<Clock>(['utc', 'ut1', 'tt'])('retains native %s receipt conventions and bounds', async clock => {
    const runtime = await loadEngineRuntime();
    const startMs = Date.parse('2000-01-01T00:00:00Z'); // Arbitrary synthetic reference label.
    const context = new WorkContext({ startMs, endMs: startMs + 1000, clock }, { maxEvaluations: 1 });
    const result = new EngineAdapter(context, runtime).position('Moon', startMs, true);
    expect(result.receipt.schema).toBe('zodiacs.calc-receipt.v1');
    expect(result.receipt.engine.ephemeris).toEqual({ name: 'astronomy-engine', version: '2.1.19' });
    expect(result.receipt.conventions).toContain('frame:ecliptic-true-of-date');
    expect(result.clock).toBe(clock);
    expect(result.instant).toMatchObject({ timeScale: { input: clock } });
    expect(result.bounds).toBeTruthy();
    expect(Number.isFinite(result.longitude)).toBe(true);
  });
  it('retains the actual engine coverage refusal', async () => {
    const startMs = Date.parse('2300-01-01T00:00:00Z');
    const context = new WorkContext({ startMs, endMs: startMs + 1, clock: 'utc' }, { maxEvaluations: 1 });
    try { new EngineAdapter(context, await loadEngineRuntime()).position('Moon', startMs); throw new Error('Expected refusal'); }
    catch (error) { expect((error as AdapterRefused).detail).toMatchObject({ reason: 'out-of-range' }); }
  });
  it('loads only the fixed local sibling, with an explicit absent-capability path', async () => {
    const available = await loadEventsCapability();
    const runtime = await loadEngineRuntime();
    const startMs = Date.parse('2000-01-01T00:00:00Z');
    const result = new EventsAdapter(available, runtime).search({ kind: 'ingress', body: 'Moon' },
      { startMs, endMs: startMs + 1000, clock: 'utc' }, { maxEvaluations: 100, stepMs: 1000 });
    if (available.status === 'missing') {
      expect(result).toMatchObject({ status: 'refused', reason: 'missing-capability', receipts: [] });
    } else {
      expect(result.status).toBe('complete');
      expect(result.receipts.length).toBeGreaterThan(0);
      expect(available.source.moduleUrl).toMatch(/\/events\/build\/src\/index.js$/u);
      expect(available.source.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });
});
