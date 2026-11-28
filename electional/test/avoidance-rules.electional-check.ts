import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/avoidance-windows.json';
import { AdapterRefused, EngineAdapter, EventsAdapter, WorkContext, containsInstant,
  evaluateAvoidanceRule, loadEngineRuntime, normalizeIntervals } from '../src/index.js';
import type { AvoidanceRule, AvoidanceRuleOptions, ClockWindow, EngineReceipt, EngineRuntime,
  EventRecord, EventsCapability, EventsRuntime, WorkOptions } from '../src/index.js';

const DAY = 86400000;
const window: ClockWindow = { ...fixture.window, clock: 'tt' };
const receipt: EngineReceipt = { schema: 'hand-derived-contract', request: {}, instants: [{ clock: 'explicit-stub' }],
  conventions: ['synthetic-control-flow-only'], engine: { name: 'stub', version: '0.0.0', ephemeris: { name: 'stub', version: '0.0.0' } } };
const model = { sunRadiusAu: 10, moonRadiusAu: 1, earthRadiusAu: 2 };
const options: AvoidanceRuleOptions = { stepMs: 2, maxEvaluations: 100 };
function rule(kind: 'avoid-stations' | 'avoid-eclipses', marginMs: number): AvoidanceRule {
  return kind === 'avoid-stations' ? { id: 'station', kind, mode: 'require', options: { bodies: ['Mercury'], withinDays: marginMs / DAY } }
    : { id: 'eclipse', kind, mode: 'prefer', weight: 3, options: { kinds: ['solar'], withinDays: marginMs / DAY } };
}
function work(kind: AvoidanceRule['kind']): AvoidanceRuleOptions {
  return { ...options, ...(kind === 'avoid-eclipses' ? { eclipse: { model, derivativeStepMs: 1 } } : {}) };
}
const spans = (rows: readonly (readonly number[])[]) => rows.map(([startMs, endMs]) => ({ startMs: startMs!, endMs: endMs! }));
function station(atMs: number, lo = atMs, hi = atMs, body = 'Mercury'): EventRecord {
  return { kind: 'station', clock: 'tt', body, atMs, bracket: [lo, hi], direction: 'direct', longitude: 100, residualDegreesPerDay: 0 };
}
function eclipse(atMs: number, lo = atMs, hi = atMs, kind = 'solar'): EventRecord {
  return { kind, clock: 'tt', atMs, bracket: [lo, hi], classification: kind === 'solar' ? 'central' : 'total',
    definition: 'minimum-shadow-axis-distance', model, forward: true, axisDistanceAu: 0.1,
    penumbraRadiusAu: 2, umbraRadiusAu: 1, derivativeResidualAuSquaredPerMs: 0 };
}
function engine(onCall?: (request: Parameters<EngineRuntime['calc']>[0]) => void): EngineRuntime {
  return { calc(request) { onCall?.(request); return { status: 'ok', lon: 100, lat: 0, bounds: {}, receipt,
    speeds: request.flags.speeds ? { lon: 1 } : null, cartesian: { x: request.body === 'Sun' ? 100 : 1, y: 0, z: 0 } }; } };
}
class ContractContext {
  evaluations = 0;
  constructor(readonly window: ClockWindow, readonly options: WorkOptions) {}
  checkpoint(): void { if (this.options.signal?.aborted) throw new AdapterRefused('cancelled'); }
  evaluate<T>(run: () => T): T {
    this.checkpoint();
    if (this.evaluations >= this.options.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    this.evaluations++; const result = run(); this.checkpoint(); return result;
  }
}
type Native = ReturnType<EventsRuntime['searchStations']>;
type Call = { kind: string; window: ClockWindow; maxEvaluations: number; settings: unknown };
function capability(events: readonly EventRecord[] = [], extra: Partial<Native> = {}, calls: Call[] = []): EventsCapability {
  const scan = (ctx: InstanceType<EventsRuntime['EvaluationContext']>, kind: string, settings: unknown, sample: (at: number) => unknown): Native => {
    const context = ctx as ContractContext;
    calls.push({ kind, window: context.window, maxEvaluations: context.options.maxEvaluations, settings });
    sample(context.window.startMs);
    return { status: 'complete', evaluations: ctx.evaluations,
      events: events.filter(e => e.kind === kind && (kind !== 'station' || e.body === (settings as { body: string }).body)
        && (e.atMs as number) > context.window.startMs && (e.atMs as number) <= context.window.endMs), ...extra };
  };
  const unused = () => { throw new Error('Unexpected search API'); };
  return { status: 'available', source: { moduleUrl: 'hand-derived-stub', sha256: 'not-an-artifact' }, runtime: {
    EvaluationContext: ContractContext, searchSignIngresses: unused, searchRetrogradeIntervals: unused,
    searchExactAspects: unused, searchVoidOfCourseMoon: unused,
    searchStations: (ctx, body, settings, p) => scan(ctx, 'station', { body, ...settings }, at => p.sample(body, at, true)),
    searchEclipses: (ctx, kind, radii, settings, p) => scan(ctx, kind, { model: radii, ...settings }, at => p.sample(at)),
  } };
}

for (const kind of ['avoid-stations', 'avoid-eclipses'] as const) describe(`hand-derived ${kind} golden intervals`, () => {
  it.each(fixture.cases)('$id', test => {
    const events = test.roots.map(([at, lo, hi]) => kind === 'avoid-stations' ? station(at!, lo!, hi!) : eclipse(at!, lo!, hi!));
    const input = rule(kind, test.marginMs), calls: Call[] = [];
    const result = evaluateAvoidanceRule(input, window, engine(), capability(events, {}, calls), work(kind));
    expect(result.status).toBe(test.unknown.length ? 'unresolved' : 'complete');
    expect(result.satisfied).toEqual(spans(test.satisfied)); expect(result.failed).toEqual(spans(test.failed));
    expect(normalizeIntervals(result.unresolved)).toEqual(spans(test.unknown));
    expect(normalizeIntervals([...result.satisfied, ...result.failed, ...result.unresolved])).toEqual([windowWithoutClock()]);
    expect(result.convention.marginMs).toBe(test.marginMs);
    expect(result.receipts).toHaveLength(result.evaluations); expect(result.evaluations).toBe(kind === 'avoid-stations' ? 1 : 2);
    expect(calls[0]?.window.startMs).toBe(-test.marginMs - options.stepMs - (kind === 'avoid-stations' ? 0 : 1) - 2);
    expect(calls[0]?.window.endMs).toBe(10 + test.marginMs + options.stepMs + (kind === 'avoid-stations' ? 0 : 1) + 1);
    expect(Object.isFrozen(result.avoidances[0]?.event.bracket ?? result.avoidances)).toBe(true);
    expect(Object.isFrozen(result.convention)).toBe(true); expect(Object.isFrozen(input)).toBe(false);
    for (let t = 0; t < 10; t++) {
      expect([result.satisfied, result.failed, result.unresolved].filter(set => containsInstant(set, t))).toHaveLength(1);
    }
  });
});
function windowWithoutClock() { return { startMs: window.startMs, endMs: window.endMs }; }

describe('avoidance set reasoning and shared work', () => {
  it('independently enumerates all possible roots in small brackets', () => {
    for (let lo = -1; lo <= 10; lo++) for (let hi = lo; hi <= Math.min(lo + 3, 10); hi++) for (let m = 0; m <= 3; m++) {
      const result = evaluateAvoidanceRule(rule('avoid-stations', m), window, engine(), capability([station(lo, lo, hi)]), options);
      for (let t = 0; t < 10; t++) {
        const forbidden = Array.from({ length: hi - lo + 1 }, (_, i) => Math.abs(t - (lo + i)) <= m);
        expect(containsInstant(result.failed, t)).toBe(forbidden.every(Boolean));
        expect(containsInstant(result.satisfied, t)).toBe(forbidden.every(x => !x));
        expect(containsInstant(result.unresolved, t)).toBe(forbidden.some(Boolean) && forbidden.some(x => !x));
      }
    }
  });
  it('unions selected bodies and kinds while sharing one budget and retaining search audits', () => {
    const calls: Call[] = [], cap = capability([eclipse(3), eclipse(6, 6, 6, 'lunar')], {}, calls);
    const input: AvoidanceRule = { ...rule('avoid-eclipses', 1), kind: 'avoid-eclipses', options: { kinds: ['solar', 'lunar'], withinDays: 1 / DAY } };
    const result = evaluateAvoidanceRule(input, window, engine(), cap, work('avoid-eclipses'));
    expect(result.failed).toEqual(spans([[2,8]])); expect(result.searches).toHaveLength(2);
    expect(calls.map(c => c.maxEvaluations)).toEqual([100, 98]); expect(result.evaluations).toBe(4);
    expect(result.avoidances.map(a => a.searchIndex)).toEqual([0, 1]);
    const stationCalls: Call[] = [];
    const stations = capability([], {}, stationCalls);
    evaluateAvoidanceRule({ id: 'both', kind: 'avoid-stations', mode: 'require', options: { bodies: ['Mercury', 'Venus', 'Pluto'], withinDays: 1 } }, window, engine(), stations, options);
    expect(stationCalls.map(c => c.settings)).toEqual(['Mercury', 'Venus', 'Pluto'].map(body => ({ body, stepMs: 2 })));
    expect(stationCalls.map(c => c.maxEvaluations)).toEqual([100,99,98]);
  });
  it('dilates missing event coverage, including gaps outside the requested window', () => {
    const result = evaluateAvoidanceRule(rule('avoid-stations', 2), window, engine(), capability([station(2)],
      { unresolved: [{ startMs: -2, endMs: 0, reason: 'synthetic-missing-root' }, { startMs: 8, endMs: 9, reason: 'synthetic-gap' }] }), options);
    // The known event excludes 0..4 and resolves the first gap's 0..1 uncertainty.
    expect(result.failed).toEqual(spans([[0,5]])); expect(result.satisfied).toEqual(spans([[5,6]]));
    expect(normalizeIntervals(result.unresolved)).toEqual(spans([[6,10]]));
    expect(result.unresolved[0]).toMatchObject({ reason: 'incomplete-avoidance-search', sourceReason: 'synthetic-gap', searchIndex: 0 });
  });
  it('unions forbidden intervals from distinct selected station bodies', () => {
    const input: AvoidanceRule = { id: 'both', kind: 'avoid-stations', mode: 'require',
      options: { bodies: ['Mercury', 'Venus'], withinDays: 2 / DAY } };
    const result = evaluateAvoidanceRule(input, window, engine(), capability([station(3), station(7, 7, 7, 'Venus')]), options);
    expect(result.failed).toEqual(spans([[1,10]])); expect(result.satisfied).toEqual(spans([[0,1]]));
    expect(result.avoidances.map(a => [a.event.body, a.searchIndex])).toEqual([['Mercury', 0], ['Venus', 1]]);
  });
  it('never treats a source unresolved result as a complete empty scan', () => {
    const cap = capability([], { unresolved: [{ startMs: -1, endMs: 11, reason: 'synthetic-incomplete' }] });
    expect(evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), cap, options))
      .toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
  });
  it('floors a fractional millisecond margin once and preserves a zero-day singleton', () => {
    const result = evaluateAvoidanceRule(rule('avoid-stations', 1.5), window, engine(), capability([station(5)]), options);
    expect(result.convention.marginMs).toBe(1); expect(result.failed).toEqual(spans([[4,7]]));
  });
  it.each(['utc', 'ut1', 'tt'] as const)('preserves %s clock labels and vector receipts', clock => {
    const calls: Parameters<EngineRuntime['calc']>[0][] = [];
    const result = evaluateAvoidanceRule(rule('avoid-eclipses', 0), { ...window, clock }, engine(r => calls.push(r)),
      capability([{ ...eclipse(5), clock }]), work('avoid-eclipses'));
    expect(result.window.clock).toBe(clock); expect(result.avoidances[0]?.event.clock).toBe(clock);
    expect(result.searches[0]?.sourceWindow?.clock).toBe(clock);
    expect(calls.map(c => c.body)).toEqual(['Sun', 'Moon']);
    for (const call of calls) {
      expect(call.flags).toEqual({ correction: 'apparent', speeds: false, units: 'degrees', cartesian: true });
      if (clock === 'utc') expect(call.time).toBeInstanceOf(Date);
      else expect(call.time).toMatchObject({ scale: clock });
    }
  });
});

