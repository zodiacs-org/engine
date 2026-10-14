import { describe, expect, it } from 'vitest';
import fixture from './fixtures/hour-windows.json';
import { containsInstant, evaluateHourRule, loadSkyRuntime, normalizeIntervals } from '../src/index.js';
import type { ClockWindow, EngineReceipt, HourRule, NativePlanetaryDay, SkyRuntime } from '../src/index.js';

const DAY = 86_400_000, HOUR = 3_600_000, base = Date.parse(fixture.baseUtc);
const rule: HourRule = { id: 'hour', kind: 'planetary-hour', mode: 'require',
  options: { rulers: ['Sun'], utcOffsetMinutes: 0 } };
const window: ClockWindow = { startMs: base + 5 * HOUR, endMs: base + 8 * HOUR, clock: 'utc' };
const options = { maxEvaluations: 100, maxSamples: 100 };
const receipt: EngineReceipt = { schema: 'hand-derived-contract', request: {}, instants: [{}],
  conventions: ['synthetic-contract-only'], engine: { name: 'stub', version: '0.0.0',
    ephemeris: { name: 'stub', version: '0.0.0' } } };
const order = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'] as const;
const weekdays = fixture.dayRulersSundayFirst as readonly NativePlanetaryDay['ruler'][];

// These canned days subdivide invented marks by the published twelve-part
// definition. They do not calculate a position or search an astronomical event.
function day(date: string, offset: number, status: NativePlanetaryDay['status'] = 'complete',
  marks: readonly number[] = [6, 18, 30]): NativePlanetaryDay {
  const midnight = Date.parse(`${date}T00:00:00Z`) - offset * 60_000;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(), ruler = weekdays[weekday]!;
  const hours = Array.from({ length: 24 }, (_, i) => {
    const start = i < 12 ? marks[0]! : marks[1]!, end = i < 12 ? marks[1]! : marks[2]!;
    return { number: i + 1, period: i < 12 ? 'day' as const : 'night' as const,
      ruler: order[(order.indexOf(ruler) + i) % 7]!,
      start: new Date(midnight + Math.round((start + (i % 12) * (end - start) / 12) * HOUR)),
      end: new Date(midnight + Math.round((start + (i % 12 + 1) * (end - start) / 12) * HOUR)) };
  });
  return { date, utcOffsetMinutes: offset, weekday, ruler,
    conventions: { limb: 'upper', refraction: 'standard', refractionArcmin: 34 }, flags: [], samples: 1, status,
    ...(status === 'refused' ? { reason: 'sample-budget' as const } : {}),
    sunrise: status === 'complete' ? hours[0]!.start : null,
    sunset: status === 'complete' ? hours[11]!.end : null,
    nextSunrise: status === 'complete' ? hours[23]!.end : null, hours: status === 'complete' ? hours : [] };
}
function runtime(completeDates: readonly string[] = ['2000-01-01', '2000-01-02'],
  hook?: (date: string, supplied: Parameters<SkyRuntime['planetaryHours']>[2]) => NativePlanetaryDay): SkyRuntime {
  return { calc(request) {
    expect(request.body).toBe('Sun'); expect(request.time).toBeInstanceOf(Date);
    return { status: 'ok', lon: 1, lat: 0, speeds: null, bounds: {}, receipt };
  }, planetaryHours(observer, date, supplied) {
    expect(observer).toEqual({ latitude: 0, longitude: 0 });
    expect(supplied.limb).toBe('upper'); expect(supplied.refraction).toBe('standard');
    return hook?.(date, supplied) ?? day(date, supplied.utcOffsetMinutes, completeDates.includes(date) ? 'complete' : 'no-sunrise');
  } };
}
const site = { latitude: 0, longitude: 0 };
const spans = (values: readonly (readonly number[])[]) => values.map(([start, end]) => ({ startMs: base + start! * HOUR, endMs: base + end! * HOUR }));

