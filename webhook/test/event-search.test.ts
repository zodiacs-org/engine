import { describe, expect, it, vi } from 'vitest';
import { calc } from '../../src/calc.js';
import type { CalcPosition, CalcRefusal, CalcRequest } from '../../src/calc.js';
import { searchEvents } from '../src/event-search.js';
import type {
  DiscoveredEvent, EventSearchDependencies, EventSearchRequest, EventSearchResult,
} from '../src/event-search-types.js';
import type { EventBody, EventFilter } from '../src/types.js';
import type { EclipseModel, EclipseVectors } from '../vendor/events/src/eclipses.js';
import { EngineRefused } from '../vendor/events/src/engine.js';

// Invented motion and shadow geometry test adapter behavior, not physical accuracy.
const BASE = Date.parse('2000-01-01T12:00:00.000Z');
const iso = (offset: number): string => new Date(BASE + offset).toISOString();
const wrap = (value: number): number => ((value % 360) + 360) % 360;
const ingress: EventFilter = { kind: 'ingress', body: 'Mercury', sign: 'taurus', direction: 'any' };
const aspect: EventFilter = { kind: 'aspect-exact', bodies: ['Mars', 'Sun'], angle: 90 };

function request(filter: EventFilter = ingress, start = 0, end = 10_000): EventSearchRequest {
  return {
    filter, window: { start: iso(start), end: iso(end) }, stepMs: 1000, maxEvaluations: 10_000,
  };
}

function completed(result: EventSearchResult): readonly DiscoveredEvent[] {
  expect(result.status).toBe('complete');
  if (result.status !== 'complete') throw new Error(`Unexpected search refusal: ${result.reason}`);
  return result.events;
}

type Motion = (body: EventBody, offset: number) => {
  longitude: number; speedDegreesPerDay: number | null;
};

function motion(source: Motion): NonNullable<EventSearchDependencies['motion']> {
  return context => ({
    context,
    sample: (body, atMs) => context.evaluate(() => source(body, atMs - BASE)),
  });
}

const directIngress = motion((_body, t) => ({
  longitude: wrap(30 + (t - 5000) / 1000), speedDegreesPerDay: 86_400,
}));
const squareMotion = motion((body, t) => ({
  longitude: wrap(10 + (body === 'Mars' ? 0.03 * t : 0)),
  speedDegreesPerDay: body === 'Mars' ? 2_592_000 : 0,
}));

function capturedCalculations() {
  const positions: CalcPosition[] = [];
  const calls: CalcRequest[] = [];
  const calculate: typeof calc = input => {
    calls.push(input);
    const position = calc(input);
    if (position.status === 'ok') positions.push(position);
    return position;
  };
  return { calculate, calls, positions };
}

// Arbitrary spherical radii in au, intentionally not an astronomical model.
const inventedModel: EclipseModel = { sunRadiusAu: 0.1, moonRadiusAu: 0.005, earthRadiusAu: 0.02 };
function eclipseRequest(type: 'solar' | 'lunar' | 'any', start = 0, end = 10_000): EventSearchRequest {
  return {
    ...request({ kind: 'eclipse', type }, start, end),
    eclipse: { model: inventedModel, derivativeStepMs: 100 },
  };
}
function shadow(x: number, z = 0): NonNullable<EventSearchDependencies['eclipse']> {
  return context => ({
    sample: atMs => context.evaluate((): EclipseVectors => ({
      sun: [100, 0, 0], moon: [x, (atMs - BASE - 5000) / 1_000_000, z],
    })),
  });
}

