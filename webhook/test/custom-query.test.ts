import { describe, expect, it, vi } from 'vitest';
import { calc } from '../../src/calc.js';
import type { CalcPosition, CalcRefusal, CalcRequest } from '../../src/calc.js';
import { describeEventSearch, searchEvents } from '../src/event-search.js';
import type { DiscoveredEvent, EventSearchDependencies, EventSearchRequest, EventSearchResult } from '../src/event-search-types.js';
import { occurrencePolicy } from '../src/occurrence.js';
import { parseEventFilter, parseSubscription, SubscriptionValidationError } from '../src/subscription.js';
import type { EventBody, EventFilter } from '../src/types.js';
import { EngineRefused } from '../vendor/events/src/engine.js';
import { parseQuery } from '../vendor/events/src/query.js';

// Invented motion and shadow geometry exercise integration, not physical accuracy.
const BASE = Date.parse('2000-01-01T00:00:00.000Z');
const DAY = 86_400_000;
const iso = (offset: number): string => new Date(BASE + offset).toISOString();
const wrap = (value: number): number => ((value % 360) + 360) % 360;
const expression = (event = 'Mercury ingresses into Taurus'): string =>
  `all ${event} from 2000-01-01 to 2000-01-02`;
const filter = (event?: string): EventFilter => ({ kind: 'custom', expression: expression(event) });
const request = (event?: string, start = 0, end = 10_000): EventSearchRequest => ({
  filter: filter(event), window: { start: iso(start), end: iso(end) }, stepMs: 1000, maxEvaluations: 10_000,
});
function complete(result: EventSearchResult): readonly DiscoveredEvent[] {
  expect(result.status).toBe('complete');
  if (result.status !== 'complete') throw new Error(`Unexpected refusal: ${result.reason}`);
  return result.events;
}
type Motion = (body: EventBody, offset: number) => { longitude: number; speedDegreesPerDay: number | null };
function motion(source: Motion): NonNullable<EventSearchDependencies['motion']> {
  return context => ({ context, sample: (body, atMs) => context.evaluate(() => source(body, atMs - BASE)) });
}
const ingressMotion = (root = 5000, rate = 1) => motion((_body, t) => ({
  longitude: wrap(30 + rate * (t - root) / 1000), speedDegreesPerDay: rate * 86_400,
}));
const squareMotion = motion((body, t) => ({
  longitude: wrap(10 + (body === 'Mars' ? 0.03 * t : 0)),
  speedDegreesPerDay: body === 'Mars' ? 2_592_000 : 0,
}));
const eclipse = {
  model: { sunRadiusAu: 0.1, moonRadiusAu: 0.005, earthRadiusAu: 0.02 }, derivativeStepMs: 100,
};
function shadow(x: number): NonNullable<EventSearchDependencies['eclipse']> {
  return context => ({ sample: atMs => context.evaluate(() => ({
    sun: [100, 0, 0] as const, moon: [x, (atMs - BASE - 5000) / 1_000_000, 0] as const,
  })) });
}