describe('hand-derived planetary-hour golden sets', () => {
  it.each(fixture.cases)('$id', test => {
    const result = evaluateHourRule({ ...rule, options: { rulers: test.rulers as HourRule['options']['rulers'],
      utcOffsetMinutes: test.offsetMinutes } }, { startMs: base + test.rangeHours[0]! * HOUR,
      endMs: base + test.rangeHours[1]! * HOUR, clock: 'utc' }, site, runtime(test.completeDates), options);
    expect(result.status).toBe(test.unknown.length ? 'unresolved' : 'complete');
    expect(result.satisfied).toEqual(spans(test.satisfied));
    expect(result.failed).toEqual(spans(test.failed));
    expect(normalizeIntervals(result.unresolved)).toEqual(spans(test.unknown));
    expect(result.covered).toEqual(normalizeIntervals([...spans(test.satisfied), ...spans(test.failed)]));
    expect(result.evaluations).toBe(result.days.length * 3);
    expect(result.receipts).toHaveLength(result.days.length * 2);
    expect(result.samples).toBe(result.days.length);
    for (const audit of result.days) {
      expect(audit.clock).toBe('utc'); expect(audit.receipts).toHaveLength(2);
      expect(audit.receiptScope).toBe('scan-endpoint-calc-provenance;sky-api-has-no-native-receipt');
    }
  });
  it('preserves exact start and end ownership at a sunrise, sunset and hour handoff', () => {
    for (const [at, ruler] of [[6, 'Sun'], [7, 'Venus'], [18, 'Jupiter'], [30, 'Moon']] as const) {
      const result = evaluateHourRule({ ...rule, options: { ...rule.options, rulers: [ruler] } },
        { startMs: base + at * HOUR - 1, endMs: base + at * HOUR + 1, clock: 'utc' }, site,
        runtime(['2000-01-01', '2000-01-02', '2000-01-03']), options);
      expect(result.satisfied).toEqual([{ startMs: base + at * HOUR, endMs: base + at * HOUR + 1 }]);
      expect(result.failed).toEqual([{ startMs: base + at * HOUR - 1, endMs: base + at * HOUR }]);
    }
  });
  it('retains full source marks while clipping a selected hour to the request', () => {
    const result = evaluateHourRule(rule, { ...window, startMs: base + 6.25 * HOUR, endMs: base + 6.5 * HOUR }, site, runtime(), options);
    expect(result.satisfied).toEqual([{ startMs: base + 6.25 * HOUR, endMs: base + 6.5 * HOUR }]);
    expect(result.days.at(-1)?.hours[0]).toMatchObject({ startMs: base + 6 * HOUR, endMs: base + 7 * HOUR });
  });
  it('records native three-day scan domains and calc provenance at the extra hour guards', () => {
    const instants: number[] = [], native = runtime();
    const result = evaluateHourRule(rule, window, site, { ...native, calc(request) {
      instants.push((request.time as Date).getTime()); return native.calc(request);
    } }, options);
    expect(result.days.map(d => d.date)).toEqual(['1999-12-31', '2000-01-01', '2000-01-02']);
    expect(instants).toEqual(result.days.flatMap(d => [d.sourceWindow.startMs - HOUR, d.sourceWindow.endMs + HOUR]));
    expect(result.days.every(d => d.sourceWindow.endMs - d.sourceWindow.startMs === 3 * DAY)).toBe(true);
  });
  it('uses earlier established hours across a calendar date with no sunrise', () => {
    const result = evaluateHourRule({ ...rule, options: { ...rule.options, rulers: weekdays } },
      { startMs: base + 24 * HOUR, endMs: base + 25 * HOUR, clock: 'utc' }, site,
      runtime([], (date, supplied) => day(date, supplied.utcOffsetMinutes,
        date === '2000-01-01' ? 'complete' : 'no-sunrise', [23, 36, 49])), options);
    expect(result).toMatchObject({ status: 'complete', satisfied: [{ startMs: base + 24 * HOUR, endMs: base + 25 * HOUR }], failed: [], unresolved: [] });
    expect(result.days.map(d => d.date)).toEqual(['2000-01-01', '2000-01-02', '2000-01-03']);
    expect(result.days[0]?.nextSunriseMs).toBe(base + 25 * HOUR);
  });
  it('independently checks Boolean membership for all selected-ruler subsets on an invented Sunday', () => {
    expect(day('2000-01-02', 0).hours.map(hour => hour.ruler)).toEqual(fixture.hourRulersSunday);
    for (let mask = 1; mask < 128; mask++) {
      const rulers = weekdays.filter((_, i) => Boolean(mask & (1 << i)));
      const result = evaluateHourRule({ ...rule, options: { ...rule.options, rulers } },
        { startMs: base + 6 * HOUR, endMs: base + 30 * HOUR, clock: 'utc' }, site, runtime(['2000-01-02']), options);
      for (let i = 0; i < 24; i++) {
        const at = base + (6 + i) * HOUR;
        const accepted = Boolean(mask & (1 << weekdays.indexOf(fixture.hourRulersSunday[i] as NativePlanetaryDay['ruler'])));
        expect(containsInstant(result.satisfied, at)).toBe(accepted);
        expect(containsInstant(result.failed, at)).toBe(!accepted);
        expect(containsInstant(result.unresolved, at)).toBe(false);
      }
    }
  });
  it('returns immutable copies and retains preference weights without mutating inputs or native Dates', () => {
    const native = day('2000-01-02', 0);
    const input = { ...rule, mode: 'prefer' as const, weight: 7 };
    const result = evaluateHourRule(input, window, site, runtime([], (date, supplied) =>
      date === native.date ? native : day(date, supplied.utcOffsetMinutes, 'no-sunrise')), options);
    expect(result.rule).toMatchObject({ mode: 'prefer', weight: 7 });
    expect(Object.isFrozen(result.days[2]?.hours[0])).toBe(true);
    expect(Object.isFrozen(result.receipts[0]?.engine.ephemeris)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false); expect(Object.isFrozen(site)).toBe(false);
    const before = result.days[2]?.sunriseMs;
    native.sunrise!.setTime(0); expect(result.days[2]?.sunriseMs).toBe(before);
  });
});