describe('avoidance refusals, boundaries and malformed APIs', () => {
  it('reports missing eclipse export before sampling, while old station builds continue to work', () => {
    const cap = capability(); if (cap.status === 'available') delete cap.runtime.searchEclipses;
    expect(evaluateAvoidanceRule(rule('avoid-eclipses', 0), window, engine(), cap, work('avoid-eclipses')))
      .toMatchObject({ status: 'refused', reason: 'missing-capability', detail: 'eclipse-search-export', evaluations: 0 });
    expect(evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), cap, options).status).toBe('complete');
    expect(evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), { status: 'missing' }, options))
      .toMatchObject({ status: 'refused', reason: 'missing-capability', evaluations: 0 });
  });
  it('charges failed requests, bounds both eclipse vectors and shares exhaustion across kinds', () => {
    const input: AvoidanceRule = { id: 'both', kind: 'avoid-eclipses', mode: 'require', options: { kinds: ['solar', 'lunar'], withinDays: 0 } };
    for (const maxEvaluations of [1,2,3]) {
      const result = evaluateAvoidanceRule(input, window, engine(), capability(), { ...work('avoid-eclipses'), maxEvaluations });
      expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', evaluations: maxEvaluations, satisfied: [], failed: [], covered: [] });
      expect(result.receipts).toHaveLength(maxEvaluations);
    }
    const refusal = { status: 'refused' as const, reason: 'out-of-range', detail: 'independent fake coverage refusal' };
    const result = evaluateAvoidanceRule(rule('avoid-eclipses', 0), window, { calc: () => refusal }, capability(), work('avoid-eclipses'));
    expect(result).toMatchObject({ status: 'refused', reason: 'engine-refused', detail: refusal, evaluations: 1, receipts: [] });
    expect(evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), capability([], { status: 'refused', reason: 'evaluation-budget', events: [] }), options))
      .toMatchObject({ status: 'refused', reason: 'evaluation-budget', evaluations: 1 });
  });
  it('discards usable intervals on cancellation but keeps work receipts', () => {
    const controller = new AbortController();
    const result = evaluateAvoidanceRule(rule('avoid-eclipses', 0), window, engine(() => controller.abort()), capability(),
      { ...work('avoid-eclipses'), signal: controller.signal });
    expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 1, satisfied: [], covered: [] });
    expect(result.receipts).toHaveLength(1);
    expect(evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), { status: 'missing' }, { ...options, signal: controller.signal }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 0 });
  });
  it('refuses unrepresentable padding before any search or loss of integer precision', () => {
    for (const domain of [{ startMs: -8640000000000000, endMs: -8639999999999990, clock: 'tt' as const },
      { startMs: 8639999999999990, endMs: 8640000000000000, clock: 'tt' as const }]) {
      expect(evaluateAvoidanceRule(rule('avoid-stations', 2), domain, engine(), capability(), options))
        .toMatchObject({ status: 'refused', reason: 'coverage', detail: 'avoidance-padding-unrepresentable', evaluations: 0 });
    }
    expect(evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), capability(), { ...options, stepMs: Number.MAX_SAFE_INTEGER }))
      .toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
  });
  it('clips guard event margins exactly near Date extrema', () => {
    const domain = { startMs: 8640000000000000 - 100, endMs: 8640000000000000 - 50, clock: 'tt' as const };
    const result = evaluateAvoidanceRule(rule('avoid-stations', 20), domain, engine(), capability([station(domain.endMs + 10)]), options);
    expect(result.failed).toEqual([{ startMs: domain.endMs - 10, endMs: domain.endMs }]);
    const overLimit = evaluateAvoidanceRule(rule('avoid-stations', 40), domain, engine(), capability([station(domain.endMs + 39)]), options);
    expect(overLimit.failed).toEqual([{ startMs: domain.endMs - 1, endMs: domain.endMs }]);
  });
  it('validates rules and settings before missing capability', () => {
    for (const bad of [{ ...options, stepMs: 0 }, { ...options, maxEvaluations: NaN }, { ...options, signal: {} }, { ...options, extra: 1 }]) {
      expect(() => evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), { status: 'missing' }, bad as AvoidanceRuleOptions)).toThrow();
    }
    for (const bad of [undefined, null, { model, derivativeStepMs: 0 }, { model: { ...model, sunRadiusAu: 1 }, derivativeStepMs: 1 },
      { model: { ...model, moonRadiusAu: NaN }, derivativeStepMs: 1 }, { model: { ...model, extra: 1 }, derivativeStepMs: 1 },
      { model, derivativeStepMs: 1, extra: true }]) {
      expect(() => evaluateAvoidanceRule(rule('avoid-eclipses', 0), window, engine(), { status: 'missing' },
        { ...options, eclipse: bad } as unknown as AvoidanceRuleOptions)).toThrow();
    }
    expect(() => evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), capability(), work('avoid-eclipses'))).toThrow();
    expect(() => evaluateAvoidanceRule({ id: 'bad', kind: 'moon-not-void', mode: 'require', options: { bodies: 'modern' } } as unknown as AvoidanceRule,
      window, engine(), capability(), options)).toThrow('Expected an avoidance rule');
    expect(() => evaluateAvoidanceRule({ ...rule('avoid-stations', 0), options: { bodies: ['Sun'], withinDays: 0 } } as unknown as AvoidanceRule,
      window, engine(), capability(), options)).toThrow();
  });
  it('rejects malformed station brackets and native metadata', () => {
    for (const patch of [{ body: 'Venus' }, { direction: 'unknown' }, { longitude: NaN }, { residualDegreesPerDay: null },
      { bracket: [6,7] }, { bracket: [-100,6] }, { bracket: [4.5,6] }, { bracket: null }, { clock: 'utc' }, { kind: 'solar' }]) {
      // Force returned kind so the native contract cannot silently filter out a bad event.
      expect(() => evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), capability([], { events: [{ ...station(5), ...patch } as EventRecord] }), options)).toThrow();
    }
    expect(() => evaluateAvoidanceRule(rule('avoid-stations', 0), window, engine(), capability([station(5), station(5)]), options)).toThrow('duplicate');
  });
  it('rejects malformed eclipse metadata and vector results without inventing provenance', () => {
    for (const patch of [{ definition: 'contact' }, { forward: false }, { classification: 'annular' }, { axisDistanceAu: -1 },
      { umbraRadiusAu: Infinity }, { model: { ...model, moonRadiusAu: 9 } }, { model: null }, { derivativeResidualAuSquaredPerMs: null }]) {
      expect(() => evaluateAvoidanceRule(rule('avoid-eclipses', 0), window, engine(), capability([{ ...eclipse(5), ...patch }]), work('avoid-eclipses'))).toThrow('Invalid avoidance eclipse');
    }
    for (const cartesian of [null, { x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1.7e308, y: 1.7e308, z: 0 }]) {
      const source: EngineRuntime = { calc: r => ({ ...engine().calc(r), cartesian } as ReturnType<EngineRuntime['calc']>) };
      expect(() => evaluateAvoidanceRule(rule('avoid-eclipses', 0), window, source, capability(), work('avoid-eclipses'))).toThrow('Invalid native engine vector');
    }
  });
  it.each(['avoid-stations', 'avoid-eclipses'] as const)('%s retains a real engine refusal when margin padding leaves native coverage', async kind => {
    const domain = { startMs: Date.parse('1800-01-01T01:00:00Z'), endMs: Date.parse('1800-01-02T01:00:00Z'), clock: 'utc' as const };
    const result = evaluateAvoidanceRule(rule(kind, DAY), domain, await loadEngineRuntime(), capability(), work(kind));
    expect(result).toMatchObject({ status: 'refused', reason: 'engine-refused', evaluations: 1, receipts: [], covered: [], satisfied: [] });
    if (result.status !== 'refused') throw new Error('Expected native padding coverage refusal.');
    expect(result.detail).toMatchObject({ status: 'refused' });
  });
  it('validates eclipse adapter operations, derivative windows and endpoint ownership', () => {
    const op = { kind: 'eclipse' as const, eclipseKind: 'solar' as const, model, derivativeStepMs: 1 };
    const adapter = new EventsAdapter(capability([eclipse(0), eclipse(10)]), engine());
    expect(adapter.search(op, window, options).events.map(e => e.atMs)).toEqual([0]);
    for (const patch of [{ eclipseKind: 'unknown' }, { derivativeStepMs: 0 }, { extra: true }, { model: null }, { derivativeStepMs: 6 }]) {
      expect(() => adapter.search({ ...op, ...patch } as typeof op, window, options)).toThrow();
    }
    const context = new WorkContext(window, { maxEvaluations: 1 });
    expect(() => new EngineAdapter(context, engine()).vector('Mercury' as 'Sun', 0)).toThrow();
    expect(context.evaluations).toBe(0);
  });
});

