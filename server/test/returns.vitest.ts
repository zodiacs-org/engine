import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../../src/index.js';
import type { BirthInput } from '../../src/index.js';
import * as receipt from '../../src/receipt.js';
import * as techniques from '../../src/techniques.js';
import type { SolarReturnOptions } from '../../src/techniques.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
// Invented instants and coordinates, unrelated to any person's birth.
const birth = { utc: '2001-02-03T04:05:06.789+05:30', latitude: 23.45, longitude: -67.89 };
const at = '2024-06-07T08:09:10.123-03:00';
const routes = ['/v1/returns/solar', '/v1/returns/lunar'] as const;
type ReturnRoute = typeof routes[number];
const instantField = (route: ReturnRoute) => route === '/v1/returns/solar' ? 'at' : 'after';
const valid = (route: ReturnRoute, natal: BirthInput = birth, instant: string | number = at, options: SolarReturnOptions = {}) => ({
  natal, [instantField(route)]: instant, ...options,
});
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const post = (app: FastifyInstance, url: string, payload: object) => app.inject({ method: 'POST', url, headers, payload });

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}

// These comparisons check HTTP transport and integration with this checkout's
// public engine; they are not independent astronomical accuracy evidence.
function expectReturn(response: LightMyRequestResponse, route: ReturnRoute, natal: BirthInput = birth, instant: string | number = at, options: SolarReturnOptions = {}) {
  expect(response.statusCode).toBe(200);
  const chart = engine.natalChart(natal);
  const result = route === '/v1/returns/solar'
    ? techniques.solarReturn(chart, instant, options) : techniques.lunarReturn(chart, instant, options);
  const contexts = [{ sourceInstant: typeof natal.utc === 'string' ? natal.utc : null }, { sourceInstant: null }];
  const charts = [chart, result.chart];
  const envelopes = charts.map((value, index) => receipt.createNatalEnvelope(value, contexts[index]));
  const body = response.json();
  expect(body).toEqual({
    requestId: response.headers['x-request-id'],
    engine: { name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS },
    data: json({ ...result, natal: chart }),
    receipts: [
      { scope: '/data/natal', envelope: json(envelopes[0]) },
      { scope: '/data/chart', envelope: json(envelopes[1]) },
    ],
  });
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  for (let index = 0; index < charts.length; index++) {
    const parsed = receipt.parseNatalEnvelope(JSON.stringify(body.receipts[index].envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected a readable chart receipt.');
    const replay = engine.natalChart(receipt.natalReplayInput(parsed.envelope));
    expect(receipt.createNatalEnvelope(replay, contexts[index])).toEqual(envelopes[index]);
  }
  return body;
}

function expectFailure(response: LightMyRequestResponse, status = 400, code = 'invalid_request') {
  const messages: Record<string, string> = {
    invalid_request: 'Request is invalid.', unauthorized: 'A valid API key is required.',
    rate_limited: 'API key request limit exceeded.',
    receipt_unavailable: 'The engine could not produce a receipt for this calculation.',
    internal_error: 'Internal server error.',
  };
  expect(response.statusCode).toBe(status);
  expect(response.json()).toEqual({
    requestId: response.headers['x-request-id'],
    engine: { name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS },
    receipts: [], error: { code, message: messages[code] },
  });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('solar and lunar return results and receipts', () => {
  it('enforces the fixed engine search horizons and coarse steps documented by this server', () => {
    expect([
      techniques.SOLAR_RETURN_WINDOW_DAYS, techniques.SOLAR_RETURN_LOOKBACK_DAYS,
      techniques.SOLAR_RETURN_STEP_DAYS,
    ]).toEqual([200, 370, 1]);
    expect([techniques.LUNAR_RETURN_HORIZON_DAYS, techniques.LUNAR_RETURN_STEP_DAYS]).toEqual([40, 0.25]);
  });

  it.each(routes)('%s preserves the entire result, contributing charts and scoped replayable receipts', async (route) => {
    const body = expectReturn(await post(createApp(), route, valid(route)), route);
    expect(body.data.body).toBe(route === '/v1/returns/solar' ? 'Sun' : 'Moon');
    expect(body.data.natalLongitude).toBe(body.data.natal.bodies.find((row: { body: string }) => row.body === body.data.body).lon);
    expect(body.data.chart.input.utc).toBe(body.data.instant);
    expect(body.data.location).toEqual({ latitude: birth.latitude, longitude: birth.longitude });
    expect(body.receipts[0].envelope.receipt.sourceInstant).toBe(birth.utc);
    expect(body.receipts[1].envelope.receipt.sourceInstant).toBeNull();
    expect(body.receipts.map((entry: { scope: string }) => entry.scope)).toEqual(['/data/natal', '/data/chart']);
  });

  it('forwards solar selection and preserves fixed nearest and most-recent windows', async () => {
    const app = createApp();
    const instant = '2024-12-07T08:09:10Z';
    const nearest = expectReturn(await post(app, routes[0], valid(routes[0], birth, instant)), routes[0], birth, instant);
    const options = { selection: 'most-recent' as const };
    const recent = expectReturn(await post(app, routes[0], valid(routes[0], birth, instant, options)), routes[0], birth, instant, options);
    expect(nearest.data.selection).toBe('nearest');
    expect(recent.data.selection).toBe('most-recent');
    expect(Date.parse(nearest.data.instant)).toBeGreaterThan(Date.parse(instant));
    expect(Math.abs(Date.parse(nearest.data.instant) - Date.parse(instant))).toBeLessThanOrEqual(techniques.SOLAR_RETURN_WINDOW_DAYS * 86_400_000);
    expect(Date.parse(recent.data.instant)).toBeLessThanOrEqual(Date.parse(instant));
    expect(Date.parse(recent.data.instant)).toBeGreaterThan(Date.parse(instant) - techniques.SOLAR_RETURN_LOOKBACK_DAYS * 86_400_000);
  });

  it('keeps the first lunar return strictly after the supplied instant, including a prior result', async () => {
    const app = createApp();
    const first = expectReturn(await post(app, routes[1], valid(routes[1])), routes[1]);
    expect(Date.parse(first.data.instant)).toBeGreaterThan(Date.parse(at));
    expect(Date.parse(first.data.instant)).toBeLessThanOrEqual(Date.parse(at) + techniques.LUNAR_RETURN_HORIZON_DAYS * 86_400_000);
    const next = expectReturn(await post(app, routes[1], valid(routes[1], birth, first.data.instant)), routes[1], birth, first.data.instant);
    expect(Date.parse(next.data.instant)).toBeGreaterThan(Date.parse(first.data.instant));
    expect(Date.parse(next.data.instant)).toBeLessThanOrEqual(Date.parse(first.data.instant) + techniques.LUNAR_RETURN_HORIZON_DAYS * 86_400_000);
  });

  it.each(routes)('%s handles inherited, relocated and absent locations without shifting the return instant', async (route) => {
    const app = createApp();
    const natal = { ...birth, houseSystem: 'placidus' as const };
    const home = expectReturn(await post(app, route, valid(route, natal)), route, natal);
    expect(home.data.chart.houses.system).toBe('placidus');
    const awayOptions = { location: { latitude: -32.1, longitude: 143.2 }, houseSystem: 'campanus' as const };
    const away = expectReturn(await post(app, route, valid(route, natal, at, awayOptions)), route, natal, at, awayOptions);
    expect(away.data.chart.houses.system).toBe('campanus');
    expect(away.data.instant).toBe(home.data.instant);
    expect(away.data.chart.bodies).toEqual(home.data.chart.bodies);
    expect(away.data.chart.angles).not.toEqual(home.data.chart.angles);
    for (const [input, options] of [[natal, { location: null }], [{ utc: natal.utc }, {}]] as const) {
      const bare = expectReturn(await post(app, route, valid(route, input, at, options)), route, input, at, options);
      expect(bare.data.location).toBeNull();
      expect(bare.data.chart.angles).toBeNull();
      expect(bare.data.chart.houses).toBeNull();
      expect(bare.data.chart.input.timeKnown).toBe(true);
      expect(bare.receipts[1].envelope.receipt.houses.absenceReason).toBe('missing-location');
      expect(bare.data.instant).toBe(home.data.instant);
    }
  });

  it.each(routes)('%s preserves return polar fallback separately from the natal receipt', async (route) => {
    const options = { location: { latitude: 78.25, longitude: 0 }, houseSystem: 'koch' as const };
    const body = expectReturn(await post(createApp(), route, valid(route, birth, at, options)), route, birth, at, options);
    expect(body.data.natal.flags).toEqual([]);
    expect(body.data.chart.flags).toEqual(['polar-fallback']);
    expect(body.receipts[1].envelope.receipt.houses).toEqual({ requested: 'koch', actual: 'whole', absenceReason: null });
  });

  it.each(routes)('%s keeps UTC, UT1 and TT natal clocks and pins out of the return chart and later requests', async (route) => {
    const app = createApp();
    for (const timeScale of ['utc', 'ut1', 'tt'] as const) {
      const natal = { ...birth, timeScale, deltaT: 123.456 };
      const body = expectReturn(await post(app, route, valid(route, natal)), route, natal);
      expect(body.data.natal.timeScale.input).toBe(timeScale);
      expect(body.data.natal.deltaT).toMatchObject({ model: 'pinned', seconds: 123.456 });
      expect(body.data.chart.timeScale.input).toBe('utc');
      expect(body.data.chart.deltaT.model).not.toBe('pinned');
      expect(body.data.chart.input).not.toHaveProperty('deltaT');
      expect(body.data.chart.input).not.toHaveProperty('timeScale');
    }
    expectReturn(await post(app, route, valid(route)), route);
  });

  it.each(routes)('%s accepts numeric instants with Date millisecond semantics and no invented source spelling', async (route) => {
    const natal = { ...birth, utc: Date.parse(birth.utc) + 0.75 };
    const instant = Date.parse(at) + 0.75;
    const body = expectReturn(await post(createApp(), route, valid(route, natal, instant)), route, natal, instant);
    expect(body.data.natal.input.utc).toBe(new Date(natal.utc).toISOString());
    for (const entry of body.receipts) expect(entry.envelope.receipt.sourceInstant).toBeNull();
  });

  it.each(routes)('%s retains technique flags from search endpoints independently of chart flags', async (route) => {
    const natal = { ...birth, utc: '1901-02-03T04:05:06Z' };
    const instant = route === routes[0] ? '1800-03-01' : '2199-12-01';
    const body = expectReturn(await post(createApp(), route, valid(route, natal, instant)), route, natal, instant);
    expect(body.data.flags).toEqual(['outside-reference-span']);
    expect(body.data.natal.flags).toEqual([]);
    expect(body.data.chart.flags).toEqual([]);
    expect(body.receipts[1].envelope.receipt.resultFlags).toEqual(body.data.chart.flags);
  });

  it('allows solar unknown or ambiguous natal time while always casting a return chart with a known time', async () => {
    const app = createApp();
    for (const flags of [['lmt', 'no-time', 'lmt'], ['dst-gap', 'no-time'], ['dst-fold', 'no-time']] as const) {
      const natal: BirthInput = { ...birth, timeKnown: false, flags: [...flags] };
      const body = expectReturn(await post(app, routes[0], valid(routes[0], natal)), routes[0], natal);
      expect(body.data.natal.flags).toContain('no-time');
      expect(body.data.chart.input.timeKnown).toBe(true);
      expect(body.data.chart.flags).toEqual([]);
      expect(body.data.chart.angles).not.toBeNull();
    }
  });

  it('compares lunar after with the UTC birth instant rather than the displayed TT clock', async () => {
    const natal = { ...birth, utc: '2001-02-03T04:05:06Z', timeScale: 'tt' as const };
    const after = '2001-02-03T04:04:36Z';
    const app = createApp();
    expect(Date.parse(after)).toBeLessThan(Date.parse(natal.utc));
    expectReturn(await post(app, routes[1], valid(routes[1], natal, after)), routes[1], natal, after);
    expectFailure(await post(app, routes[1], valid(routes[1], natal, '2001-02-03T04:03:00Z')));
  });
});

describe('return request validation and bounds', () => {
  it.each(routes)('%s refuses extra controls, wrong types and malformed nested input before engine calls', async (route) => {
    const app = createApp({ rateLimit: { capacity: 200, refillPerSecond: 1 } });
    await app.ready();
    const natal = vi.spyOn(engine, 'natalChart');
    const solar = vi.spyOn(techniques, 'solarReturn');
    const lunar = vi.spyOn(techniques, 'lunarReturn');
    const payload = valid(route);
    for (const input of [{}, birth, { natal: birth }, { [instantField(route)]: at }]) expectFailure(await post(app, route, input));
    expectFailure(await app.inject({ method: 'POST', url: route, headers }));
    for (const field of ['extra', 'body', 'targetLongitude', 'windowDays', 'stepDays', 'maxSamples', 'from', 'to', 'deltaT', 'timeScale', 'options']) {
      expectFailure(await post(app, route, { ...payload, [field]: 1 }));
    }
    for (const input of [null, [], birth.utc, {}, { ...birth, extra: true }, { ...birth, latitude: '23.45' }, { utc: birth.utc, longitude: 10 }, { ...birth, deltaT: 1e10 + 1 }]) {
      expectFailure(await post(app, route, { ...payload, natal: input }));
    }
    for (const instant of [null, true, [], {}, '', 'x'.repeat(41), -8_640_000_000_000_001, 8_640_000_000_000_001]) {
      expectFailure(await post(app, route, { ...payload, [instantField(route)]: instant }));
    }
    for (const location of [false, '23,45', [], {}, { latitude: 1 }, { longitude: 1 }, { latitude: '1', longitude: 1 }, { latitude: 1, longitude: 181 }, { latitude: 91, longitude: 1 }, { latitude: 1, longitude: 1, extra: true }]) {
      expectFailure(await post(app, route, { ...payload, location }));
    }
    for (const houseSystem of [null, 1, true, [], 'Placidus', 'unknown']) expectFailure(await post(app, route, { ...payload, houseSystem }));
    for (const suffix of ['?at=2024-01-02', '?after=2024-01-02', '?unknown=true']) expectFailure(await post(app, route + suffix, payload));
    expect(natal).not.toHaveBeenCalled();
    expect(solar).not.toHaveBeenCalled();
    expect(lunar).not.toHaveBeenCalled();
  });

  it('accepts selection only for solar with its exact supported names', async () => {
    const app = createApp();
    await app.ready();
    const solar = vi.spyOn(techniques, 'solarReturn');
    const lunar = vi.spyOn(techniques, 'lunarReturn');
    for (const selection of [null, false, 1, [], 'latest', 'Nearest']) {
      expectFailure(await post(app, routes[0], { ...valid(routes[0]), selection }));
    }
    for (const selection of ['nearest', 'most-recent']) expectFailure(await post(app, routes[1], { ...valid(routes[1]), selection }));
    expectFailure(await post(app, routes[0], { natal: birth, after: at }));
    expectFailure(await post(app, routes[1], { natal: birth, at }));
    expect(solar).not.toHaveBeenCalled();
    expect(lunar).not.toHaveBeenCalled();
  });

  it.each(routes)('%s rejects raw chart and receipt imports', async (route) => {
    const app = createApp();
    const chart = engine.natalChart(birth);
    for (const natal of [chart, receipt.createNatalEnvelope(chart)]) expectFailure(await post(app, route, { ...valid(route), natal }));
  });

  it.each(routes)('%s sanitizes invalid calendar inputs and windows beyond ephemeris coverage', async (route) => {
    const app = createApp();
    for (const instant of ['2001-02-30', '2001-02-03T24:00:00Z', '2001-02-03T04:05:06', '+030000-01-02T00:00:00Z', 8_640_000_000_000_000]) {
      expectFailure(await post(app, route, valid(route, birth, instant)));
      expectFailure(await post(app, route, valid(route, { ...birth, utc: instant })));
    }
    // The anchor itself is inside the ephemeris span, but its fixed scan is not.
    expectFailure(await post(app, route, valid(route, birth, '3998-08-25')));
    if (route === routes[0]) {
      expectFailure(await post(app, route, valid(route, birth, '0001-06-01')));
      expectFailure(await post(app, route, valid(route, birth, '0002-01-01', { selection: 'most-recent' })));
    }
    expectFailure(await post(app, route, valid(route, { ...birth, flags: ['dst-gap', 'dst-fold'] })));
  });

  it('rejects lunar unknown or ambiguous birth time and a starting instant before birth', async () => {
    const app = createApp();
    for (const natal of [
      { ...birth, timeKnown: false }, { ...birth, flags: ['dst-gap'] as const }, { ...birth, flags: ['dst-fold'] as const },
    ]) expectFailure(await post(app, routes[1], valid(routes[1], natal)));
    expectFailure(await post(app, routes[1], valid(routes[1], birth, '1999-12-31')));
  });

  it.each(routes)('%s rejects explicit exact poles without invoking its return function', async (route) => {
    const app = createApp();
    await app.ready();
    const calculate = vi.spyOn(techniques, route === routes[0] ? 'solarReturn' : 'lunarReturn');
    for (const latitude of [-90, 90]) expectFailure(await post(app, route, valid(route, birth, at, { location: { latitude, longitude: 0 } })));
    expect(calculate).not.toHaveBeenCalled();
  });

  it('rejects inherited untimed natal poles before the solar scan while permitting null and relocated return locations', async () => {
    const app = createApp();
    await app.ready();
    const calculate = vi.spyOn(techniques, 'solarReturn');
    for (const latitude of [-90, 90]) {
      const natal = { ...birth, latitude, timeKnown: false };
      calculate.mockClear();
      expectFailure(await post(app, routes[0], valid(routes[0], natal)));
      expect(calculate).not.toHaveBeenCalled();
      for (const options of [{ location: null }, { location: { latitude: 0, longitude: 180 } }]) {
        expectReturn(await post(app, routes[0], valid(routes[0], natal, at, options)), routes[0], natal, at, options);
      }
    }
  });
});

describe('return protection and failures', () => {
  it('requires authentication and shares the key bucket with existing chart routes before calculation', async () => {
    const app = createApp({ rateLimit: { capacity: 3, refillPerSecond: 1 }, monotonicNow: () => 0 });
    await app.ready();
    const calculate = vi.spyOn(engine, 'natalChart');
    const solar = vi.spyOn(techniques, 'solarReturn');
    const lunar = vi.spyOn(techniques, 'lunarReturn');
    for (const route of routes) expectFailure(await app.inject({ method: 'POST', url: route, payload: valid(route) }), 401, 'unauthorized');
    expect(calculate).not.toHaveBeenCalled();
    expect(solar).not.toHaveBeenCalled();
    expect(lunar).not.toHaveBeenCalled();
    expect((await post(app, '/v1/natal', birth)).statusCode).toBe(200);
    for (const route of routes) expect((await post(app, route, valid(route))).statusCode).toBe(200);
    calculate.mockClear(); solar.mockClear(); lunar.mockClear();
    for (const route of routes) {
      const response = await post(app, route, valid(route));
      expectFailure(response, 429, 'rate_limited');
      expect(response.headers['retry-after']).toBe('1');
    }
    expectFailure(await post(app, '/v1/transits', { natal: birth, at }), 429, 'rate_limited');
    expect(calculate).not.toHaveBeenCalled();
    expect(solar).not.toHaveBeenCalled();
    expect(lunar).not.toHaveBeenCalled();
  });

  it.each(routes)('%s sanitizes calculation refusals and unexpected failures and recovers', async (route) => {
    const app = createApp();
    await app.ready();
    const calculate = vi.spyOn(techniques, route === routes[0] ? 'solarReturn' : 'lunarReturn');
    for (const [error, status, code] of [[new RangeError(randomUUID()), 400, 'invalid_request'], [new Error(randomUUID()), 500, 'internal_error']] as const) {
      calculate.mockImplementationOnce(() => { throw error; });
      const response = await post(app, route, valid(route));
      expectFailure(response, status, code);
      expect(response.body).not.toContain(error.message);
    }
    expectReturn(await post(app, route, valid(route)), route);
  });

  it.each(routes)('%s returns no partial calculation if either chart envelope is refused', async (route) => {
    const app = createApp();
    await app.ready();
    const original = receipt.createNatalEnvelope;
    const create = vi.spyOn(receipt, 'createNatalEnvelope');
    for (const position of [0, 1]) {
      const error = new receipt.NatalEnvelopeError('inconsistent_result');
      error.message = randomUUID();
      if (position === 1) create.mockImplementationOnce(original);
      create.mockImplementationOnce(() => { throw error; });
      const response = await post(app, route, valid(route));
      expectFailure(response, 422, 'receipt_unavailable');
      expect(response.body).not.toContain(error.message);
      expect(response.body).not.toContain('inconsistent_result');
    }
    expectReturn(await post(app, route, valid(route)), route);
  });

  it.each(routes)('%s treats an unexpected return-envelope RangeError as a server error', async (route) => {
    const app = createApp();
    await app.ready();
    const original = receipt.createNatalEnvelope;
    const error = new RangeError(randomUUID());
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(original).mockImplementationOnce(() => { throw error; });
    const response = await post(app, route, valid(route));
    expectFailure(response, 500, 'internal_error');
    expect(response.body).not.toContain(error.message);
  });

  it.each(routes)('%s refuses real receipt-incompatible natal and return geometry', async (route) => {
    const app = createApp();
    const natal = { utc: '2000-01-02T03:04:05Z', latitude: 89.99999999999999, longitude: 0, houseSystem: 'regiomontanus' as const };
    expect(() => receipt.createNatalEnvelope(engine.natalChart(natal))).toThrow(receipt.NatalEnvelopeError);
    expectFailure(await post(app, route, valid(route, natal)), 422, 'receipt_unavailable');
    const options = { location: { latitude: natal.latitude, longitude: natal.longitude }, houseSystem: natal.houseSystem };
    const result = route === routes[0] ? techniques.solarReturn(birth, at, options) : techniques.lunarReturn(birth, at, options);
    expect(() => receipt.createNatalEnvelope(result.chart)).toThrow(receipt.NatalEnvelopeError);
    expectFailure(await post(app, route, valid(route, birth, at, options)), 422, 'receipt_unavailable');
  });

  it('logs outcome metadata without natal inputs, return options, receipts or raw failures', async () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); } });
    const app = createApp({ logger: { level: 'trace', stream } });
    await app.ready();
    const canary = randomUUID();
    for (const route of routes) {
      expect((await post(app, route, valid(route))).statusCode).toBe(200);
      expectFailure(await post(app, route + '?private=' + canary, valid(route)));
      vi.spyOn(techniques, route === routes[0] ? 'solarReturn' : 'lunarReturn').mockImplementationOnce(() => { throw new RangeError(canary); });
      expectFailure(await post(app, route, valid(route)));
      vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw new Error(canary); });
      const response = await post(app, route, valid(route));
      expectFailure(response, 500, 'internal_error');
      expect(response.body).not.toContain(canary);
    }
    await app.close();
    const logs = chunks.join('');
    for (const value of [key, canary, birth.utc, at, 'sourceInstant', 'resultFlags', 'latitude', 'longitude', 'natalLongitude']) expect(logs).not.toContain(value);
    const completed = logs.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((record) => record.event === 'request_completed');
    expect(completed.map((record) => [record.route, record.statusCode])).toEqual(routes.flatMap((route) => [[route, 200], [route, 400], [route, 400], [route, 500]]));
    for (const record of completed) {
      for (const field of ['body', 'data', 'receipts', 'headers', 'url', 'error', 'err']) expect(record).not.toHaveProperty(field);
    }
  });
});