describe('hour budgets, validation and refusals', () => {
  it.each(['no-sunrise', 'no-sunset', 'no-next-sunrise'] as const)('keeps %s coverage unresolved rather than failed or passing', status => {
    const result = evaluateHourRule(rule, window, site, runtime([], (date, supplied) => day(date, supplied.utcOffsetMinutes, status)), options);
    expect(result).toMatchObject({ status: 'unresolved', satisfied: [], failed: [], covered: [],
      unresolved: [{ startMs: window.startMs, endMs: window.endMs, reason: 'no-complete-solar-day' }] });
    expect(result.days.every(d => d.status === status)).toBe(true);
  });
  it.each(['never-rises', 'never-sets'] as const)('preserves polar flag %s without inventing hours', flag => {
    const result = evaluateHourRule(rule, window, site, runtime([], (date, supplied) => ({ ...day(date, supplied.utcOffsetMinutes, 'no-sunrise'), flags: [flag] })), options);
    expect(result.status).toBe('unresolved'); expect(result.days[0]?.flags).toEqual([flag]);
  });
  it('shares native samples across all days and refuses the whole rule when exhausted', () => {
    const budgets: number[] = [];
    const native = runtime([], (date, supplied) => {
      budgets.push(supplied.maxSamples);
      return { ...day(date, supplied.utcOffsetMinutes, supplied.maxSamples < 3 ? 'refused' : 'no-sunrise'), samples: Math.min(supplied.maxSamples, 3) };
    });
    const result = evaluateHourRule(rule, window, site, native, { ...options, maxSamples: 8 });
    expect(budgets).toEqual([8, 5, 2]);
    expect(result).toMatchObject({ status: 'refused', reason: 'sky-sample-budget', samples: 8, evaluations: 9, satisfied: [], failed: [], covered: [] });
    expect(result.receipts).toHaveLength(6); expect(result.days.at(-1)?.reason).toBe('sample-budget');
    budgets.length = 0;
    expect(evaluateHourRule(rule, window, site, native, { ...options, maxSamples: 6 })).toMatchObject({ status: 'refused', samples: 6, evaluations: 6 });
    expect(budgets).toEqual([6, 3]);
  });
  it('bounds requests across endpoint checks and delegated days without partial success', () => {
    for (let maxEvaluations = 1; maxEvaluations <= 9; maxEvaluations++) {
      const result = evaluateHourRule(rule, window, site, runtime(), { ...options, maxEvaluations });
      expect(result.evaluations).toBe(maxEvaluations);
      expect(result.receipts).toHaveLength(Math.floor(maxEvaluations / 3) * 2 + Math.min(maxEvaluations % 3, 2));
      expect(result.days).toHaveLength(Math.floor(maxEvaluations / 3));
      if (maxEvaluations < 9) expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', satisfied: [], covered: [] });
      else expect(result.status).toBe('complete');
    }
  });
  it('retains sky samples, day audits and receipts when cancellation occurs during a delegated day', () => {
    const controller = new AbortController(); let calls = 0;
    const native = runtime([], (date, supplied) => {
      if (++calls === 2) controller.abort();
      return day(date, supplied.utcOffsetMinutes, 'no-sunrise');
    });
    const result = evaluateHourRule(rule, window, site, native, { ...options, signal: controller.signal });
    expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', samples: 2, evaluations: 6, satisfied: [], covered: [] });
    expect(result.days).toHaveLength(2); expect(result.receipts).toHaveLength(4);
    controller.abort();
    expect(evaluateHourRule(rule, window, site, native, { ...options, signal: controller.signal })).toMatchObject({ status: 'refused', evaluations: 0, samples: 0 });
  });
  it('retains native coverage refusal at a provenance check without calling sky', () => {
    const refusal = { status: 'refused' as const, reason: 'coverage', detail: 'unsupported native instant' };
    const result = evaluateHourRule(rule, window, site, { ...runtime(), calc: () => refusal }, options);
    expect(result).toMatchObject({ status: 'refused', reason: 'engine-refused', detail: refusal, evaluations: 1, samples: 0, days: [], receipts: [] });
  });
  it('preserves endpoint receipts when cancellation occurs during calc', () => {
    const controller = new AbortController();
    const native: SkyRuntime = { ...runtime(), calc() {
      controller.abort(); return { status: 'ok', lon: 1, lat: 0, speeds: null, bounds: {}, receipt };
    } };
    const result = evaluateHourRule(rule, window, site, native, { ...options, signal: controller.signal });
    expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', evaluations: 1, samples: 0, days: [] });
    expect(result.receipts).toHaveLength(1);
  });
  it.each(['tt', 'ut1'] as const)('refuses %s instead of relabelling the native UTC API', clock => {
    expect(evaluateHourRule(rule, { ...window, clock }, site, runtime(), options)).toMatchObject({ status: 'refused', reason: 'unsupported-clock', evaluations: 0, receipts: [] });
  });
  it('refuses unrepresentable calendar padding and fractional-millisecond offsets before work', () => {
    for (const startMs of [-8_640_000_000_000_000, 8_640_000_000_000_000 - 10]) {
      expect(evaluateHourRule(rule, { startMs, endMs: startMs + 10, clock: 'utc' }, site, runtime(), options)).toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
    }
    expect(evaluateHourRule({ ...rule, options: { ...rule.options, utcOffsetMinutes: 1 / 7 } }, window, site, runtime(), options)).toMatchObject({ status: 'refused', reason: 'coverage', evaluations: 0 });
    expect(evaluateHourRule({ ...rule, options: { ...rule.options, utcOffsetMinutes: 0.5 } }, window, site, runtime(), options).status).not.toBe('refused');
  });
  it('validates rules, locations, clocks and budgets before any refusal', () => {
    for (const bad of [{ ...rule, options: { ...rule.options, rulers: ['Pluto'] } }, { ...rule, weight: 1 },
      { ...rule, kind: 'moon-sign', options: { signs: ['taurus'] } }, { ...rule, options: { ...rule.options, utcOffsetMinutes: 1081 } }]) {
      expect(() => evaluateHourRule(bad as HourRule, window, site, runtime(), options)).toThrow();
    }
    for (const bad of [{ latitude: 91, longitude: 0 }, { latitude: 0, longitude: NaN }, { ...site, height: 0 }]) {
      expect(() => evaluateHourRule(rule, window, bad, runtime(), options)).toThrow();
    }
    for (const bad of [{ ...options, maxSamples: 0 }, { ...options, maxSamples: Infinity }, { ...options, maxSamples: 1.5 },
      { ...options, maxEvaluations: 0 }, { ...options, signal: {} }, { ...options, extra: true }]) {
      expect(() => evaluateHourRule(rule, { ...window, clock: 'tt' }, site, runtime(), bad as typeof options)).toThrow();
    }
    expect(() => evaluateHourRule(rule, { ...window, clock: 'tai' } as unknown as ClockWindow, site, runtime(), options)).toThrow();
  });
  it('rejects incompatible native metadata, malformed partitions and overlapping days', () => {
    const good = day('2000-01-02', 0);
    const mutations: Partial<NativePlanetaryDay>[] = [
      { date: '2000-01-01' }, { utcOffsetMinutes: 1 }, { weekday: 7 }, { ruler: 'Pluto' as never },
      { conventions: { ...good.conventions, refractionArcmin: 0 } as never }, { flags: ['unknown' as never] },
      { samples: 1000 }, { samples: -1 }, { samples: 0 }, { weekday: 1 }, { status: 'unexpected' as never }, { reason: 'sample-budget' },
      { sunrise: null }, { sunrise: new Date(NaN) }, { sunrise: new Date(base - 1) },
      { hours: good.hours.slice(1) }, { hours: [{ ...good.hours[0]!, end: good.hours[0]!.start }, ...good.hours.slice(1)] },
      { hours: [{ ...good.hours[0]!, ruler: 'Venus' }, ...good.hours.slice(1)] },
      { hours: [{ ...good.hours[0]!, period: 'night' }, ...good.hours.slice(1)] },
      { hours: [{ ...good.hours[0]!, end: new Date(good.hours[0]!.end.getTime() + 1) }, ...good.hours.slice(1)] },
      { status: 'no-sunrise' },
    ];
    for (const mutation of mutations) {
      expect(() => evaluateHourRule(rule, window, site, runtime([], (date, supplied) =>
        date === good.date ? { ...good, ...mutation } : day(date, supplied.utcOffsetMinutes, 'no-sunrise')), options)).toThrow();
    }
    expect(() => evaluateHourRule(rule, window, site, runtime([], (date, supplied) =>
      day(date, supplied.utcOffsetMinutes, 'complete', [6, 30, 54])), options)).toThrow('Overlapping');
    expect(() => evaluateHourRule(rule, window, site, runtime([], () => { throw new Error('source failure'); }), options)).toThrow('source failure');
  });
});