describe('bounded custom filter validation', () => {
  it.each([
    expression('Mars square Sun'), expression('Moon conjunction Sun'),
    expression('Mercury ingresses'), expression('Mercury ingresses into Taurus'),
    expression('Mercury stations'), expression('Mercury stations direct'),
    expression('Mercury stations retrograde'), expression('solar eclipses'), expression('lunar eclipses'),
    `${expression()} clock utc`, 'ALL MERCURY INGRESSES 2000-2001 CLOCK UTC',
  ])('accepts a supported bounded point query: %s', text => {
    const input = { kind: 'custom', expression: text };
    expect(parseEventFilter(input)).toEqual(input);
    expect(parseSubscription({ callbackUrl: 'https://callbacks.example/events', secretRef: 'runtime_key_ref',
      filter: input, window: request().window }).filter).toEqual(input);
  });

  it.each([
    'next Mercury ingresses', 'next Mercury ingresses from 2000-01-01 to 2000-01-02',
    'all Mercury ingresses', expression('Mars square natal Sun'), expression('Mercury retrogrades'),
    expression('Mercury retrogrades in Taurus'),
    expression('void-of-course Moon with Sun , Mars aspects conjunction , square'),
    expression('Sun stations'), expression('Moon stations'), `${expression()} clock ut1`, `${expression()} clock tt`,
    'all Mercury ingresses from 2000-02-30 to 2000-03-02',
    'all Mercury ingresses from 2000-01-02 to 2000-01-01',
    expression('Mars square Mars'), expression('Chiron ingresses'),
    `${expression()} ; PRIVATE_CALLBACK_TEXT`, `${expression()} ${'x '.repeat(129)}`,
    'x'.repeat(4097), '\ud800',
  ])('rejects unsupported or malformed input without echoing it: %s', text => {
    const rejected = { kind: 'custom', expression: text };
    for (const action of [
      () => parseEventFilter(rejected),
      () => parseSubscription({ callbackUrl: 'https://callbacks.example/events', secretRef: 'runtime_key_ref',
        filter: rejected, window: request().window }),
    ]) {
      try { action(); throw new Error('Expected expression validation to fail.'); }
      catch (error) {
        expect(error).toBeInstanceOf(SubscriptionValidationError);
        expect(error).toMatchObject({ field: 'filter.expression', message: 'Invalid subscription field: filter.expression.' });
      }
    }
  });
});

describe('custom point execution and receipts', () => {
  it('executes both directed square branches and preserves the upstream named aspect', () => {
    const result = searchEvents(request('Mars square Sun', 0, 12_000), { motion: squareMotion });
    const events = complete(result);
    expect(events.map(event => [event.kind, event.at])).toEqual([
      ['custom', iso(3000)], ['custom', iso(9000)],
    ]);
    expect(events.map(event => event.definition)).toMatchObject([
      { kind: 'exact-aspect', aspect: { id: 'square', angleDegrees: 90 }, relativeLongitude: 90,
        target: { kind: 'moving', body: 'Sun' }, clock: 'utc' },
      { kind: 'exact-aspect', aspect: { id: 'square', angleDegrees: 90 }, relativeLongitude: 270 },
    ]);
    expect(events.map(event => event.positions.map(position => position.body))).toEqual([
      ['Mars', 'Sun'], ['Mars', 'Sun'],
    ]);
    expect(result.search.custom).toEqual({
      schema: 'zodiacs.webhook-custom.v1', query: parseQuery(expression('Mars square Sun')),
      effectiveWindow: request('Mars square Sun', 0, 12_000).window, intervals: 'refused',
    });
  });

  it.each([['direct', 1, 'Taurus'], ['retrograde', -1, 'Aries']] as const)(
    'executes unrestricted and destination-selected %s ingresses', (direction, rate, sign) => {
      const dependencies = { motion: ingressMotion(5000, rate) };
      const all = complete(searchEvents(request('Mercury ingresses'), dependencies));
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ kind: 'custom', at: iso(5000), definition: {
        kind: 'sign-ingress', direction, toSign: sign,
      } });
      expect(complete(searchEvents(request(`Mercury ingresses into ${sign}`), dependencies))).toEqual(all);
      expect(complete(searchEvents(request('Mercury ingresses into Cancer'), dependencies))).toEqual([]);
    },
  );

  it.each([['direct', 1], ['retrograde', -1]] as const)(
    'executes %s stations and captures speed receipts', (direction, rate) => {
      const dependencies = { motion: motion((_body, t) => ({
        longitude: 45, speedDegreesPerDay: rate * (t - 5000) / 1000,
      })) };
      const events = complete(searchEvents(request(`Mercury stations ${direction}`), dependencies));
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: 'custom', at: iso(5000), definition: { kind: 'station', direction } });
      expect(events[0]!.positions[0]!.receipt.request.flags?.speeds).toBe(true);
      expect(complete(searchEvents(request('Mercury stations'), dependencies))).toEqual(events);
      expect(complete(searchEvents(request(`Mercury stations ${direction === 'direct' ? 'retrograde' : 'direct'}`),
        dependencies))).toEqual([]);
    },
  );

  it.each([['solar', 1], ['lunar', -1]] as const)('executes %s eclipse points with explicit geometry', (kind, x) => {
    const result = searchEvents({ ...request(`${kind} eclipses`), eclipse }, { eclipse: shadow(x) });
    const events = complete(result);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'custom', at: iso(5000), definition: {
      kind, definition: 'minimum-shadow-axis-distance', model: eclipse.model,
    } });
    expect(events[0]!.positions.map(position => position.body)).toEqual(['Sun', 'Moon']);
    expect(events[0]!.positions.every(position => position.receipt.request.flags?.cartesian === true)).toBe(true);
    expect(result.search.eclipse).toEqual(eclipse);
    expect(() => searchEvents(request(`${kind} eclipses`))).toThrow();
  });

  it('requires eclipse options only for eclipse point expressions', () => {
    expect(() => searchEvents({ ...request(), eclipse })).toThrow();
    expect(() => searchEvents({ ...request('solar eclipses'), eclipse: { ...eclipse, derivativeStepMs: 0 } })).toThrow();
  });

  it('captures every engine receipt field without sharing mutable references', () => {
    const originals: CalcPosition[] = [];
    const calls: CalcRequest[] = [];
    const calculate: typeof calc = input => {
      calls.push(input);
      const result = calc(input);
      if (result.status === 'ok') originals.push(result);
      return result;
    };
    const result = searchEvents(request(), { motion: ingressMotion(), calculate });
    const event = complete(result)[0]!;
    const position = event.positions[0]!;
    expect(calls).toHaveLength(1);
    expect(position).toEqual(originals[0]);
    expect(position).not.toBe(originals[0]);
    expect(position.receipt).not.toBe(originals[0]!.receipt);
    expect(position.receipt).toMatchObject({ schema: 'zodiacs.calc-receipt.v1',
      engine: { name: '@zodiacs/engine', ephemeris: { name: 'astronomy-engine', version: '2.1.19' } } });
    expect(position.receipt.request.time).toEqual({ iso: iso(5000) });
    for (const object of [result, result.search.custom, result.search.custom?.query,
      result.search.custom?.effectiveWindow, event, event.definition, position, position.receipt]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
    Reflect.set(originals[0]!.receipt.engine, 'version', 'synthetic-mutation');
    expect(position.receipt.engine.version).not.toBe('synthetic-mutation');
  });
});