describe('event search mapping and ownership', () => {
  it.each([
    ['direct', 'taurus', 'Aries', 'Taurus', 1],
    ['retrograde', 'aries', 'Taurus', 'Aries', -1],
  ] as const)('matches the destination sign of a %s ingress', (direction, sign, fromSign, toSign, rate) => {
    const filter: EventFilter = { kind: 'ingress', body: 'Mercury', direction, sign };
    const provider = motion((_body, t) => ({
      longitude: wrap(30 + rate * (t - 5000) / 1000), speedDegreesPerDay: rate * 86_400,
    }));
    const events = completed(searchEvents(request(filter), { motion: provider }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'ingress', at: iso(5000), atMs: BASE + 5000 });
    expect(events[0]!.definition).toEqual({
      kind: 'sign-ingress', body: 'Mercury', atMs: BASE + 5000, clock: 'utc', direction,
      longitude: 30, bracket: [BASE + 5000, BASE + 5000], residualDegrees: 0, fromSign, toSign,
    });
    expect(completed(searchEvents(request({ ...filter, direction: direction === 'direct' ? 'retrograde' : 'direct' }),
      { motion: provider }))).toEqual([]);
    expect(completed(searchEvents(request({ ...filter, sign: 'cancer' }), { motion: provider }))).toEqual([]);
  });

  it('keeps both directed branches of an unsigned exact aspect and both body receipts', () => {
    const captured = capturedCalculations();
    const events = completed(searchEvents(request(aspect, 0, 12_000), {
      motion: squareMotion, calculate: captured.calculate,
    }));
    expect(events.map(event => [event.kind, event.atMs])).toEqual([
      ['aspect-exact', BASE + 3000], ['aspect-exact', BASE + 9000],
    ]);
    expect(events.map(event => event.definition)).toMatchObject([
      { kind: 'exact-aspect', relativeLongitude: 90,
        target: { kind: 'moving', body: 'Sun' }, aspect: { angleDegrees: 90 } },
      { kind: 'exact-aspect', relativeLongitude: 270,
        target: { kind: 'moving', body: 'Sun' }, aspect: { angleDegrees: 90 } },
    ]);
    expect(events.map(event => event.positions.map(position => position.body))).toEqual([
      ['Mars', 'Sun'], ['Mars', 'Sun'],
    ]);
    expect(captured.calls).toHaveLength(4);
    for (const event of events) {
      expect(event.definition.clock).toBe('utc');
      expect(event.definition.bracket).toEqual([event.atMs, event.atMs]);
    }
  });

  it.each([0, 180])('does not duplicate the %s degree aspect branch', angle => {
    const provider = motion((body, t) => ({
      longitude: wrap(20 + (body === 'Mars' ? angle + (t - 5000) / 1000 : 0)),
      speedDegreesPerDay: body === 'Mars' ? 86_400 : 0,
    }));
    expect(completed(searchEvents(request({ ...aspect, angle } as EventFilter), { motion: provider })))
      .toHaveLength(1);
  });

  it('assigns an exact endpoint to only the following adjacent window', () => {
    const left = searchEvents(request(ingress, 0, 5000), { motion: directIngress });
    const right = searchEvents(request(ingress, 5000, 10_000), { motion: directIngress });
    const whole = searchEvents(request(), { motion: directIngress });
    expect(completed(left)).toEqual([]);
    expect(completed(right).map(event => event.atMs)).toEqual([BASE + 5000]);
    expect([...completed(left), ...completed(right)]).toEqual(completed(whole));
  });

  it('keeps the same refined label, bracket and residual across off-grid overlapping windows', () => {
    const provider = motion((_body, t) => ({
      longitude: wrap(30 + (t - 5123.25) / 1000), speedDegreesPerDay: 86_400,
    }));
    const whole = searchEvents(request(ingress, 101, 9876), { motion: provider });
    const overlap = searchEvents(request(ingress, 4999, 6137), { motion: provider });
    expect(completed(whole)).toHaveLength(1);
    expect(completed(overlap)).toEqual(completed(whole));
    const event = completed(whole)[0]!;
    const left = searchEvents(request(ingress, 101, event.atMs - BASE), { motion: provider });
    const right = searchEvents(request(ingress, event.atMs - BASE, 9876), { motion: provider });
    expect([...completed(left), ...completed(right)]).toEqual(completed(whole));
    for (const result of [whole, overlap, left, right]) {
      expect(result.search.gridOriginMs).toBe(0);
      expect(result.search.scanWindow.startMs % result.search.stepMs).toBe(0);
      expect(result.search.scanWindow.endMs % result.search.stepMs).toBe(0);
      expect(result.search.ownership).toBe('[start,end)');
      expect(result.search.completeness).toBe('conditional-on-sampling-assumptions');
    }
  });

  it('suppresses a sampled sign-boundary touch that reverses without entering the sign', () => {
    const provider = motion((_body, t) => ({
      longitude: 30 - ((t - 5000) / 1000) ** 2 / 100, speedDegreesPerDay: null,
    }));
    expect(completed(searchEvents(request(), { motion: provider }))).toEqual([]);
    expect(completed(searchEvents(request(ingress, 0, 5000), { motion: provider }))).toEqual([]);
  });
});

