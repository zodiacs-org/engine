import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import fixtures from './fixtures/chart-windows.json';
import { AdapterRefused, ChartAdapter, WorkContext, containsInstant, evaluateChartRule, loadChartRuntime, normalizeIntervals } from '../src/index.js';
import type { ChartRule, ChartRuntime, ClockWindow, EngineReceipt, EventRecord, EventsCapability, EventsRuntime, NativeChart, NativeHousePartition, WorkOptions } from '../src/index.js';

const site = { latitude: 0, longitude: 0 };
const window: ClockWindow = { startMs: 0, endMs: 30, clock: 'utc' };
const options = { maxEvaluations: 2000, stepMs: 1 };
const receipt: EngineReceipt = { schema: 'hand-derived-contract', request: {}, instants: [{}], conventions: ['synthetic-only'],
  engine: { name: 'stub', version: '0.0.0', ephemeris: { name: 'stub', version: '0.0.0' } } };
const angular: ChartRule = { id: 'angular', kind: 'benefic-angular', mode: 'require',
  options: { bodies: ['Venus', 'Jupiter'], angles: ['ascendant'], maxOrbDegrees: 5, match: 'any' } };
const applying: ChartRule = { id: 'applying', kind: 'applying-aspect', mode: 'require',
  options: { body: 'Moon', targets: ['Sun', 'Mercury'], aspects: ['conjunction'], maxOrbDegrees: 5, match: 'any' } };
const house: ChartRule = { id: 'house', kind: 'benefic-house', mode: 'require',
  options: { bodies: ['Venus', 'Jupiter'], houses: [1], match: 'any', polarFallback: 'allow' } };
const wrap = (x: number) => ((x % 360) + 360) % 360;
let real: ChartRuntime;
beforeAll(async () => { real = await loadChartRuntime(); });
function nativeChart(atMs: number): NativeChart {
  return { bodies: [{ body: 'Venus', lon: wrap(10 - atMs), speed: -86_400_000 },
    { body: 'Jupiter', lon: wrap(20 - atMs), speed: -86_400_000 }],
    angles: { asc: 0, mc: 90, dsc: 180, ic: 270 }, houses: { system: 'whole', cusps: Array.from({ length: 12 }, (_, i) => i * 30) }, flags: [] };
}
function partition(): NativeHousePartition {
  return { schema: 'zodiacs.birth-window.v1', start: new Date(0), end: new Date(10), houseSystem: 'placidus', engineVersion: '0.0.0',
    verification: 'hand-derived cells only', flags: ['polar-fallback'], unresolved: [],
    cells: fixtures.houses.cells.map(c => ({ start: new Date(c.range[0]!), end: new Date(c.range[1]!),
      features: { houseSystem: c.system as 'whole' | 'placidus', houses: { Venus: c.Venus, Jupiter: c.Jupiter } } })) };
}
function engine(mutation: Partial<ChartRuntime> = {}): ChartRuntime {
  return { ...real, chart(request) {
      const t = request.time instanceof Date ? request.time.getTime() : Math.round((request.time.jd - 2440587.5) * 86400000);
      const value = nativeChart(t);
      if (request.houseSystem === 'placidus') {
        const cell = fixtures.houses.cells.find(c => t >= c.range[0]! && t < c.range[1]!)!;
        return { status: 'ok', chart: { ...value, houses: { ...value.houses!, system: cell.system as 'whole' | 'placidus' },
          bodies: [{ body: 'Venus', lon: (cell.Venus - 1) * 30 + 1, speed: 1 }, { body: 'Jupiter', lon: (cell.Jupiter - 1) * 30 + 1, speed: 1 }] }, receipt };
      }
      return { status: 'ok', chart: value, receipt };
    },
    calc(request) {
      const t = request.time instanceof Date ? request.time.getTime() : Math.round((request.time.jd - 2440587.5) * 86400000);
      const lon = request.body === 'Moon' ? 50 + t : request.body === 'Sun' ? 60 : 65;
      return { status: 'ok', lon: wrap(lon), lat: 0, speeds: request.flags.speeds ? { lon: request.body === 'Moon' ? 1 : 0 } : null, bounds: {}, receipt };
    }, birthWindow: () => partition(), ...mutation };
}
class Context {
  evaluations = 0;
  constructor(readonly window: ClockWindow, readonly options: WorkOptions) {}
  checkpoint() { if (this.options.signal?.aborted) throw new AdapterRefused('cancelled'); }
  evaluate<T>(run: () => T): T {
    this.checkpoint();
    if (this.evaluations >= this.options.maxEvaluations) throw new AdapterRefused('evaluation-budget');
    this.evaluations++; const value = run(); this.checkpoint(); return value;
  }
}
// These stubs return canned roots from the declared exact linear equations.
// There is no scan, interpolation, bisection or second event solver in them.
function capability(kind: 'angular' | 'applying', hook?: (events: EventRecord[]) => EventRecord[]): EventsCapability {
  let call = 0;
  const runtime = { EvaluationContext: Context,
    searchLongitudeCrossings(ctx: Context, _body: string, target: number, _options: unknown,
      provider: { sample(body: string, at: number): { longitude: number } }) {
      provider.sample('Moon', ctx.window.startMs);
      let roots: number[] = [];
      if (kind === 'angular') {
        const origin = call++ < 2 ? 10 : 20;
        roots = target === 5 ? [origin - 5] : target === 355 ? [origin + 5] : [];
      } else {
        // Each target uses [0,180,355,5] relative-longitude scans, then
        // one relative-speed zero search at target 180. Its speed is nonzero.
        const index = call++, contact = index < 5 ? 10 : 15;
        if (index % 5 !== 4) roots = target === 0 ? [contact] : target === 355 ? [contact - 5] : target === 5 ? [contact + 5] : [];
      }
      const events: EventRecord[] = roots.filter(t => t > ctx.window.startMs && t <= ctx.window.endMs).map(atMs => ({
        kind: 'longitude-crossing', body: 'Moon', longitude: target, atMs, clock: ctx.window.clock,
        bracket: [atMs, atMs], direction: kind === 'angular' ? 'retrograde' : 'direct' }));
      return { status: 'complete', evaluations: ctx.evaluations, events: hook?.(events) ?? events };
    } };
  return { status: 'available', runtime: runtime as unknown as EventsRuntime,
    source: { moduleUrl: 'hand-derived-contract', sha256: 'not-an-artifact' } };
}
const spans = (rows: readonly (readonly number[])[]) => rows.map(([startMs, endMs]) => ({ startMs: startMs!, endMs: endMs! }));