const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function nativeCapability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
describe.runIf(present)('native avoidance scanners with hand-derived equations', () => {
  it('delegates the quadratic Mercury longitude minimum at label 5', async () => {
    const runtime: EngineRuntime = { calc(request) {
      const at = (request.time as Date).getTime();
      return { status: 'ok', lon: 100 + (at - 5) ** 2 / 100, lat: 0, speeds: { lon: (at - 5) / 50 }, bounds: {}, receipt };
    } };
    const result = evaluateAvoidanceRule(rule('avoid-stations', 2), { ...window, clock: 'utc' }, runtime, await nativeCapability(), options);
    expect(result.status).toBe('complete'); expect(result.failed).toEqual(spans([[3,8]]));
    expect(result.searches[0]?.events[0]?.atMs).toBe(5); expect(result.receipts).toHaveLength(result.evaluations);
  });
  it('delegates a symmetric solar-axis minimum centered at label 5', async () => {
    const runtime: EngineRuntime = { calc(request) {
      const at = (request.time as Date).getTime();
      return { status: 'ok', lon: 0, lat: 0, speeds: null, bounds: {}, receipt,
        cartesian: request.body === 'Sun' ? { x: 100, y: 0, z: 0 } : { x: 1, y: (at - 5) / 100, z: 0 } };
    } };
    const result = evaluateAvoidanceRule(rule('avoid-eclipses', 2), { ...window, clock: 'utc' }, runtime, await nativeCapability(), work('avoid-eclipses'));
    expect(result.status).toBe('complete'); expect(result.failed).toEqual(spans([[3,8]]));
    expect(result.searches[0]?.events[0]?.atMs).toBe(5); expect(result.receipts).toHaveLength(result.evaluations);
  });
});