describe('schedule intersection and stable root ownership', () => {
  it('includes an event exactly at the DSL start when the schedule begins earlier', () => {
    const result = searchEvents(request(undefined, -5000, 7000), { motion: ingressMotion(0) });
    expect(complete(result).map(event => event.at)).toEqual([iso(0)]);
    expect(result.search.custom?.effectiveWindow).toEqual({ start: iso(0), end: iso(7000) });
  });

  it('clips the query range to the schedule and records the normalized AST separately', () => {
    const input = request(undefined, -5000, 7000);
    const result = searchEvents(input, { motion: ingressMotion() });
    expect(complete(result).map(event => event.at)).toEqual([iso(5000)]);
    expect(result.search.window).toEqual(input.window);
    expect(result.search.custom).toMatchObject({
      query: parseQuery(expression()), effectiveWindow: { start: iso(0), end: iso(7000) },
    });
    const clipped = searchEvents(request(undefined, 6000, 7000), { motion: ingressMotion() });
    expect(complete(clipped)).toEqual([]);
  });

  it.each([[-10_000, 0], [DAY, DAY + 10_000]])('does no calculation for an empty intersection %s..%s', (start, end) => {
    const makeMotion = vi.fn(ingressMotion());
    const calculate = vi.fn(calc);
    const result = searchEvents(request(undefined, start, end), { motion: makeMotion, calculate });
    expect(complete(result)).toEqual([]);
    expect(result.evaluations).toBe(0);
    expect(result.search.custom?.effectiveWindow).toBeNull();
    expect(makeMotion).not.toHaveBeenCalled();
    expect(calculate).not.toHaveBeenCalled();
  });

  it('excludes the DSL end even when the schedule extends past it', () => {
    const input = request(undefined, DAY - 10_000, DAY + 10_000);
    const result = searchEvents(input, { motion: ingressMotion(DAY) });
    expect(complete(result)).toEqual([]);
    expect(result.search.custom?.effectiveWindow).toEqual({ start: iso(DAY - 10_000), end: iso(DAY) });
    expect(complete(searchEvents(input, { motion: ingressMotion(DAY - 5000) })).map(event => event.at))
      .toEqual([iso(DAY - 5000)]);
  });

  it('bounds evaluation to the owned slice even when the DSL spans many years', () => {
    const dependencies = { motion: ingressMotion() };
    const short = searchEvents(request(), dependencies);
    expect(complete(short)).toHaveLength(1);
    const long = searchEvents({ ...request(), maxEvaluations: short.evaluations,
      filter: { kind: 'custom', expression: 'all Mercury ingresses into Taurus from 1990-01-01 to 2010-01-01' },
    }, dependencies);
    expect(complete(long)).toEqual(complete(short));
    expect(long.evaluations).toBe(short.evaluations);
    expect(long.search.scanWindow).toEqual(short.search.scanWindow);
    expect(long.search.custom?.effectiveWindow).toEqual(request().window);
  });

  it('owns a chunk endpoint once and retains off-grid roots across overlapping slices', () => {
    const dependencies = { motion: ingressMotion(5123.25) };
    const whole = searchEvents(request(undefined, 101, 9876), dependencies);
    const event = complete(whole)[0]!;
    expect(complete(whole)).toHaveLength(1);
    const split = event.atMs - BASE;
    const left = searchEvents(request(undefined, 101, split), dependencies);
    const right = searchEvents(request(undefined, split, 9876), dependencies);
    expect(complete(left)).toEqual([]);
    expect(complete(right)).toEqual(complete(whole));
    expect(complete(searchEvents(request(undefined, 4999, 6137), dependencies))).toEqual(complete(whole));
    for (const result of [whole, left, right]) {
      expect(result.search.gridOriginMs).toBe(0);
      expect(result.search.scanWindow.startMs % result.search.stepMs).toBe(0);
      expect(result.search.scanWindow.endMs % result.search.stepMs).toBe(0);
      expect(result.search.ownership).toBe('[start,end)');
      expect(occurrencePolicy(result.search)).toEqual(occurrencePolicy(whole.search));
    }
    const builtin = describeEventSearch({ ...request(), filter: {
      kind: 'ingress', body: 'Mercury', sign: 'taurus', direction: 'any',
    } });
    expect(occurrencePolicy(whole.search)).not.toEqual(occurrencePolicy(builtin));
  });
});

