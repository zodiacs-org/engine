import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../../src/index.js';
import type { BirthInput, Chart, InterAspect } from '../../src/index.js';
import * as receipt from '../../src/receipt.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
// Invented instants and coordinates, unrelated to any person's birth.
const first = { utc: '2001-02-03T04:05:06.789+05:30', latitude: 23.45, longitude: -67.89 };
const second = { utc: '2003-04-05T06:07:08-00:00', latitude: -32.1, longitude: 143.2 };
const at = '2024-05-06T07:08:09.123-03:00';
const routes = ['/v1/transits', '/v1/synastry'] as const;
type ComparisonRoute = typeof routes[number];
const valid = (route: ComparisonRoute) => route === '/v1/transits'
  ? { natal: first, at } : { a: first, b: second };

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const post = (app: FastifyInstance, url: string, payload: object) => app.inject({
  method: 'POST', url, headers, payload,
});
const context = (input: BirthInput) => ({ sourceInstant: typeof input.utc === 'string' ? input.utc : null });

// Direct-call comparisons verify HTTP transport and integration with this
// checkout's public engine. They are not independent accuracy evidence.
function expectResult(response: LightMyRequestResponse, data: unknown, charts: { scope: string; chart: Chart; input: BirthInput }[]) {
  expect(response.statusCode).toBe(200);
  const envelopes = charts.map(({ scope, chart, input }) => ({ scope, envelope: receipt.createNatalEnvelope(chart, context(input)) }));
  expect(response.json()).toEqual({
    requestId: response.headers['x-request-id'],
    engine: { name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS },
    data: json(data), receipts: json(envelopes),
  });
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  for (let index = 0; index < charts.length; index++) {
    const parsed = receipt.parseNatalEnvelope(JSON.stringify(response.json().receipts[index].envelope));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected a readable chart receipt.');
    const replay = engine.natalChart(receipt.natalReplayInput(parsed.envelope));
    expect(receipt.createNatalEnvelope(replay, context(charts[index]!.input))).toEqual(envelopes[index]!.envelope);
  }
  return response.json();
}

function expectTransits(response: LightMyRequestResponse, natal: BirthInput, instant: string | number) {
  const chart = engine.natalChart(natal);
  const sky = engine.natalChart({ utc: instant });
  const data = { ...engine.transits(chart, instant), sky };
  return expectResult(response, data, [
    { scope: '/data/natal', chart, input: natal },
    { scope: '/data/sky', chart: sky, input: { utc: instant } },
  ]);
}

