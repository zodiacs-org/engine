import { describe, expect, it } from 'vitest';
import fixture from './fixtures/basic-windows.json';
import { AdapterRefused, evaluateBasicRule, normalizeIntervals, containsInstant } from '../src/index.js';
import type { BasicRule, ClockWindow, EngineReceipt, EngineRuntime, EventRecord, EventsCapability,
  EventsRuntime, Planet, WorkOptions } from '../src/index.js';

const window = fixture.window as ClockWindow;
const options = { stepMs: fixture.stepMs, maxEvaluations: 100 };
const receipt: EngineReceipt = { schema: 'hand-derived-contract', request: {}, instants: [{}],
  conventions: ['synthetic-contract-only'], engine: { name: 'stub', version: '0.0.0',
    ephemeris: { name: 'stub', version: '0.0.0' } } };
type Seeds = Partial<Record<Planet, { longitude: number; speed: number }>>;
function engine(seeds: Seeds, hook?: () => void): EngineRuntime {
  return { calc(request) {
    hook?.();
    const value = seeds[request.body] ?? { longitude: 0, speed: 1 };
    return { status: 'ok', lon: value.longitude, lat: 0,
      speeds: request.flags.speeds ? { lon: value.speed } : null, bounds: {}, receipt };
  } };
}
class Context {
  evaluations = 0;
  constructor(readonly window: ClockWindow, readonly work: WorkOptions) {}
  checkpoint(): void { if (this.work.signal?.aborted) throw new AdapterRefused('cancelled'); }
  evaluate<T>(run: () => T): T {
    this.checkpoint();
    if (this.evaluations === this.work.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    this.evaluations++;
    const value = run(); this.checkpoint(); return value;
  }
}
// Canned transitions are hand-derived. These stubs never discover or refine events.
function capability(events: readonly EventRecord[], inspect?: (args: readonly unknown[]) => void,
  unknown = false): EventsCapability {
  function scan(ctx: InstanceType<EventsRuntime['EvaluationContext']>, args: readonly unknown[],
    provider: Parameters<EventsRuntime['searchSignIngresses']>[3], body: Planet,
    kind: string): ReturnType<EventsRuntime['searchSignIngresses']> {
    const domain = (ctx as Context).window;
    inspect?.(args);
    provider.sample(body, domain.startMs);
    return { status: 'complete', evaluations: ctx.evaluations,
      events: events.filter(e => e.body === body && e.kind === kind && (e.atMs as number) > domain.startMs && (e.atMs as number) <= domain.endMs),
      ...(unknown ? { unresolved: [{ startMs: domain.startMs, endMs: domain.endMs, reason: 'synthetic-missing-transitions' }] } : {}) };
  }
  return { status: 'available', source: { moduleUrl: 'hand-derived-contract', sha256: 'not-an-artifact' }, runtime: {
    EvaluationContext: Context,
    searchSignIngresses: (ctx, ...args) => scan(ctx, args, args[2], args[0], 'sign-ingress'),
    searchStations: (ctx, ...args) => scan(ctx, args, args[2], args[0], 'station'),
    searchRetrogradeIntervals: () => { throw new Error('Not used for direct-state rules.'); },
    searchExactAspects: (ctx, ...args) => scan(ctx, args, args[4], args[0], 'exact-aspect'),
    searchVoidOfCourseMoon: () => { throw new Error('Later milestone.'); },
  } };
}
const signRule: BasicRule = { id: 'sign', kind: 'moon-sign', mode: 'require', options: { signs: ['taurus'] } };
const phaseRule: BasicRule = { id: 'phase', kind: 'moon-phase', mode: 'require', options: { phases: ['New Moon'] } };
const directRule: BasicRule = { id: 'direct', kind: 'direct-motion', mode: 'require', options: { bodies: ['Mercury', 'Venus'] } };

describe('hand-derived rule window golden fixtures', () => {
  it.each(fixture.cases)('$id', test => {
    const rule = test.rule as BasicRule;
    const result = evaluateBasicRule(rule, window, engine(test.initial as Seeds), capability(test.events as EventRecord[]), options);
    expect(result.status).toBe(test.unknown.length ? 'unresolved' : 'complete');
    expect(result.satisfied).toEqual(test.satisfied);
    expect(result.failed).toEqual(test.failed);
    expect(normalizeIntervals(result.unresolved)).toEqual(test.unknown);
    expect(result.evaluations).toBe(rule.kind === 'moon-phase' ? 3 : rule.kind === 'direct-motion' ? 4 : 2);
    expect(result.receipts).toHaveLength(result.evaluations);
    expect(result.searches.every(s => s.source?.moduleUrl === 'hand-derived-contract')).toBe(true);
    expect(result.rule).toEqual(rule);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rule.options)).toBe(true);
    expect(Object.isFrozen(rule)).toBe(false);
    for (let atMs = 0; atMs < 100; atMs++) {
      const matches = [result.satisfied, result.failed, result.unresolved].filter(set => containsInstant(set, atMs));
      expect(matches).toHaveLength(1);
    }
  });
  it('routes the engine phase sectors to the existing custom-aspect API', () => {
    let args: readonly unknown[] = [];
    evaluateBasicRule(phaseRule, window, engine({ Moon: { longitude: 0, speed: 1 } }),
      capability([], values => { args = values; }), options);
    expect(args.slice(0, 3)).toEqual(['Moon', { kind: 'moving', body: 'Sun' }, { aspects: [
      { id: 'phase_45', angleDegrees: 22.5 }, { id: 'phase_135', angleDegrees: 67.5 },
      { id: 'phase_225', angleDegrees: 112.5 }, { id: 'phase_315', angleDegrees: 157.5 },
    ] }]);
  });
  it('checks every phase subset by independent finite label membership over a full cycle', () => {
    const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'] as const;
    const events: EventRecord[] = [337.5, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5].map((relativeLongitude, i) => ({
      kind: 'exact-aspect', body: 'Moon', target: { kind: 'moving', body: 'Sun' }, relativeLongitude,
      atMs: i * 10, bracket: [i * 10, i * 10], direction: 'direct', clock: 'tt',
    }));
    for (let mask = 1; mask < 256; mask++) {
      const selected = names.filter((_, i) => mask & (1 << i));
      const result = evaluateBasicRule({ ...phaseRule, options: { phases: selected } }, { ...window, endMs: 80 },
        engine({ Moon: { longitude: 330, speed: 1 } }), capability(events), options);
      expect(result.status).toBe('complete');
      // The table assigns one named sector to each hand-defined ten-label block.
      for (let t = 0; t < 80; t++) expect(containsInstant(result.satisfied, t)).toBe(Boolean(mask & (1 << Math.floor(t / 10))));
    }
  });
  it.each([22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5])('seed classification includes sector start %s degrees', angle => {
    const names = ['Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent', 'New Moon'] as const;
    const name = names[(angle - 22.5) / 45]!;
    expect(evaluateBasicRule({ ...phaseRule, options: { phases: [name] } }, window,
      engine({ Moon: { longitude: angle, speed: 1 } }), capability([]), options).satisfied).toEqual([{ startMs: 0, endMs: 100 }]);
  });
  it('applies outgoing motion at a station exactly on either requested endpoint', () => {
    const events: EventRecord[] = [0, 100].map((atMs, i) => ({ kind: 'station', body: 'Mercury', atMs,
      bracket: [atMs, atMs], clock: 'tt', direction: i ? 'retrograde' : 'direct' }));
    const result = evaluateBasicRule({ ...directRule, options: { bodies: ['Mercury'] } }, window,
      engine({ Mercury: { longitude: 10, speed: -1 } }), capability(events), options);
    expect(result).toMatchObject({ status: 'complete', satisfied: [{ startMs: 0, endMs: 100 }], failed: [] });
    expect(result.searches[0]?.sourceWindow).toEqual({ startMs: -11, endMs: 110, clock: 'tt' });
  });
  it('retains a root bracket crossing the requested right endpoint', () => {
    const event: EventRecord = { kind: 'sign-ingress', body: 'Moon', atMs: 100, bracket: [99, 101],
      clock: 'tt', direction: 'direct', fromSign: 'Aries', toSign: 'Taurus' };
    const result = evaluateBasicRule(signRule, window, engine({ Moon: { longitude: 10, speed: 1 } }), capability([event]), options);
    expect(result.status).toBe('unresolved');
    expect(result.satisfied).toEqual([]);
    expect(result.failed).toEqual([{ startMs: 0, endMs: 99 }]);
    expect(normalizeIntervals(result.unresolved)).toEqual([{ startMs: 99, endMs: 100 }]);
  });
  it('handles retrograde sector branches without assuming Moon motion in the contract', () => {
    const event: EventRecord = { kind: 'exact-aspect', body: 'Moon', target: { kind: 'moving', body: 'Sun' },
      relativeLongitude: 337.5, atMs: 50, bracket: [50, 50], clock: 'tt', direction: 'retrograde' };
    const result = evaluateBasicRule(phaseRule, window, engine({ Moon: { longitude: 350, speed: -1 } }), capability([event]), options);
    expect(result.satisfied).toEqual([{ startMs: 0, endMs: 50 }]);
  });
});