describe('atomic custom query refusals', () => {
  it('shares the query budget with receipt capture and discards events on late exhaustion', () => {
    const input = request('Mars square Sun', 0, 12_000);
    const full = searchEvents(input, { motion: squareMotion });
    expect(complete(full)).toHaveLength(2);
    const calculate = vi.fn(calc);
    const exhausted = searchEvents({ ...input, maxEvaluations: full.evaluations - 1 }, { motion: squareMotion, calculate });
    expect(exhausted).toMatchObject({ status: 'refused', reason: 'evaluation-budget', events: [],
      evaluations: full.evaluations - 1 });
    expect(calculate).toHaveBeenCalledTimes(3);
    calculate.mockClear();
    expect(searchEvents({ ...input, maxEvaluations: 1 }, { motion: squareMotion, calculate }))
      .toMatchObject({ status: 'refused', reason: 'evaluation-budget', events: [], evaluations: 1 });
    expect(calculate).not.toHaveBeenCalled();
  });

  it('handles cancellation before sampling and during receipt capture without partial events', () => {
    const already = new AbortController();
    already.abort();
    const sample = vi.fn((_body: EventBody, _t: number) => ({ longitude: 20, speedDegreesPerDay: 1 }));
    expect(searchEvents({ ...request(), signal: already.signal }, { motion: motion(sample) }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', events: [], evaluations: 0 });
    expect(sample).not.toHaveBeenCalled();
    const controller = new AbortController();
    let calls = 0;
    const calculate: typeof calc = input => {
      const value = calc(input);
      if (++calls === 2) controller.abort();
      return value;
    };
    expect(searchEvents({ ...request('Mars square Sun', 0, 12_000), signal: controller.signal },
      { motion: squareMotion, calculate })).toMatchObject({ status: 'refused', reason: 'cancelled', events: [] });
    expect(calls).toBe(2);
  });

  it('discards partial executor work when cancellation arrives during sampling', () => {
    const controller = new AbortController();
    let samples = 0;
    const provider = motion((_body, t) => {
      if (++samples === 4) controller.abort();
      return { longitude: wrap(30 + (t - 5000) / 1000), speedDegreesPerDay: 86_400 };
    });
    const calculate = vi.fn(calc);
    expect(searchEvents({ ...request(), signal: controller.signal }, { motion: provider, calculate }))
      .toMatchObject({ status: 'refused', reason: 'cancelled', events: [], evaluations: 4 });
    expect(samples).toBe(4);
    expect(calculate).not.toHaveBeenCalled();
  });

  it('preserves engine refusal details from the executor and receipt calculation', () => {
    const refusal: CalcRefusal = { status: 'refused', reason: 'not-in-this-version', detail: 'Synthetic refusal.' };
    expect(searchEvents(request(), { motion: motion(() => { throw new EngineRefused(refusal); }) }))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', engineRefusal: refusal, events: [] });
    let calls = 0;
    const calculate: typeof calc = input => ++calls === 2 ? refusal : calc(input);
    expect(searchEvents(request('Mars square Sun', 0, 12_000), { motion: squareMotion, calculate }))
      .toMatchObject({ status: 'refused', reason: 'engine-refused', engineRefusal: refusal, events: [] });
    expect(calls).toBe(2);
  });

  it('refuses a clock discontinuity before provider work and propagates unexpected failures', () => {
    const sample = vi.fn((_body: EventBody, _t: number) => ({ longitude: 20, speedDegreesPerDay: 1 }));
    const input = { ...request(), filter: { kind: 'custom',
      expression: 'all Mercury stations from 2016-12-31 to 2017-01-02' } as const,
    window: { start: '2016-12-31T23:59:59.000Z', end: '2017-01-01T00:00:01.000Z' } };
    expect(searchEvents(input, { motion: motion(sample) }))
      .toMatchObject({ status: 'refused', reason: 'time-discontinuity', events: [], evaluations: 0 });
    expect(sample).not.toHaveBeenCalled();
    const failure = new Error('Synthetic provider failure.');
    expect(() => searchEvents(request(), { motion: motion(() => { throw failure; }) })).toThrow(failure);
  });
});

describe('custom execution with the relative-source engine', () => {
  it('matches a builtin Sun ingress search including full engine receipts (integration only)', () => {
    const input: EventSearchRequest = {
      filter: { kind: 'custom', expression: 'all Sun ingresses from 2000-01-01 to 2000-02-01' },
      window: { start: iso(0), end: '2000-02-01T00:00:00.000Z' }, stepMs: DAY / 4, maxEvaluations: 10_000,
    };
    const custom = complete(searchEvents(input));
    const builtin = complete(searchEvents({ ...input,
      filter: { kind: 'ingress', body: 'Sun', sign: 'aquarius', direction: 'any' } }));
    expect(custom).toHaveLength(1);
    expect(custom).toEqual(builtin.map(event => ({ ...event, kind: 'custom' })));
    expect(custom[0]!.positions[0]!.receipt.schema).toBe('zodiacs.calc-receipt.v1');
  });
});