for (const kind of ['angular', 'applying'] as const) describe(`hand-derived ${kind} golden windows`, () => {
  it.each(fixtures[kind].cases)('$match selection', test => {
    const input = kind === 'angular' ? { ...angular, options: { ...angular.options, match: test.match } }
      : { ...applying, options: { ...applying.options, match: test.match } };
    const result = evaluateChartRule(input as ChartRule, window, site, 'whole', engine(), capability(kind), options);
    expect(result.status).toBe('complete');
    expect(result.satisfied).toEqual(spans(test.satisfied)); expect(result.failed).toEqual(spans(test.failed));
    expect(result.receipts).toHaveLength(result.evaluations);
    expect(result.searches.every(s => s.coordinate === 'derived-scalar;native-body-label-is-placeholder')).toBe(true);
    if (kind === 'applying') expect(result.aspectPolicy).toMatchObject({ stationaryRelativeSpeed: 0 });
    else expect(result.aspectPolicy).toBeNull();
    for (let t = 0; t < 30; t++) {
      expect([result.satisfied, result.failed, result.unresolved].filter(s => containsInstant(s, t))).toHaveLength(1);
    }
    expect(Object.isFrozen(result.rule.options)).toBe(true);
    expect(Object.isFrozen(result.searches[0]?.events)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });
});
describe('hand-derived houses and native partition audit', () => {
  it.each(fixtures.houses.cases)('$match and fallback $polarFallback', test => {
    const result = evaluateChartRule({ ...house, options: { ...house.options, match: test.match as 'any' | 'all',
      polarFallback: test.polarFallback as 'allow' | 'reject' } }, { ...window, endMs: 10 }, site, 'placidus', engine(), { status: 'missing' }, options);
    expect(result.status).toBe(test.unknown.length ? 'unresolved' : 'complete');
    expect(result.satisfied).toEqual(spans(test.satisfied)); expect(result.failed).toEqual(spans(test.failed));
    expect(normalizeIntervals(result.unresolved)).toEqual(spans(test.unknown));
    expect(result).toMatchObject({ evaluations: 3, evaluationScope: 'native-api-requests;window-internal-samples-excluded' });
    expect(result.receipts).toHaveLength(2); expect(result.searches).toHaveLength(0);
    expect(result.partitions[0]?.cells).toEqual(fixtures.houses.cells.map(c => ({ startMs: c.range[0], endMs: c.range[1],
      actualSystem: c.system, houses: { Venus: c.Venus, Jupiter: c.Jupiter } })));
    expect(Object.isFrozen(result.partitions[0]?.cells[0]?.houses)).toBe(true);
    expect(result.partitions[0]).toMatchObject({ actualSystems: ['placidus', 'whole'], flags: ['polar-fallback'],
      receiptScope: 'partition-endpoint-chart-provenance;window-api-has-no-native-receipt', internalWork: 'native-fixed-window-budget;sample-count-not-exposed' });
  });
  it('keeps unknown benefic cells and native bound failures out of both passing and failing sets', () => {
    const original = partition(); const nulls = { ...original, cells: original.cells.map((c, i) => i ? c : { ...c, features: { ...c.features, houses: { ...c.features.houses, Venus: null } } }) };
    const result = evaluateChartRule(house, { ...window, endMs: 10 }, site, 'placidus', engine({ birthWindow: () => nulls }), { status: 'missing' }, options);
    expect(normalizeIntervals(result.unresolved)).toEqual(spans([[0, 4]]));
    expect(result.satisfied).toEqual(spans([[4, 10]]));
    const bad = { ...partition(), flags: ['bound-exceeded', 'polar-fallback'] };
    const unknown = evaluateChartRule(house, { ...window, endMs: 10 }, site, 'placidus', engine({ birthWindow: () => bad }), { status: 'missing' }, options);
    expect(unknown).toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
    expect(normalizeIntervals(unknown.unresolved)).toEqual(spans([[0, 10]]));
  });
  it('leaves node-only gaps out of benefic uncertainty', () => {
    const native = { ...partition(), flags: ['node-unresolved', 'polar-fallback'], unresolved: [{ start: new Date(1), end: new Date(2) }] };
    expect(evaluateChartRule(house, { ...window, endMs: 10 }, site, 'placidus', engine({ birthWindow: () => native }), { status: 'missing' }, options).status).toBe('complete');
  });
  it('chunks requests within the native duration limit and preserves seam ownership', () => {
    const calls: number[] = [];
    const source = engine({ chart: () => ({ status: 'ok', chart: { ...nativeChart(0), bodies: [{ body: 'Venus', lon: 1, speed: 1 }, { body: 'Jupiter', lon: 31, speed: 1 }] }, receipt }), birthWindow(req) {
      const a = req.start.getTime(), b = req.end.getTime(); calls.push(b - a);
      return { ...partition(), start: req.start, end: req.end, houseSystem: 'whole', flags: [],
        cells: [{ start: req.start, end: req.end, features: { houseSystem: 'whole', houses: { Venus: 1, Jupiter: 2 } } }] };
    } });
    const result = evaluateChartRule(house, { ...window, endMs: 172800010 }, site, 'whole', source, { status: 'missing' }, options);
    expect(calls).toEqual([172800000, 10]); expect(result.satisfied).toEqual(spans([[0, 172800010]]));
    expect(result.evaluations).toBe(6); expect(result.receipts).toHaveLength(4);
    expect(Object.isFrozen(result.partitions[0]?.actualSystems)).toBe(true);
  });
});
describe('uncertainty, policy edges, budgets and invalid native results', () => {
  it('removes inclusive noncollapsed numerical brackets without rounding them into pass or failure', () => {
    const result = evaluateChartRule(angular, window, site, 'whole', engine(), capability('angular', events =>
      events.map(e => ({ ...e, bracket: [(e.atMs as number) - 1, (e.atMs as number) + 1] }))), options);
    expect(result.status).toBe('unresolved');
    expect(normalizeIntervals(result.unresolved)).toEqual(spans([[4, 7], [14, 17], [24, 27]]));
    expect(result.satisfied).toEqual(spans([[7, 14], [17, 24]]));
  });
  it('marks mismatched classification samples unknown when a source omitted a transition', () => {
    const result = evaluateChartRule(angular, window, site, 'whole', engine(), capability('angular', () => []), options);
    expect(result).toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
    expect(result.unresolved[0]?.reason).toBe('state-samples-disagree');
  });
  it('an inclusive full-circle angular orb needs no event scan', () => {
    const result = evaluateChartRule({ ...angular, options: { ...angular.options, maxOrbDegrees: 180 } }, window, site, 'whole', engine(), capability('angular'), options);
    expect(result).toMatchObject({ status: 'complete', satisfied: spans([[0, 30]]), searches: [], evaluations: 3 });
  });
  it('an exact moving contact is separating and a zero-orb applying rule cannot pass', () => {
    const result = evaluateChartRule({ ...applying, options: { ...applying.options, maxOrbDegrees: 0 } }, window, site, 'whole', engine(), capability('applying', () => []), options);
    expect(result.satisfied).toEqual([]);
  });
  it('large overlapping aspect orbs search closest-aspect handoffs, circle corners and relative stations', () => {
    const input = { ...applying, options: { ...applying.options, targets: ['Sun'], aspects: ['sextile', 'square'], maxOrbDegrees: 180 } } as ChartRule;
    const result = evaluateChartRule(input, { ...window, endMs: 2 }, site, 'whole', engine(), capability('applying', () => []), options);
    expect(result.searches.map(s => s.targetDegrees)).toEqual(expect.arrayContaining([0, 180, 60, 90, 270, 300, 75, 285]));
    expect(result.searches.at(-1)).toMatchObject({ label: 'Moon:Sun:relative-station', targetDegrees: 180 });
  });
  it('uses any selected angle for each body before the body all/any match', () => {
    const result = evaluateChartRule({ ...angular, options: { ...angular.options, angles: ['ascendant', 'midheaven'], match: 'all', maxOrbDegrees: 180 } },
      window, site, 'whole', engine(), capability('angular'), options);
    expect(result.satisfied).toEqual(spans([[0, 30]]));
  });
  it('bounds all seeds, searches and classifications together with all-or-nothing refusals', () => {
    for (const maxEvaluations of [1, 3, 5, 8, 10]) {
      const result = evaluateChartRule(applying, window, site, 'whole', engine(), capability('applying'), { ...options, maxEvaluations });
      expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', evaluations: maxEvaluations, covered: [], satisfied: [] });
      expect(result.receipts).toHaveLength(maxEvaluations);
    }
    for (const maxEvaluations of [1, 2]) {
      expect(evaluateChartRule(house, { ...window, endMs: 10 }, site, 'placidus', engine(), { status: 'missing' }, { ...options, maxEvaluations }))
        .toMatchObject({ status: 'refused', reason: 'evaluation-budget', evaluations: maxEvaluations });
    }
  });
  it('captures receipts on cancellation during a chart request', () => {
    const controller = new AbortController();
    const result = evaluateChartRule(angular, window, site, 'whole', engine({ chart() { controller.abort();
      return { status: 'ok', chart: nativeChart(0), receipt }; } }), capability('angular'), { ...options, signal: controller.signal });
    expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 1, satisfied: [] });
    expect(result.receipts).toHaveLength(1);
    expect(evaluateChartRule(angular, window, site, 'whole', engine(), capability('angular'), { ...options, signal: controller.signal }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 0 });
  });
  it('preserves native refusals and handles the native window budget exception explicitly', () => {
    const refusal = { status: 'refused' as const, reason: 'coverage', detail: 'synthetic refusal' };
    expect(evaluateChartRule(angular, window, site, 'whole', engine({ chart: () => refusal }), capability('angular'), options))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', detail: refusal, evaluations: 1 });
    const error = Object.assign(new Error('native'), { name: 'WindowBudgetError' });
    expect(evaluateChartRule(house, { ...window, endMs: 10 }, site, 'placidus', engine({ birthWindow: () => { throw error; } }), { status: 'missing' }, options))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', detail: 'native-window-budget', evaluations: 3 });
    expect(() => evaluateChartRule(house, { ...window, endMs: 10 }, site, 'placidus', engine({ birthWindow: () => { throw new Error('source broke'); } }), { status: 'missing' }, options)).toThrow('source broke');
  });
  it('reports missing derived-search capability before sampling', () => {
    for (const kind of [angular, applying]) {
      expect(evaluateChartRule(kind, window, site, 'whole', engine(), { status: 'missing' }, options)).toMatchObject({ status: 'refused', reason: 'missing-capability', evaluations: 0 });
      const cap = capability('angular'); delete (cap as { runtime: { searchLongitudeCrossings?: unknown } }).runtime.searchLongitudeCrossings;
      expect(evaluateChartRule(kind, window, site, 'whole', engine(), cap, options)).toMatchObject({ status: 'refused', reason: 'missing-capability', evaluations: 0 });
    }
  });
  it.each(['tt', 'ut1'] as const)('refuses house partition %s without relabelling UTC', clock => {
    expect(evaluateChartRule(house, { ...window, clock }, site, 'whole', engine(), { status: 'missing' }, options))
      .toMatchObject({ status: 'refused', reason: 'unsupported-clock', evaluations: 0 });
  });
  it('validates rule, location, house system and work options before missing or unsupported capability', () => {
    for (const bad of [{ ...options, stepMs: 0 }, { ...options, maxEvaluations: Infinity }, { ...options, signal: {} }, { ...options, extra: 1 }]) {
      expect(() => evaluateChartRule(angular, window, site, 'whole', engine(), { status: 'missing' }, bad as typeof options)).toThrow();
    }
    expect(() => evaluateChartRule({ ...applying, options: { ...applying.options, targets: ['Moon'] } } as ChartRule, window, site, 'whole', engine(), { status: 'missing' }, options)).toThrow();
    expect(() => evaluateChartRule(house, window, { latitude: 91, longitude: 0 }, 'whole', engine(), { status: 'missing' }, options)).toThrow();
    expect(() => evaluateChartRule(house, window, site, 'unknown' as never, engine(), { status: 'missing' }, options)).toThrow();
    expect(evaluateChartRule(angular, { ...window, startMs: -8640000000000000, endMs: -8639999999999990 }, site, 'whole', engine(), capability('angular'), options))
      .toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
    expect(evaluateChartRule(house, window, { latitude: 90, longitude: 0 }, 'whole', engine(), { status: 'missing' }, options)).toMatchObject({ status: 'refused', reason: 'coverage' });
  });
  it('rejects malformed chart rows, receipts and native cell tilings', () => {
    for (const mutation of [{ angles: null }, { houses: null }, { bodies: [{ body: 'Venus', lon: NaN, speed: 1 }] }]) {
      expect(() => evaluateChartRule(angular, window, site, 'whole', engine({ chart: () => ({ status: 'ok', chart: { ...nativeChart(0), ...mutation }, receipt }) }), capability('angular'), options)).toThrow('Invalid native chart');
    }
    for (const mutation of [{ cells: partition().cells.slice(1) }, { flags: [] }, { flags: ['unknown'] }, { engineVersion: '1.2.3' },
      { unresolved: [{ start: new Date(-1), end: new Date(1) }] }]) {
      expect(() => evaluateChartRule(house, { ...window, endMs: 10 }, site, 'placidus', engine({ birthWindow: () => ({ ...partition(), ...mutation }) }), { status: 'missing' }, options)).toThrow();
    }
    expect(() => evaluateChartRule(angular, window, site, 'whole', engine(), capability('angular', e => e.map(v => ({ ...v, bracket: [0, 1] }))), options)).toThrow('Invalid derived bracket');
  });
});