function expectSynastry(response: LightMyRequestResponse, a: BirthInput, b: BirthInput) {
  const aChart = engine.natalChart(a);
  const bChart = engine.natalChart(b);
  return expectResult(response, engine.synastry(aChart, bChart), [
    { scope: '/data/a', chart: aChart, input: a },
    { scope: '/data/b', chart: bChart, input: b },
  ]);
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

function expectAxes(aspects: InterAspect[], a: Chart['bodies'], b: Chart['bodies']) {
  expect(aspects.length).toBeGreaterThan(0);
  for (let index = 0; index < aspects.length; index++) {
    const aspect = aspects[index]!;
    expect(aspect.aLon).toBe(a.find((body) => body.body === aspect.a)?.lon);
    expect(aspect.bLon).toBe(b.find((body) => body.body === aspect.b)?.lon);
    if (index > 0) expect(aspect.orb).toBeGreaterThanOrEqual(aspects[index - 1]!.orb);
  }
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

it('serves the synthetic transit and synastry examples documented in the server README', async () => {
  const app = createApp();
  const natal = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };
  const instant = '2024-06-07T08:09:10+02:00';
  expectTransits(await post(app, '/v1/transits', { natal, at: instant }), natal, instant);
  const a = { utc: '2001-02-03T04:05:06.789Z', timeKnown: false };
  const b = { utc: '2003-04-05T06:07:08-03:00' };
  expectSynastry(await post(app, '/v1/synastry', { a, b }), a, b);
});

describe('POST /v1/transits results and chart receipts', () => {
  it('preserves the full direct transit result, moving-to-natal axes and replayable contributing charts', async () => {
    const body = expectTransits(await post(createApp(), '/v1/transits', { natal: first, at }), first, at);
    expect(body.data.positions).toEqual(body.data.sky.bodies);
    expectAxes(body.data.aspects, body.data.sky.bodies, body.data.natal.bodies);
    expect(body.data.sky.angles).toBeNull();
    expect(body.data.sky.houses).toBeNull();
    expect(body.receipts[0].envelope.receipt.sourceInstant).toBe(first.utc);
    expect(body.receipts[1].envelope.receipt.sourceInstant).toBe(at);
    expect(body.receipts[1].envelope.receipt.houses.absenceReason).toBe('missing-location');
    expect(body.receipts.map((item: { scope: string }) => item.scope)).not.toContain('/data/aspects');
  });

  it.each(['utc', 'ut1', 'tt'] as const)('keeps the %s natal clock and pin out of the sky clock', async (timeScale) => {
    const app = createApp();
    const natal = { ...first, timeScale, deltaT: 123.456, houseSystem: 'placidus' as const };
    const body = expectTransits(await post(app, '/v1/transits', { natal, at }), natal, at);
    expect(body.data.natal.deltaT).toMatchObject({ model: 'pinned', seconds: 123.456 });
    expect(body.data.sky.input).toEqual({ utc: new Date(at).toISOString(), houseSystem: 'whole', timeKnown: true });
    expect(body.data.sky.timeScale.input).toBe('utc');
    expect(body.data.sky.deltaT.model).not.toBe('pinned');
    expect(body.data.sky.input).not.toHaveProperty('deltaT');
    expectTransits(await post(app, '/v1/transits', { natal: first, at }), first, at);
  });

  it('retains numeric instant semantics and does not invent source spelling', async () => {
    const natal = { ...first, utc: Date.parse(first.utc) + 0.75 };
    const instant = Date.parse(at) + 0.75;
    const body = expectTransits(await post(createApp(), '/v1/transits', { natal, at: instant }), natal, instant);
    expect(body.data.at).toBe(new Date(instant).toISOString());
    for (const item of body.receipts) expect(item.envelope.receipt.sourceInstant).toBeNull();
  });

  it('keeps unknown time and reference-span flags local to the chart that produced them', async () => {
    const natal: BirthInput = { ...first, timeKnown: false, flags: ['lmt', 'no-time', 'lmt'] };
    const instant = '1701-02-03';
    const body = expectTransits(await post(createApp(), '/v1/transits', { natal, at: instant }), natal, instant);
    expect(body.data.natal.flags).toEqual(['lmt', 'no-time']);
    expect(body.data.natal.angles).toBeNull();
    expect(body.data.sky.flags).toEqual(['outside-reference-span']);
    expect(body.receipts[0].envelope.receipt.houses.absenceReason).toBe('unknown-time');
    expect(body.receipts[1].envelope.receipt.resultFlags).toEqual(['outside-reference-span']);
  });
});

describe('POST /v1/synastry results and chart receipts', () => {
  it('preserves complete summaries, caller chart order, aspect axes and source spellings', async () => {
    const app = createApp();
    for (const [a, b] of [[first, second], [second, first]] as const) {
      const body = expectSynastry(await post(app, '/v1/synastry', { a, b }), a, b);
      expectAxes(body.data.aspects, body.data.a.bodies, body.data.b.bodies);
      expect(body.receipts[0].envelope.receipt.sourceInstant).toBe(a.utc);
      expect(body.receipts[1].envelope.receipt.sourceInstant).toBe(b.utc);
      expect(body.data.top).toEqual(body.data.aspects.slice(0, 8));
    }
  });

  it('keeps each time scale and delta T pin independent across both orders and later model calls', async () => {
    const app = createApp();
    const a = { ...first, timeScale: 'tt' as const, deltaT: 123.456 };
    const b = { ...second, utc: Date.parse(second.utc), timeScale: 'ut1' as const, deltaT: -50 };
    for (const [left, right] of [[a, b], [b, a]] as const) {
      const body = expectSynastry(await post(app, '/v1/synastry', { a: left, b: right }), left, right);
      expect(body.data.a.timeScale.input).toBe(left.timeScale);
      expect(body.data.b.timeScale.input).toBe(right.timeScale);
      expect(body.data.a.deltaT.seconds).toBe(left.deltaT);
      expect(body.data.b.deltaT.seconds).toBe(right.deltaT);
    }
    expectSynastry(await post(app, '/v1/synastry', { a: first, b: second }), first, second);
  });

  it('preserves separate requested fallback houses, unknown time and canonical flags', async () => {
    const a: BirthInput = { ...first, latitude: 78.25, houseSystem: 'koch', flags: ['polar-fallback', 'dst-fold'] };
    const b: BirthInput = { ...second, timeKnown: false, flags: ['no-time', 'lmt', 'lmt'] };
    const body = expectSynastry(await post(createApp(), '/v1/synastry', { a, b }), a, b);
    expect(body.data.a.houses.system).toBe('whole');
    expect(body.data.a.flags).toEqual(['dst-fold', 'polar-fallback']);
    expect(body.data.b.houses).toBeNull();
    expect(body.data.b.flags).toEqual(['lmt', 'no-time']);
    expect(body.receipts[0].envelope.receipt.houses).toEqual({ requested: 'koch', actual: 'whole', absenceReason: null });
    expect(body.receipts[1].envelope.receipt.houses.absenceReason).toBe('unknown-time');
  });
});

describe('comparison request validation', () => {
  it.each(routes)('%s requires strict nested birth inputs and rejects query parameters before calculations', async (route) => {
    const app = createApp({ rateLimit: { capacity: 100, refillPerSecond: 1 } });
    await app.ready();
    const calculate = vi.spyOn(engine, 'natalChart');
    const compareTransits = vi.spyOn(engine, 'transits');
    const compareSynastry = vi.spyOn(engine, 'synastry');
    const payload = valid(route);
    for (const input of [{}, first, { ...payload, unknown: true }, { ...payload, deltaT: 12 }, { ...payload, timeScale: 'tt' }]) {
      expectFailure(await post(app, route, input));
    }
    expectFailure(await app.inject({ method: 'POST', url: route, headers }));
    for (const field of route === '/v1/transits' ? ['natal'] : ['a', 'b']) {
      for (const input of [null, [], first.utc, {}, { ...first, latitude: '23.45' }, { ...first, extra: true }, { ...first, latitude: 90 }, { utc: first.utc, longitude: 10 }, { ...first, deltaT: 1e10 + 1 }]) {
        expectFailure(await post(app, route, { ...payload, [field]: input }));
      }
    }
    for (const query of ['?at=2024-01-02', '?a=2001-02-03', '?unknown=true']) {
      expectFailure(await post(app, route + query, payload));
    }
    expect(calculate).not.toHaveBeenCalled();
    expect(compareTransits).not.toHaveBeenCalled();
    expect(compareSynastry).not.toHaveBeenCalled();
  });

  it('rejects raw chart and receipt imports in every birth position', async () => {
    const app = createApp();
    const chart = engine.natalChart(first);
    const envelope = receipt.createNatalEnvelope(chart);
    for (const input of [chart, envelope]) {
      expectFailure(await post(app, '/v1/transits', { natal: input, at }));
      expectFailure(await post(app, '/v1/synastry', { a: input, b: second }));
      expectFailure(await post(app, '/v1/synastry', { a: first, b: input }));
    }
  });

  it('rejects unsupported transit instant types and number/string bounds before calculation', async () => {
    const app = createApp();
    await app.ready();
    const calculate = vi.spyOn(engine, 'natalChart');
    for (const instant of [null, true, [], {}, { utc: at }, '', 'x'.repeat(41), 8_640_000_000_000_001]) {
      expectFailure(await post(app, '/v1/transits', { natal: first, at: instant }));
    }
    expectFailure(await post(app, '/v1/transits', { natal: first }));
    expect(calculate).not.toHaveBeenCalled();
  });

  it('maps invalid calendar and ephemeris inputs in every instant position to sanitized errors', async () => {
    const app = createApp();
    for (const utc of ['2001-02-30', '2001-02-03T04:05:06', '+030000-01-02T00:00:00Z']) {
      const invalid = { ...first, utc };
      expectFailure(await post(app, '/v1/transits', { natal: invalid, at }));
      expectFailure(await post(app, '/v1/transits', { natal: first, at: utc }));
      expectFailure(await post(app, '/v1/synastry', { a: invalid, b: second }));
      expectFailure(await post(app, '/v1/synastry', { a: first, b: invalid }));
    }
    const contradiction = { ...first, flags: ['dst-gap', 'dst-fold'] };
    expectFailure(await post(app, '/v1/transits', { natal: contradiction, at }));
    expectFailure(await post(app, '/v1/synastry', { a: contradiction, b: second }));
    expectFailure(await post(app, '/v1/synastry', { a: first, b: contradiction }));
  });
});

describe('comparison protection and failures', () => {
  it('requires authentication and shares a key allowance across natal, transits and synastry before calculating', async () => {
    const app = createApp({ rateLimit: { capacity: 3, refillPerSecond: 1 }, monotonicNow: () => 0 });
    await app.ready();
    const calculate = vi.spyOn(engine, 'natalChart');
    for (const route of routes) {
      expectFailure(await app.inject({ method: 'POST', url: route, payload: valid(route) }), 401, 'unauthorized');
    }
    expect(calculate).not.toHaveBeenCalled();
    expect((await post(app, '/v1/natal', first)).statusCode).toBe(200);
    for (const route of routes) expect((await post(app, route, valid(route))).statusCode).toBe(200);
    calculate.mockClear();
    for (const route of routes) {
      const limited = await post(app, route, valid(route));
      expectFailure(limited, 429, 'rate_limited');
      expect(limited.headers['retry-after']).toBe('1');
    }
    expectFailure(await post(app, '/v1/natal', first), 429, 'rate_limited');
    expect(calculate).not.toHaveBeenCalled();
  });

  it.each(routes)('%s sanitizes comparison engine refusals and unexpected exceptions', async (route) => {
    const app = createApp();
    await app.ready();
    const compare = vi.spyOn(engine, route === '/v1/transits' ? 'transits' : 'synastry');
    for (const [error, status, code] of [
      [new RangeError(randomUUID()), 400, 'invalid_request'],
      [new Error(randomUUID()), 500, 'internal_error'],
    ] as const) {
      compare.mockImplementationOnce(() => { throw error; });
      const response = await post(app, route, valid(route));
      expectFailure(response, status, code);
      expect(response.body).not.toContain(error.message);
    }
    expect((await post(app, route, valid(route))).statusCode).toBe(200);
  });

  it.each(routes)('%s returns no partial data if either chart receipt is refused', async (route) => {
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
    expect((await post(app, route, valid(route))).statusCode).toBe(200);
  });

  it.each(routes)('%s treats an unexpected receipt RangeError as a server failure', async (route) => {
    const app = createApp();
    await app.ready();
    const error = new RangeError(randomUUID());
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw error; });
    const response = await post(app, route, valid(route));
    expectFailure(response, 500, 'internal_error');
    expect(response.body).not.toContain(error.message);
  });

  it('refuses real unrepresentable geometry on either contributing birth without returning a partial comparison', async () => {
    const app = createApp();
    const input = { utc: '2000-01-02T03:04:05Z', latitude: 89.99999999999999, longitude: 0, houseSystem: 'regiomontanus' as const };
    expect(() => receipt.createNatalEnvelope(engine.natalChart(input))).toThrow(receipt.NatalEnvelopeError);
    expectFailure(await post(app, '/v1/transits', { natal: input, at }), 422, 'receipt_unavailable');
    expectFailure(await post(app, '/v1/synastry', { a: input, b: second }), 422, 'receipt_unavailable');
    expectFailure(await post(app, '/v1/synastry', { a: first, b: input }), 422, 'receipt_unavailable');
  });

  it('logs route outcomes without birth inputs, source spellings, receipts or raw failures', async () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); } });
    const app = createApp({ logger: { level: 'trace', stream } });
    await app.ready();
    const canary = randomUUID();
    for (const route of routes) {
      expect((await post(app, route, valid(route))).statusCode).toBe(200);
      expectFailure(await post(app, route + '?private=' + canary, valid(route)));
      vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw new Error(canary); });
      const response = await post(app, route, valid(route));
      expectFailure(response, 500, 'internal_error');
      expect(response.body).not.toContain(canary);
    }
    await app.close();
    const logs = chunks.join('');
    for (const value of [key, canary, first.utc, second.utc, at, 'sourceInstant', 'resultFlags', 'latitude', 'longitude']) {
      expect(logs).not.toContain(value);
    }
    const completed = logs.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((record) => record.event === 'request_completed');
    expect(completed.map((record) => [record.route, record.statusCode])).toEqual(routes.flatMap((route) => [
      [route, 200], [route, 400], [route, 500],
    ]));
    for (const record of completed) {
      for (const field of ['body', 'data', 'receipts', 'headers', 'url', 'error', 'err']) expect(record).not.toHaveProperty(field);
    }
  });
});