describe('station boundaries', () => {
  it.each([['direct', 1], ['retrograde', -1]] as const)(
    'uses samples beyond the requested endpoint to confirm a %s station at the next start', (direction, rate) => {
      const samples: { atMs: number; speed: boolean | undefined }[] = [];
      const provider: NonNullable<EventSearchDependencies['motion']> = context => ({
        context,
        sample: (_body, atMs, speed) => context.evaluate(() => {
          samples.push({ atMs, speed });
          return { longitude: 45, speedDegreesPerDay: rate * (atMs - BASE - 5000) / 1000 };
        }),
      });
      const filter: EventFilter = { kind: 'station', body: 'Mercury', direction };
      const events = completed(searchEvents(request(filter, 5000, 6000), { motion: provider }));
      expect(events).toHaveLength(1);
      expect(events[0]!.definition).toMatchObject({
        kind: 'station', atMs: BASE + 5000, direction, longitude: 45, residualDegreesPerDay: rate * 0,
      });
      expect(samples.some(sample => sample.atMs < BASE + 5000)).toBe(true);
      expect(samples.some(sample => sample.atMs > BASE + 5000)).toBe(true);
      expect(samples.every(sample => sample.speed === true)).toBe(true);
      expect(events[0]!.positions[0]!.receipt.request.flags?.speeds).toBe(true);
      expect(events[0]!.positions[0]!.bounds.speed).toMatchObject({ method: 'central-difference', stepDays: 0.001 });
      expect(completed(searchEvents(request(filter, 0, 5000), { motion: provider }))).toEqual([]);
      expect(completed(searchEvents(request({ ...filter, direction: direction === 'direct' ? 'retrograde' : 'direct' }),
        { motion: provider }))).toEqual([]);
    },
  );

  it('does not report a zero-speed touch without a sign change', () => {
    const provider = motion((_body, t) => ({ longitude: 45, speedDegreesPerDay: ((t - 5000) / 1000) ** 2 }));
    expect(completed(searchEvents(request({ kind: 'station', body: 'Mercury', direction: 'any' }),
      { motion: provider }))).toEqual([]);
  });
});

describe('explicit eclipse model and geometry', () => {
  it.each([['solar', 1, 'central'], ['lunar', -1, 'total']] as const)(
    'preserves the %s definition and model at a boundary minimum', (type, x, classification) => {
      const captured = capturedCalculations();
      const result = searchEvents(eclipseRequest(type, 5000, 7000), {
        eclipse: shadow(x), calculate: captured.calculate,
      });
      const events = completed(result);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: 'eclipse', at: iso(5000), atMs: BASE + 5000 });
      expect(events[0]!.definition).toMatchObject({
        kind: type, classification, forward: true, axisDistanceAu: 0,
        definition: 'minimum-shadow-axis-distance', model: inventedModel, clock: 'utc',
      });
      expect(events[0]!.positions.map(position => position.body)).toEqual(['Sun', 'Moon']);
      expect(captured.calls.every(call => call.flags?.cartesian === true && call.flags.speeds === false)).toBe(true);
      expect(result.search.eclipse).toEqual({ model: inventedModel, derivativeStepMs: 100 });
      expect(completed(searchEvents(eclipseRequest(type, 0, 5000), { eclipse: shadow(x) }))).toEqual([]);
    },
  );

  it('combines the two eclipse searches without losing the kind in the original definition', () => {
    const events = completed(searchEvents(eclipseRequest('any'), { eclipse: shadow(-1) }));
    expect(events).toHaveLength(1);
    expect(events[0]!.definition.kind).toBe('lunar');
  });

  it('discards a solar match when the shared budget expires during the following lunar search', () => {
    const solar = searchEvents(eclipseRequest('solar'), { eclipse: shadow(1) });
    const solarEvents = completed(solar);
    expect(solarEvents).toHaveLength(1);
    const receiptEvaluations = solarEvents.reduce((count, event) => count + event.positions.length, 0);
    const maxEvaluations = solar.evaluations - receiptEvaluations + 1;
    const captured = capturedCalculations();
    const result = searchEvents({ ...eclipseRequest('any'), maxEvaluations }, {
      eclipse: shadow(1), calculate: captured.calculate,
    });
    expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', events: [], evaluations: maxEvaluations });
    expect(captured.calls).toEqual([]);
  });

  it('rejects an axis minimum behind the shadow and a minimum outside the penumbra', () => {
    expect(completed(searchEvents(eclipseRequest('lunar'), { eclipse: shadow(1) }))).toEqual([]);
    expect(completed(searchEvents(eclipseRequest('lunar'), { eclipse: shadow(-1, 0.1) }))).toEqual([]);
  });
});