describe('coverage, refusal, accounting and validation', () => {
  it.each(['utc', 'ut1', 'tt'] as const)('keeps %s labels in every window and delegated event', clock => {
    const test = fixture.cases[0]!;
    const events = (test.events as EventRecord[]).map(event => ({ ...event, clock }));
    const result = evaluateBasicRule(test.rule as BasicRule, { ...window, clock }, engine(test.initial as Seeds), capability(events), options);
    expect(result.status).toBe('complete');
    expect(result.window.clock).toBe(clock);
    expect(result.searches.every(search => search.window.clock === clock && search.sourceWindow?.clock === clock)).toBe(true);
    expect(result.searches.flatMap(search => search.events).every(event => event.clock === clock)).toBe(true);
    expect(result.satisfied).toEqual(test.satisfied);
  });
  it('distinguishes completed empty matches from unavailable searches', () => {
    expect(evaluateBasicRule(signRule, window, engine({}), capability([]), options))
      .toMatchObject({ status: 'complete', satisfied: [], failed: [{ startMs: 0, endMs: 100 }] });
    expect(evaluateBasicRule(signRule, window, engine({}), { status: 'missing' }, options))
      .toMatchObject({ status: 'refused', reason: 'missing-capability', receipts: [], evaluations: 0, satisfied: [], covered: [] });
  });
  it('never calls unknown transitions passing coverage', () => {
    const result = evaluateBasicRule(signRule, window, engine({ Moon: { longitude: 40, speed: 1 } }), capability([], undefined, true), options);
    expect(result).toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
    expect(normalizeIntervals(result.unresolved)).toEqual([{ startMs: 0, endMs: 100 }]);
    expect(evaluateBasicRule(directRule, window, engine({ Mercury: { longitude: 0, speed: 0 } }), capability([]), options))
      .toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
  });
  it('shares budgets across seeds, both phase bodies and all station searches', () => {
    for (const rule of [signRule, phaseRule, directRule]) {
      for (const maxEvaluations of [1, 2, 3]) {
        const result = evaluateBasicRule(rule, window, engine({}), capability([]), { ...options, maxEvaluations });
        if ((rule === signRule && maxEvaluations >= 2) || (rule === phaseRule && maxEvaluations === 3)) expect(result.status).toBe('complete');
        else expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', evaluations: maxEvaluations,
          satisfied: [], covered: [] });
        expect(result.receipts).toHaveLength(result.evaluations);
      }
    }
  });
  it('preserves failed work and native coverage refusals, without partial windows', () => {
    const refusal = { status: 'refused' as const, reason: 'out-of-range', detail: 'native coverage' };
    expect(evaluateBasicRule(signRule, window, { calc: () => refusal }, capability([]), options))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', detail: refusal, evaluations: 1, receipts: [] });
    expect(evaluateBasicRule(signRule, { ...window, startMs: -8_640_000_000_000_000 }, engine({}), capability([]), options))
      .toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
  });
  it('honors cancellation before and during a seed', () => {
    const before = new AbortController(); before.abort();
    expect(evaluateBasicRule(signRule, window, engine({}), capability([]), { ...options, signal: before.signal }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 0 });
    const during = new AbortController();
    expect(evaluateBasicRule(signRule, window, engine({}, () => during.abort()), capability([]), { ...options, signal: during.signal }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 1, satisfied: [] });
  });
  it('retains the audit and discards windows when cancelled during a delegated scan', () => {
    const controller = new AbortController();
    let calls = 0;
    const runtime = engine({}, () => { if (++calls === 2) controller.abort(); });
    const result = evaluateBasicRule(signRule, window, runtime, capability([]), { ...options, signal: controller.signal });
    expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 2, satisfied: [], covered: [] });
    expect(result.searches[0]?.status).toBe('refused');
    expect(result.receipts).toHaveLength(2);
  });
  it('rejects bad options and rules before work, including missing-capability requests', () => {
    for (const bad of [{ ...signRule, weight: 1 }, { ...signRule, options: { signs: ['Taurus'] } },
      { ...directRule, options: { bodies: ['Mars'] } }, { ...phaseRule, options: { phases: ['waxing'] } },
      { ...signRule, extra: true }]) expect(() => evaluateBasicRule(bad as BasicRule, window, engine({}), { status: 'missing' }, options)).toThrow();
    for (const stepMs of [0, Infinity, 1.5]) expect(() => evaluateBasicRule(signRule, window, engine({}), capability([]), { ...options, stepMs })).toThrow();
  });
  it('rejects malformed, wrong-body, discontinuous and duplicate transitions', () => {
    const event = fixture.cases[1]!.events[0] as EventRecord;
    for (const events of [[{ ...event, bracket: [32, 33] }], [{ ...event, fromSign: 'Leo', toSign: 'Virgo' }],
      [{ ...event, direction: 'stationary' }], [{ ...event, bracket: null }], [event, event]]) {
      expect(() => evaluateBasicRule(signRule, window, engine({ Moon: { longitude: 10, speed: 1 } }), capability(events), options)).toThrow();
    }
  });
});
