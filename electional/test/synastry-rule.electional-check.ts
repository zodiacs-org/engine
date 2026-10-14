import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/synastry-windows.json';
import { AdapterRefused, containsInstant, evaluateSynastryRule, loadSynastryRuntime, normalizeIntervals, RuleValidationError } from '../src/index.js';
import type { ClockWindow, EngineReceipt, EventRecord, EventsCapability, EventsRuntime, SynastryRule, SynastryRuntime, SyntheticNatal, WorkOptions } from '../src/index.js';

const window: ClockWindow = { startMs: 0, endMs: 30, clock: 'utc' };
const options = { stepMs: 1, maxEvaluations: 2000 };
const natal: SyntheticNatal = { synthetic: true, instant: '1969-12-31T23:59:59.900Z', clock: 'utc', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole' };
const rule: SynastryRule = { id: 'synthetic-pairs', kind: 'synastry-aspect', mode: 'require', options: {
  movingBodies: ['Moon', 'Venus'], natalBodies: ['Sun', 'Jupiter'], aspects: ['conjunction'], maxOrbDegrees: 5, match: 'any',
} };
const receipt: EngineReceipt = { schema: 'hand-derived-contract', request: {}, instants: [{}], conventions: ['synthetic-only'],
  engine: { name: 'stub', version: '0.0.0', ephemeris: { name: 'stub', version: '0.0.0' } } };
const wrap = (x: number) => ((x % 360) + 360) % 360;
const spans = (rows: readonly (readonly number[])[]) => rows.map(([startMs, endMs]) => ({ startMs: startMs!, endMs: endMs! }));
let real: SynastryRuntime;
beforeAll(async () => { real = await loadSynastryRuntime(); });
function runtime(mutation: Partial<SynastryRuntime> = {}): SynastryRuntime {
  return { ...real, chart: () => ({ status: 'ok', chart: {
    bodies: [{ body: 'Sun', lon: 60, speed: 1 }, { body: 'Jupiter', lon: 65, speed: -1 }, { body: 'Moon', lon: 60, speed: 12 }],
    angles: { asc: 0, mc: 90, dsc: 180, ic: 270 }, houses: { system: 'whole', cusps: Array.from({ length: 12 }, (_, i) => i * 30) }, flags: [],
  }, receipt }), calc(request) {
    const t = request.time instanceof Date ? request.time.getTime() : Math.round((request.time.jd - 2440587.5) * 86400000);
    return { status: 'ok', lon: wrap((request.body === 'Venus' ? 55 : 50) + t), lat: 0, speeds: request.flags.speeds ? { lon: 1 } : null, bounds: {}, receipt };
  }, ...mutation };
}
class Context {
  evaluations = 0;
  constructor(readonly window: ClockWindow, readonly options: WorkOptions) {}
  checkpoint() { if (this.options.signal?.aborted) throw new AdapterRefused('cancelled'); }
  evaluate<T>(run: () => T): T {
    this.checkpoint(); if (this.evaluations >= this.options.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    this.evaluations++; const value = run(); this.checkpoint(); return value;
  }
}
// Canned roots for the declared linear equations, without a scan or root solver.
function capability(hook?: (events: EventRecord[]) => EventRecord[]): EventsCapability {
  const runtime = { EvaluationContext: Context, searchLongitudeCrossings(ctx: Context, _body: string, target: number, _options: unknown,
    provider: { sample(body: string, at: number): { longitude: number } }) {
    const coordinate = provider.sample('Moon', -2).longitude;
    if (coordinate === 181) return { status: 'complete', evaluations: ctx.evaluations, events: [] };
    const contact = ({ 348: 10, 343: 15, 353: 5 } as Record<number, number>)[coordinate];
    if (contact === undefined) throw new Error('Undeclared test equation.');
    const root = target === 355 ? contact - 5 : target === 5 ? contact + 5 : target === 0 ? contact : undefined;
    const events: EventRecord[] = root === undefined ? [] : [{ kind: 'longitude-crossing', body: 'Moon', longitude: target,
      atMs: root, clock: ctx.window.clock, bracket: [root, root], direction: 'direct' }];
    return { status: 'complete', evaluations: ctx.evaluations, events: hook?.(events) ?? events };
  } };
  return { status: 'available', runtime: runtime as unknown as EventsRuntime, source: { moduleUrl: 'hand-derived-contract', sha256: 'not-an-artifact' } };
}
describe('hand-derived synastry golden sets and explicit policy', () => {
  it.each(fixture.cases)('$match combines every moving/natal pair', test => {
    const input = { ...rule, options: { ...rule.options, match: test.match } } as SynastryRule;
    const result = evaluateSynastryRule(input, window, natal, runtime(), capability(), options);
    expect(result.status).toBe('complete');
    expect(result.satisfied).toEqual(spans(test.satisfied)); expect(result.failed).toEqual(spans(test.failed));
    expect(result.receipts).toHaveLength(result.evaluations);
    expect(result.policy).toMatchObject({ api: 'findInterAspects', arithmetic: 'native-historical-floating-point', match: `${test.match}-pair${test.match === 'all' ? 's' : ''}` });
    expect(result.policy.pairs).toHaveLength(4);
    expect(result.natal).toMatchObject({ atMs: -100, clock: 'utc', actualHouseSystem: 'whole', receipt });
    for (let t = 0; t < 30; t++) expect([result.satisfied, result.failed, result.unresolved].filter(s => containsInstant(s, t))).toHaveLength(1);
    expect(Object.isFrozen(result.policy.pairs[0]?.aspects)).toBe(true);
    expect(Object.isFrozen(result.natal?.selectedBodies)).toBe(true); expect(Object.isFrozen(result.receipts[0])).toBe(true);
    expect(Object.isFrozen(result.searches[0]?.events)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false); expect(Object.isFrozen(natal)).toBe(false);
    expect(result.explanation).toContain('not a prediction');
  });
  it.each(fixture.pairs)('$moving to natal $natal has inclusive orb entry and exit labels', test => {
    const input = { ...rule, options: { ...rule.options, movingBodies: [test.moving], natalBodies: [test.natal] } } as SynastryRule;
    const result = evaluateSynastryRule(input, window, natal, runtime(), capability(), options);
    expect(result.status).toBe('complete'); expect(result.satisfied).toEqual(spans(test.satisfied));
  });
  it('zero orb admits exact contacts including same-named bodies across charts', () => {
    const result = evaluateSynastryRule({ ...rule, options: { ...rule.options, maxOrbDegrees: 0 } }, window, natal, runtime(), capability(), options);
    expect(result.status).toBe('complete'); expect(result.satisfied).toEqual(spans(fixture.zeroOrb.satisfied));
    const self = { ...rule, options: { ...rule.options, movingBodies: ['Moon'], natalBodies: ['Moon'] } } as SynastryRule;
    expect(evaluateSynastryRule(self, window, natal, runtime(), capability(), options).satisfied).toEqual(spans([[5, 16]]));
  });
  it('retains inclusive noncollapsed root brackets as unknown', () => {
    const result = evaluateSynastryRule(rule, window, natal, runtime(), capability(events => events.map(e => ({ ...e,
      bracket: [(e.atMs as number) - 1, (e.atMs as number) + 1] }))), options);
    expect(result.status).toBe('unresolved'); expect(normalizeIntervals(result.unresolved)).toEqual(spans(fixture.uncertain.unknown));
    expect(result.satisfied).toEqual(spans(fixture.uncertain.satisfied));
    expect(result.failed).toEqual(spans([[22, 30]]));
  });
  it('sample disagreement makes an omitted transition unresolved', () => {
    expect(evaluateSynastryRule(rule, window, natal, runtime(), capability(() => []), options))
      .toMatchObject({ status: 'unresolved', covered: [], satisfied: [], failed: [], unresolved: [{ reason: 'state-samples-disagree' }] });
  });
  it('resolves one natal chart, keeps its actual fallback, and never resamples its moving epoch', () => {
    const source = runtime(); const asked: unknown[] = [];
    const result = evaluateSynastryRule(rule, window, { ...natal, houseSystem: 'placidus' }, runtime({ chart(request) {
      asked.push(request); const chart = source.chart(request);
      return chart.status === 'ok' ? { ...chart, chart: { ...chart.chart, flags: ['polar-fallback'] } } : chart;
    } }), capability(), options);
    expect(asked).toHaveLength(1); expect(asked[0]).toMatchObject({ time: new Date(-100), houseSystem: 'placidus', timeKnown: true });
    expect(result.natal).toMatchObject({ actualHouseSystem: 'whole', flags: ['polar-fallback'], input: { houseSystem: 'placidus' } });
    expect(result.searches.every(s => s.sourceWindow.startMs === -2 && s.sourceWindow.endMs === 31)).toBe(true);
  });
  it('preserves preferences for later composition without assigning a score', () => {
    const result = evaluateSynastryRule({ ...rule, mode: 'prefer', weight: 2 }, window, natal, runtime(), capability(), options);
    expect(result.rule).toMatchObject({ mode: 'prefer', weight: 2 }); expect(result).not.toHaveProperty('score');
  });
  it('does not mutate or freeze native rows retained by the caller', () => {
    const original = runtime(), rows: unknown[][] = [];
    evaluateSynastryRule(rule, window, natal, runtime({ findInterAspects(a, b) {
      const result = original.findInterAspects(a, b); rows.push(result as unknown[]); return result;
    } }), capability(), options);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(a => !Object.isFrozen(a) && a.every(b => !Object.isFrozen(b)))).toBe(true);
  });
});
describe('synastry refusal, accounting and validation', () => {
  it.each([1, 2, 4, 8, 12])('shares a budget of %i between natal, searches and classifications', maxEvaluations => {
    const result = evaluateSynastryRule(rule, window, natal, runtime(), capability(), { ...options, maxEvaluations });
    expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', evaluations: maxEvaluations, satisfied: [], covered: [] });
    expect(result.receipts).toHaveLength(maxEvaluations);
  });
  it('preserves receipts on cancellation during natal and moving requests', () => {
    for (const phase of ['natal', 'moving']) {
      const controller = new AbortController(), source = runtime();
      const result = evaluateSynastryRule(rule, window, natal, runtime({ chart(request) {
        const value = source.chart(request); if (phase === 'natal') controller.abort(); return value;
      }, calc(request) { const value = source.calc(request); if (phase === 'moving') controller.abort(); return value; } }), capability(), { ...options, signal: controller.signal });
      expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: phase === 'natal' ? 1 : 2, satisfied: [] });
      expect(result.receipts).toHaveLength(result.evaluations);
      expect(evaluateSynastryRule(rule, window, natal, runtime(), capability(), { ...options, signal: controller.signal }))
        .toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 0 });
    }
  });
  it('missing capability is an explicit refusal before any chart work', () => {
    expect(evaluateSynastryRule(rule, window, natal, runtime(), { status: 'missing' }, options))
      .toMatchObject({ status: 'refused', reason: 'missing-capability', evaluations: 0, natal: null });
    const cap = capability(); delete (cap as { runtime: { searchLongitudeCrossings?: unknown } }).runtime.searchLongitudeCrossings;
    expect(evaluateSynastryRule(rule, window, natal, runtime(), cap, options)).toMatchObject({ status: 'refused', reason: 'missing-capability' });
  });
  it.each(['chart', 'calc'] as const)('preserves native %s refusal details and throws unexpected source errors', method => {
    const refusal = { status: 'refused' as const, reason: 'coverage', detail: 'synthetic refusal' };
    expect(evaluateSynastryRule(rule, window, natal, runtime({ [method]: () => refusal }), capability(), options))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', detail: refusal, evaluations: method === 'chart' ? 1 : 2 });
    expect(() => evaluateSynastryRule(rule, window, natal, runtime({ [method]: () => { throw new Error('source broke'); } }), capability(), options)).toThrow('source broke');
  });
  it('validates synthetic natal data and rules before capability handling', () => {
    for (const input of [undefined, [natal], { ...natal, synthetic: false }, { ...natal, clock: 'tt' }, { ...natal, instant: '2000-02-30T00:00:00Z' },
      { ...natal, location: { latitude: 91, longitude: 0 } }, { ...natal, extra: 'forbidden' }]) {
      expect(() => evaluateSynastryRule(rule, window, input as SyntheticNatal, runtime(), { status: 'missing' }, options)).toThrow(RuleValidationError);
    }
    expect(() => evaluateSynastryRule({ ...rule, kind: 'moon-sign' } as never, window, natal, runtime(), { status: 'missing' }, options)).toThrow();
    for (const bad of [{ ...options, stepMs: 0 }, { ...options, maxEvaluations: Infinity }, { ...options, extra: 1 }, { ...options, signal: {} }]) {
      expect(() => evaluateSynastryRule(rule, window, natal, runtime(), { status: 'missing' }, bad as typeof options)).toThrow();
    }
    expect(() => evaluateSynastryRule(rule, { ...window, clock: 'tai' as never }, natal, runtime(), { status: 'missing' }, options)).toThrow();
  });
  it('refuses unrepresentable padding and degenerate natal angles', () => {
    expect(evaluateSynastryRule(rule, { ...window, startMs: -8640000000000000, endMs: -8639999999999990 }, natal, runtime(), capability(), options))
      .toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
    expect(evaluateSynastryRule(rule, window, { ...natal, location: { latitude: 90, longitude: 0 } }, runtime(), capability(), options))
      .toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
  });
  it('rejects broken native metadata, missing/duplicate bodies and malformed aspect rows', () => {
    expect(() => evaluateSynastryRule(rule, window, natal, runtime({ INTER_ASPECT_DEFINITIONS: [] }), capability(), options)).toThrow('Incompatible native');
    const source = runtime();
    for (const bodies of [[], [{ body: 'Sun', lon: 60, speed: 1 }, { body: 'Sun', lon: 60, speed: 1 }]]) {
      expect(() => evaluateSynastryRule(rule, window, natal, runtime({ chart(request) {
        const value = source.chart(request); if (value.status !== 'ok') return value;
        return { ...value, chart: { ...value.chart, bodies } };
      } }), capability(), options)).toThrow('Missing or duplicate');
    }
    for (const row of [{ a: 'Node', aLon: 60, b: 'Sun', bLon: 60, type: 'conjunction', orb: 0 },
      { a: 'Moon', aLon: NaN, b: 'Sun', bLon: 60, type: 'conjunction', orb: 0 },
      { a: 'Moon', aLon: 50, b: 'Sun', bLon: 60, type: 'conjunction', orb: NaN }]) {
      expect(() => evaluateSynastryRule(rule, window, natal, runtime({ findInterAspects: () => [row] as never }), capability(), options)).toThrow('Invalid native inter-aspect');
    }
    expect(() => evaluateSynastryRule(rule, window, natal, runtime(), capability(events => events.map(e => ({ ...e, clock: 'tt' }))), options)).toThrow('Invalid derived crossing');
  });
  it('refuses an unrepresentable shifted speed coordinate with completed provenance intact', () => {
    const source = runtime();
    const result = evaluateSynastryRule(rule, window, natal, runtime({ calc(req) {
      const value = source.calc(req);
      return value.status === 'ok' && req.flags.speeds ? { ...value, speeds: { lon: 180 } } : value;
    } }), capability(), options);
    expect(result).toMatchObject({ status: 'refused', reason: 'coverage', detail: 'moving-speed-coordinate-out-of-range', satisfied: [], covered: [] });
    expect(result.natal).not.toBeNull(); expect(result.searches).toHaveLength(8);
    expect(result.receipts).toHaveLength(result.evaluations);
  });
});
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let present = false;
try { await access(eventsUrl); present = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function nativeCapability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
describe.runIf(present)('native synastry scanner with hand-derived equations', () => {
  it.each(fixture.cases)('$match set matches exact pair arithmetic through existing scanner', async test => {
    const result = evaluateSynastryRule({ ...rule, options: { ...rule.options, match: test.match } } as SynastryRule,
      window, natal, runtime(), await nativeCapability(), options);
    expect(result.status).toBe('complete'); expect(result.satisfied).toEqual(spans(test.satisfied));
  });
  it('keeps retrograde passages and tangent contacts eligible without a motion filter', async () => {
    for (const shape of ['retrograde', 'tangent'] as const) {
      const input = { ...rule, options: { ...rule.options, movingBodies: ['Moon'], natalBodies: ['Sun'], maxOrbDegrees: shape === 'tangent' ? 0 : 5 } } as SynastryRule;
      const result = evaluateSynastryRule(input, { ...window, endMs: 20 }, natal, runtime({ calc(req) {
        const t = (req.time as Date).getTime();
        return { status: 'ok', lon: shape === 'retrograde' ? 70 - t : 60 + (t - 10) ** 2 / 20, lat: 0, speeds: req.flags.speeds ? { lon: shape === 'retrograde' ? -1 : (t - 10) / 10 } : null, bounds: {}, receipt };
      } }), await nativeCapability(), options);
      expect(result.status).toBe('complete'); expect(result.satisfied).toEqual(spans(shape === 'tangent' ? [[10, 11]] : [[5, 16]]));
    }
  });
  it.each(['tt', 'ut1'] as const)('keeps natal UTC distinct from the moving %s clock', async clock => {
    const source = runtime(), asked: unknown[] = [];
    const result = evaluateSynastryRule(rule, { ...window, clock }, natal, runtime({ calc(req) { asked.push(req.time); return source.calc(req); } }), await nativeCapability(), options);
    expect(result.window.clock).toBe(clock); expect(result.natal?.clock).toBe('utc');
    expect(result.searches.every(s => s.sourceWindow.clock === clock)).toBe(true);
    expect(asked.every(t => !(t instanceof Date) && (t as { scale: string }).scale === clock)).toBe(true);
  });
  it.each([['conjunction', 0], ['sextile', 60], ['square', 90], ['trine', 120], ['opposition', 180]] as const)
   ('selects a stationary exact %s without assigning natal motion', async (type, angle) => {
      const input = { ...rule, options: { ...rule.options, movingBodies: ['Moon'], natalBodies: ['Sun'], aspects: [type], maxOrbDegrees: 0 } } as SynastryRule;
      const result = evaluateSynastryRule(input, window, natal, runtime({ calc(req) {
        return { status: 'ok', lon: 60 + angle, lat: 0, speeds: req.flags.speeds ? { lon: 0 } : null, bounds: {}, receipt };
      } }), await nativeCapability(), options);
      expect(result).toMatchObject({ status: 'complete', satisfied: spans([[0, 30]]), failed: [] });
    });
});
describe('native synastry policy delegation', () => {
  it('caps rather than widens native orbs, including the luminary allowance', () => {
    const input = { ...rule, options: { ...rule.options, aspects: ['sextile'], maxOrbDegrees: 180 } } as SynastryRule;
    const result = evaluateSynastryRule(input, window, natal, runtime(), capability(() => []), options);
    expect(result.policy.pairs.map(p => p.aspects[0]?.effectiveOrbDegrees)).toEqual([5, 5, 5, 4]);
    expect(result.policy.nativeDefinitions).toEqual(real.INTER_ASPECT_DEFINITIONS);
    const low = evaluateSynastryRule({ ...input, options: { ...input.options, maxOrbDegrees: 2 } }, window, natal, runtime(), capability(() => []), options);
    expect(low.policy.pairs.every(p => p.aspects[0]?.effectiveOrbDegrees === 2)).toBe(true);
    expect(real.findInterAspects([{ body: 'Moon', lon: 55 }], [{ body: 'Sun', lon: 0 }])).toMatchObject([{ type: 'sextile', orb: 5 }]);
    expect(real.findInterAspects([{ body: 'Venus', lon: 55 }], [{ body: 'Jupiter', lon: 0 }])).toEqual([]);
  });
  it('does not freeze caller rows returned by the native helper', () => {
    const rows = real.findInterAspects([{ body: 'Moon', lon: 60 }], [{ body: 'Sun', lon: 60 }]);
    expect(Object.isFrozen(rows)).toBe(false);
  });
});