describe('receipt preservation and complete/refused envelopes', () => {
  it('preserves every engine result and receipt field in a detached frozen envelope', () => {
    const captured = capturedCalculations();
    const original = request();
    const result = searchEvents(original, { motion: directIngress, calculate: captured.calculate });
    const event = completed(result)[0]!;
    const position = event.positions[0]!;
    const sourcePosition = captured.positions[0]!;
    expect(position).toEqual(sourcePosition);
    expect(position).not.toBe(sourcePosition);
    expect(position.receipt).not.toBe(sourcePosition.receipt);
    expect(position.bounds).not.toBe(sourcePosition.bounds);
    expect(position.receipt.schema).toBe('zodiacs.calc-receipt.v1');
    expect(position.receipt.engine).toMatchObject({
      name: '@zodiacs/engine', ephemeris: { name: 'astronomy-engine', version: '2.1.19' },
    });
    expect(position.receipt.request).toMatchObject({
      body: 'Mercury', time: { iso: iso(5000) }, center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical',
      flags: { correction: 'apparent', units: 'degrees', speeds: false },
    });
    expect(position.receipt.instants).toHaveLength(1);
    expect(result.search.coordinates).toEqual({
      center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical', correction: 'apparent', units: 'degrees',
    });
    expect(result.search.source).toEqual({
      repository: 'zodiacs-org/engine', commit: '7d6fb88d03b3896ee1e5496ed99961015d291d3c',
    });
    for (const value of [result, result.events, event, event.definition, event.positions,
      position, position.receipt, position.bounds, result.search, result.search.filter, result.search.window]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(original)).toBe(false);
    expect(Object.isFrozen(sourcePosition)).toBe(false);
    expect(result.search.window).not.toBe(original.window);
    expect(result.search.filter).not.toBe(original.filter);
    const engineVersion = position.receipt.engine.version;
    Reflect.set(sourcePosition.receipt.engine, 'version', 'synthetic-mutation');
    expect(position.receipt.engine.version).toBe(engineVersion);
  });

  it('charges receipt calculations to the search budget and discards all events on late exhaustion', () => {
    const full = searchEvents(request(aspect, 0, 12_000), { motion: squareMotion });
    expect(completed(full)).toHaveLength(2);
    const captured = capturedCalculations();
    const result = searchEvents({ ...request(aspect, 0, 12_000), maxEvaluations: full.evaluations - 1 },
      { motion: squareMotion, calculate: captured.calculate });
    expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', events: [] });
    expect(result.evaluations).toBe(full.evaluations - 1);
    expect(captured.calls).toHaveLength(3);
  });

  it('refuses a budget exhausted while searching without calculating payload receipts', () => {
    const captured = capturedCalculations();
    const result = searchEvents({ ...request(), maxEvaluations: 1 },
      { motion: directIngress, calculate: captured.calculate });
    expect(result).toMatchObject({ status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 1 });
    expect(captured.calls).toEqual([]);
  });

  it('returns a zero-work cancellation and discards work if cancelled during sampling', () => {
    const already = new AbortController();
    already.abort();
    const source = vi.fn((_body: EventBody, _t: number) => ({ longitude: 20, speedDegreesPerDay: 1 }));
    const result = searchEvents({ ...request(), signal: already.signal }, { motion: motion(source) });
    expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', events: [], evaluations: 0 });
    expect(source).not.toHaveBeenCalled();

    const controller = new AbortController();
    let samples = 0;
    const provider = motion((_body, t) => {
      if (++samples === 4) controller.abort();
      return { longitude: wrap(30 + (t - 5000) / 1000), speedDegreesPerDay: 86_400 };
    });
    expect(searchEvents({ ...request(), signal: controller.signal }, { motion: provider }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', events: [], evaluations: 4 });
  });

  it('discards already captured receipts if cancellation arrives during payload capture', () => {
    const controller = new AbortController();
    let calls = 0;
    const calculate: typeof calc = input => {
      const position = calc(input);
      if (++calls === 2) controller.abort();
      return position;
    };
    const result = searchEvents({ ...request(aspect, 0, 12_000), signal: controller.signal },
      { motion: squareMotion, calculate });
    expect(result).toMatchObject({ status: 'refused', reason: 'cancelled', events: [] });
    expect(calls).toBe(2);
  });

  it('preserves an engine refusal from search sampling and from later receipt capture', () => {
    const refusal: CalcRefusal = { status: 'refused', reason: 'not-in-this-version', detail: 'Synthetic refusal.' };
    const provider = motion(() => { throw new EngineRefused(refusal); });
    const sampleResult = searchEvents(request(), { motion: provider });
    expect(sampleResult).toMatchObject({ status: 'refused', reason: 'engine-refused', events: [], engineRefusal: refusal });

    let calls = 0;
    const calculate: typeof calc = input => ++calls === 2 ? refusal : calc(input);
    const receiptResult = searchEvents(request(aspect, 0, 12_000), { motion: squareMotion, calculate });
    expect(receiptResult).toMatchObject({ status: 'refused', reason: 'engine-refused', events: [], engineRefusal: refusal });
    expect(calls).toBe(2);
  });

  it('propagates unexpected provider and receipt calculation errors instead of completing an empty scan', () => {
    const failure = new Error('Synthetic computation failure.');
    expect(() => searchEvents(request(), { motion: motion(() => { throw failure; }) })).toThrow(failure);
    expect(() => searchEvents(request(), {
      motion: directIngress, calculate: () => { throw failure; },
    })).toThrow(failure);
    expect(() => searchEvents(request(), {
      motion: motion(() => ({ longitude: Number.NaN, speedDegreesPerDay: 0 })),
    })).toThrow(RangeError);
  });

  it('refuses a UTC time-basis step before querying the provider', () => {
    const source = vi.fn((_body: EventBody, _t: number) => ({ longitude: 20, speedDegreesPerDay: 1 }));
    const result = searchEvents({ ...request(), window: {
      start: '2016-12-31T23:59:59.000Z', end: '2017-01-01T00:00:01.000Z',
    } }, { motion: motion(source) });
    expect(result).toMatchObject({ status: 'refused', reason: 'time-discontinuity', events: [], evaluations: 0 });
    expect(source).not.toHaveBeenCalled();
  });

  it('reports unsupported custom filters explicitly before the DSL milestone', () => {
    expect(searchEvents(request({ kind: 'custom', expression: 'next Mars square Sun' })))
      .toMatchObject({ status: 'refused', reason: 'unsupported-filter', events: [], evaluations: 0 });
  });
});

describe('malformed event search requests', () => {
  it.each([
    null, [], {},
    { ...request(), stepMs: 0 }, { ...request(), stepMs: 0.5 }, { ...request(), stepMs: Infinity },
    { ...request(), maxEvaluations: 0 }, { ...request(), maxEvaluations: 1.5 },
    { ...request(), maxEvaluations: Infinity }, { ...request(), signal: {} },
    { ...request(), unexpected: true },
    { ...request(), filter: { kind: 'station', body: 'Sun', direction: 'any' } },
    { ...request(), window: { start: iso(0), end: iso(0) } },
    { ...request(), window: { start: '2000-01-01T12:00:00+00:00', end: iso(1000) } },
    { ...request(), window: { start: '2000-02-30T12:00:00Z', end: '2000-03-01T12:00:00Z' } },
    { ...request(), window: { start: iso(0), end: iso(1000), clock: 'tt' } },
    request({ kind: 'eclipse', type: 'solar' }),
    { ...eclipseRequest('solar'), eclipse: { model: inventedModel, derivativeStepMs: 0 } },
    { ...eclipseRequest('solar'), eclipse: { model: { ...inventedModel, earthRadiusAu: -1 }, derivativeStepMs: 100 } },
    { ...eclipseRequest('solar'), eclipse: { model: { ...inventedModel, moonRadiusAu: 0.2 }, derivativeStepMs: 100 } },
  ])('rejects malformed request %# before calling providers', value => {
    const source = vi.fn((_body: EventBody, _t: number) => ({ longitude: 20, speedDegreesPerDay: 1 }));
    expect(() => searchEvents(value as EventSearchRequest, { motion: motion(source) })).toThrow();
    expect(source).not.toHaveBeenCalled();
  });
});