const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let eventsPresent = false;
try { await access(eventsUrl); eventsPresent = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
async function nativeCapability(): Promise<EventsCapability> {
  return { status: 'available', runtime: await import(eventsUrl.href) as EventsRuntime,
    source: { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex') } };
}
describe.runIf(eventsPresent)('native scanner with independently hand-derived linear models', () => {
  it.each(['angular', 'applying'] as const)('%s delegates the synthetic equations to existing longitude search', async kind => {
    const result = evaluateChartRule(kind === 'angular' ? angular : applying, window, site, 'whole', engine(), await nativeCapability(), options);
    expect(result.status).toBe('complete'); expect(result.satisfied).toEqual(spans(fixtures[kind].cases[0]!.satisfied));
  });
  it('uses relative-speed stations to end applying motion at a tangent contact', async () => {
    const source = engine({ calc(request) {
      const t = (request.time as Date).getTime();
      const moon = request.body === 'Moon';
      return { status: 'ok', lon: moon ? 60 + (t - 10) ** 2 / 20 : 60, lat: 0,
        speeds: request.flags.speeds ? { lon: moon ? (t - 10) / 10 : 0 } : null, bounds: {}, receipt };
    } });
    const input = { ...applying, options: { ...applying.options, targets: ['Sun'] } } as ChartRule;
    const result = evaluateChartRule(input, { ...window, endMs: 20 }, site, 'whole', source, await nativeCapability(), options);
    expect(result.status).toBe('complete'); expect(result.satisfied).toEqual(spans([[0, 10]]));
    expect(result.searches.at(-1)?.events[0]?.atMs).toBe(10);
    expect(containsInstant(result.failed, 10)).toBe(true);
  });
  it('delegates real chart angle fields and classifies native angular windows without pinning sky output', async () => {
    const startMs = Date.parse('2000-09-22T00:00:00Z'), endMs = startMs + 86400000;
    const location = { latitude: 51.48, longitude: 0 };
    const input = { ...angular, options: { ...angular.options, bodies: ['Jupiter'], angles: ['ascendant', 'midheaven', 'descendant', 'imum-coeli'] } } as ChartRule;
    const result = evaluateChartRule(input, { startMs, endMs, clock: 'utc' }, location, 'whole', real,
      await nativeCapability(), { maxEvaluations: 5000, stepMs: 600000 });
    expect(['complete', 'unresolved']).toContain(result.status);
    expect(result.satisfied.length).toBeGreaterThan(0);
    for (let t = startMs; t < endMs; t += 300000) {
      if (containsInstant(result.unresolved, t)) continue;
      const sample = new ChartAdapter(new WorkContext({ startMs, endMs, clock: 'utc' }, { maxEvaluations: 1 }), real, location, 'whole').sample(t).chart;
      const row = sample.bodies.find(b => b.body === 'Jupiter')!;
      expect(containsInstant(result.satisfied, t)).toBe(Object.values(sample.angles!).some(a => real.separation(row.lon, a) <= 5));
    }
  });
  it.each(['tt', 'ut1'] as const)('retains the %s clock in derived scans and native requests', async clock => {
    const asked: unknown[] = [], source = engine();
    const runtime = { ...source, chart(request: Parameters<ChartRuntime['chart']>[0]) {
      asked.push(request.time); return source.chart(request);
    } };
    const result = evaluateChartRule(angular, { ...window, clock }, site, 'whole', runtime, await nativeCapability(), options);
    expect(result.window.clock).toBe(clock);
    expect(result.searches.every(s => s.sourceWindow.clock === clock)).toBe(true);
    expect(asked.every(time => !(time instanceof Date) && (time as { scale: string }).scale === clock)).toBe(true);
  });
});
describe('native chart and house API delegation', () => {
  it.each(['whole', 'placidus', 'koch', 'porphyry', 'regiomontanus', 'campanus', 'topocentric', 'alcabitius', 'equal', 'equal-mc', 'vehlow', 'meridian', 'morinus'] as const)('%s uses native chart cusp membership on synthetic location/time', system => {
    const startMs = Date.parse('2000-09-22T06:00:00Z');
    const result = evaluateChartRule(house, { startMs, endMs: startMs + 3600000, clock: 'utc' }, { latitude: 51.48, longitude: 0 }, system, real, { status: 'missing' }, options);
    expect(['complete', 'unresolved']).toContain(result.status); expect(result.receipts).toHaveLength(2);
    expect(result.partitions[0]?.requestedSystem).toBe(system);
    for (let t = startMs; t < startMs + 3600000; t += 60000) {
      const context = new WorkContext({ startMs, endMs: startMs + 3600000, clock: 'utc' }, { maxEvaluations: 1 });
      const value = new ChartAdapter(context, real, { latitude: 51.48, longitude: 0 }, system).sample(t).chart;
      const selected = value.bodies.filter(b => b.body === 'Venus' || b.body === 'Jupiter');
      expect(containsInstant(result.satisfied, t)).toBe(selected.some(b => real.houseOf(b.lon, value.houses!.cusps) === 1));
    }
  });
  it.each(['placidus', 'koch'] as const)('%s exposes native polar fallback with allow and reject semantics', system => {
    const startMs = Date.parse('2000-09-22T06:00:00Z'), domain = { startMs, endMs: startMs + 60000, clock: 'utc' as const };
    for (const polarFallback of ['allow', 'reject'] as const) {
      const result = evaluateChartRule({ ...house, options: { ...house.options, polarFallback } }, domain,
        { latitude: 78, longitude: 15 }, system, real, { status: 'missing' }, options);
      expect(result.partitions[0]).toMatchObject({ actualSystems: ['whole'], flags: ['polar-fallback'] });
      if (polarFallback === 'reject') expect(result).toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [] });
      else expect(result.status).toBe('complete');
    }
  });
});