describe('native planetary-hour delegation', () => {
  it('uses sky hours and engine receipts with the requested fixed date clock', async () => {
    const native = await loadSkyRuntime();
    const result = evaluateHourRule({ ...rule, options: { rulers: ['Venus'], utcOffsetMinutes: 330 } },
      { startMs: Date.parse('2000-09-22T00:00:00Z'), endMs: Date.parse('2000-09-23T00:00:00Z'), clock: 'utc' },
      { latitude: 51.48, longitude: 0 }, native, { maxEvaluations: 20, maxSamples: 10000 });
    expect(result.status).toBe('complete'); expect(result.receipts).toHaveLength(result.days.length * 2);
    expect(result.receipts.every(r => r.engine.ephemeris.name === 'astronomy-engine')).toBe(true);
    expect(result.days.every(d => d.utcOffsetMinutes === 330 && d.receiptScope.includes('sky-api-has-no-native-receipt'))).toBe(true);
    const at = result.satisfied[0]!.startMs;
    const withAt = native as SkyRuntime & { planetaryHourAt(observer: typeof site, at: number,
      options: { utcOffsetMinutes: number }): { hour: { ruler: string; start: Date; end: Date } | null } };
    const actual = withAt.planetaryHourAt({ latitude: 51.48, longitude: 0 }, at, { utcOffsetMinutes: 330 });
    expect(actual.hour?.ruler).toBe('Venus');
    expect(actual.hour!.start.getTime()).toBeLessThanOrEqual(at);
    expect(actual.hour!.end.getTime()).toBeGreaterThan(at);
    // This checks delegation and metadata, not independent astronomical accuracy.
  });
  it.each([
    ['2024-06-21', 'never-sets'], ['2024-12-21', 'never-rises'],
  ])('keeps native polar solar-day gaps unknown: %s', async (date, flag) => {
    const startMs = Date.parse(`${date}T00:00:00Z`);
    const result = evaluateHourRule(rule, { startMs, endMs: startMs + DAY, clock: 'utc' },
      { latitude: 78, longitude: 15 }, await loadSkyRuntime(), { maxEvaluations: 20, maxSamples: 10000 });
    expect(result).toMatchObject({ status: 'unresolved', covered: [], satisfied: [], failed: [] });
    expect(result.days.at(-1)?.flags).toContain(flag);
  });
  it.each([
    ['2024-05-16', 'no-sunset'], ['2024-11-24', 'no-next-sunrise'],
  ])('preserves native partial-polar-day status and unknown tails: %s', async (date, status) => {
    const startMs = Date.parse(`${date}T00:00:00Z`);
    const result = evaluateHourRule({ ...rule, options: { ...rule.options, utcOffsetMinutes: 100 } },
      { startMs, endMs: startMs + DAY, clock: 'utc' }, { latitude: 70, longitude: 25 },
      await loadSkyRuntime(), { maxEvaluations: 20, maxSamples: 10000 });
    expect(result.status).toBe('unresolved');
    expect(result.days.find(d => d.date === date)?.status).toBe(status);
    expect(result.unresolved.length).toBeGreaterThan(0);
    expect(result.unresolved.at(-1)?.endMs).toBe(startMs + DAY);
  });
  it('finds native earlier-day ownership across a clock date with no sunrise', async () => {
    const startMs = Date.parse('2000-03-20T00:00:00Z');
    const result = evaluateHourRule(rule, { startMs, endMs: startMs + DAY, clock: 'utc' },
      { latitude: -65, longitude: 90 }, await loadSkyRuntime(), { maxEvaluations: 20, maxSamples: 10000 });
    expect(result.days.at(-1)).toMatchObject({ status: 'no-sunrise', flags: [] });
    expect(result.status).toBe('complete');
    expect(result.covered).toEqual([{ startMs, endMs: startMs + DAY }]);
  });
  it('refuses unsupported native coverage and native sample exhaustion explicitly', async () => {
    const native = await loadSkyRuntime();
    const old = Date.parse('1700-01-01T00:00:00Z');
    expect(evaluateHourRule(rule, { startMs: old, endMs: old + DAY, clock: 'utc' }, site, native, options))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', samples: 0, covered: [] });
    const result = evaluateHourRule(rule, window, site, native, { maxEvaluations: 20, maxSamples: 1 });
    expect(result).toMatchObject({ status: 'refused', reason: 'sky-sample-budget', satisfied: [], covered: [] });
    expect(result.days.at(-1)?.status).toBe('refused');
    expect(result.samples).toBeLessThanOrEqual(1);
  });
});
