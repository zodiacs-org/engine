import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as calc from '../../src/calc.js';
import type { CalcTime, HousesRequest } from '../../src/calc.js';
import * as engine from '../../src/index.js';
import * as receipt from '../../src/receipt.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
// Invented instant and coordinates, unrelated to any person's birth.
const input = { time: '2004-02-29T08:30:00+02:00', place: { latitude: 48.25, longitude: -3.75 } };
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const post = (app: FastifyInstance, payload: object, url = '/v1/houses') => app.inject({ method: 'POST', url, headers, payload });

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}

// Direct-engine comparisons check the HTTP adapter and replay, not independent
// astronomical accuracy or the physical validity of the engine's bounds.
function expectResult(response: LightMyRequestResponse, request: HousesRequest) {
  expect(response.statusCode).toBe(200);
  const result = calc.houses(request);
  if (result.status !== 'ok') throw new Error('Expected a computed houses result.');
  const body = response.json();
  expect(body).toEqual({
    requestId: response.headers['x-request-id'],
    engine: { name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS },
    data: json(result), receipts: [{ scope: '/data', receipt: json(result.receipt) }],
  });
  expect(body.receipts[0]).not.toHaveProperty('envelope');
  expect(body.receipts[0].receipt.schema).toBe(calc.CALC_RECEIPT_SCHEMA);
  expect(json(calc.houses(body.receipts[0].receipt.request))).toEqual(body.data);
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  return body;
}

function expectFailure(response: LightMyRequestResponse, status = 400, code = 'invalid_request') {
  const messages: Record<string, string> = {
    invalid_request: 'Request is invalid.', unauthorized: 'A valid API key is required.',
    rate_limited: 'API key request limit exceeded.', internal_error: 'Internal server error.',
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

describe('POST /v1/houses calculations and receipts', () => {
  it.each(engine.HOUSE_SYSTEMS)('preserves the full %s result and matches natal angles and cusps', async (houseSystem) => {
    const request = { ...input, houseSystem };
    const body = expectResult(await post(createApp(), request), request);
    const natal = engine.natalChart({ utc: input.time, ...input.place, houseSystem });
    expect(body.data.cusps).toEqual(natal.houses!.cusps);
    expect(body.data.angles).toEqual(natal.angles);
    expect(body.data.requested).toBe(houseSystem);
    expect(body.data.system).toBe(houseSystem);
    expect(body.data.ayanamsa).toBeNull();
  });

  it('keeps default whole sign, engine bounds and receipt, and replays the recorded request through HTTP', async () => {
    const app = createApp();
    const body = expectResult(await post(app, input), input);
    expect(body.data.system).toBe('whole');
    expect(body.data.receipt.request).toEqual({
      time: { iso: input.time }, place: input.place, houseSystem: 'whole', zodiac: 'tropical',
    });
    expect(body.data.receipt.engine).toEqual(body.engine);
    expect(body.data.bounds).toEqual((calc.houses(input) as calc.HousesResult).bounds);
    const replay = await post(app, body.data.receipt.request);
    expectResult(replay, body.data.receipt.request);
    expect(replay.json().data).toEqual(body.data);
  });

  it.each(['placidus', 'koch'] as const)('preserves %s fallback separately from the requested system in both hemispheres', async (houseSystem) => {
    const app = createApp();
    for (const latitude of [-78.25, 78.25]) {
      const request = { ...input, place: { ...input.place, latitude }, houseSystem };
      const body = expectResult(await post(app, request), request);
      expect(body.data.requested).toBe(houseSystem);
      expect(body.data.system).toBe('whole');
      expect(body.data.flags).toEqual(['polar-fallback']);
      expect(body.data.receipt.request.houseSystem).toBe(houseSystem);
      expect(body.data.receipt.conventions).toEqual(expect.arrayContaining([`house:${houseSystem}`, 'polar-fallback:whole']));
    }
  });

  it.each(['utc', 'ut1', 'tt'] as const)('preserves Julian dates on %s, including pinned zero and later default clocks', async (scale) => {
    const app = createApp();
    for (const deltaT of [undefined, 0, 123.456, -50]) {
      const time = { jd: 2451546.625, scale, ...(deltaT === undefined ? {} : { deltaT }) };
      const request = { ...input, time };
      const body = expectResult(await post(app, request), request);
      expect(body.data.receipt.request.time).toEqual(time);
      expect(body.data.receipt.instants[0].timeScale.input).toBe(scale);
      if (deltaT !== undefined) expect(body.data.receipt.instants[0].deltaT).toMatchObject({ seconds: deltaT, model: 'pinned' });
      else expect(body.data.receipt.instants[0].deltaT.model).not.toBe('pinned');
    }
    expectResult(await post(app, input), input);
    const at = input.time;
    const phase = await post(app, { at }, '/v1/moon-phase');
    expect(phase.statusCode).toBe(200);
    expect(phase.json().data).toEqual(json({ ...engine.moonPhase(at), sky: engine.natalChart({ utc: at }) }));
  });

  it('preserves ISO object pins, date-only and offset spellings and longitude boundaries', async () => {
    const app = createApp();
    for (const time of ['2004-02-29', '2004-02-29T08:30:00-00:00', { iso: input.time, deltaT: 0 }, { iso: input.time, deltaT: -123.456 }]) {
      for (const longitude of [-180, 180]) {
        const request = { ...input, time, place: { latitude: 0, longitude } };
        const body = expectResult(await post(app, request), request);
        expect(body.data.receipt.request.time).toEqual(typeof time === 'string' ? { iso: time } : time);
      }
    }
  });

  it('uses the dedicated houses API without computing an unrelated natal chart or envelope', async () => {
    const app = createApp();
    await app.ready();
    const natal = vi.spyOn(engine, 'natalChart');
    const envelope = vi.spyOn(receipt, 'createNatalEnvelope');
    expect((await post(app, input)).statusCode).toBe(200);
    expect(natal).not.toHaveBeenCalled();
    expect(envelope).not.toHaveBeenCalled();
  });
});

describe('houses validation and refusals', () => {
  it('refuses schema violations and queries before calling the engine', async () => {
    const app = createApp({ rateLimit: { capacity: 100, refillPerSecond: 1 } });
    await app.ready();
    const calculate = vi.spyOn(calc, 'houses');
    for (const payload of [
      {}, { time: input.time }, { place: input.place }, { ...input, extra: true },
      { ...input, timeKnown: false }, { ...input, timeScale: 'tt' }, { ...input, deltaT: 0 },
      { ...input, zodiac: 'sidereal' }, { ...input, zodiac: { sidereal: 'lahiri' } },
      ...[null, false, 'Placidus', 'unknown'].map((houseSystem) => ({ ...input, houseSystem })),
      ...[null, [], {}, { latitude: 10 }, { longitude: 20 }, { ...input.place, height: 0 },
        { ...input.place, latitude: '10' }, { ...input.place, latitude: 90 }, { ...input.place, latitude: -90 },
        { ...input.place, longitude: 180.01 }, { ...input.place, longitude: -180.01 }].map((place) => ({ ...input, place })),
      ...[null, true, [], '', 'x'.repeat(41), Date.parse(input.time), {}, { iso: input.time, scale: 'utc' },
        { iso: input.time, jd: 2451545, scale: 'utc' }, { iso: 123 }, { iso: input.time, deltaT: null },
        { iso: input.time, deltaT: 1e10 + 1 }, { jd: 2451545 }, { jd: '2451545', scale: 'utc' },
        { jd: 2451545, scale: 'UTC' }, { jd: 2451545, scale: 'utc', deltaT: -1e10 - 1 },
        { jd: 2451545, scale: 'utc', unexpected: true }].map((time) => ({ ...input, time })),
    ]) expectFailure(await post(app, payload));
    expectFailure(await app.inject({ method: 'POST', url: '/v1/houses', headers }));
    expectFailure(await post(app, input, '/v1/houses?time=2004-02-29'));
    expect(calculate).not.toHaveBeenCalled();
  });

  it('sanitizes calendar errors and typed span refusals without leaking details or partial receipts', async () => {
    const app = createApp();
    for (const time of ['2004-02-30', '2004-02-29T08:30', '2004-02-29T24:00Z', '2004-02-29T08:30:00.1234Z',
      '+030000-01-02T00:00:00Z', '1701-02-03', { jd: Number.MAX_VALUE, scale: 'tt' as const },
      { iso: input.time, deltaT: 1e10 }, { iso: input.time, deltaT: -1e10 }]) {
      expectFailure(await post(app, { ...input, time }));
    }
  });

  it('requires both UT1 and TT inside CALC_SPAN, with the lower edge included and upper edge excluded', async () => {
    const app = createApp();
    const jdFrom = Date.parse(calc.CALC_SPAN.from) / 86_400_000 + 2440587.5;
    const jdTo = Date.parse(calc.CALC_SPAN.to) / 86_400_000 + 2440587.5;
    const accepted: CalcTime[] = [
      { jd: jdFrom, scale: 'ut1', deltaT: 0 }, { jd: jdFrom, scale: 'tt', deltaT: 0 },
      { jd: jdTo - 1 / 86400, scale: 'ut1', deltaT: 0 },
    ];
    for (const time of accepted) {
      const request = { ...input, time };
      expectResult(await post(app, request), request);
    }
    for (const time of [
      { jd: jdFrom, scale: 'ut1', deltaT: -1 }, { jd: jdFrom, scale: 'tt', deltaT: 1 },
      { jd: jdTo, scale: 'ut1', deltaT: 0 }, { jd: jdTo, scale: 'tt', deltaT: 0 },
      { jd: jdTo - 1 / 86400, scale: 'ut1', deltaT: 2 },
      { jd: jdTo - 1 / 86400, scale: 'tt', deltaT: -2 },
    ] as const) {
      const request = { ...input, time };
      expect(calc.houses(request)).toMatchObject({ status: 'refused', reason: 'out-of-range' });
      expectFailure(await post(app, request));
    }
  });

  it('sanitizes exceptions and typed refusal details, and recovers on a later request', async () => {
    const app = createApp();
    await app.ready();
    const calculate = vi.spyOn(calc, 'houses');
    const canary = randomUUID();
    for (const [error, status, code] of [
      [new RangeError(canary), 400, 'invalid_request'], [new Error(canary), 500, 'internal_error'],
    ] as const) {
      calculate.mockImplementationOnce(() => { throw error; });
      const response = await post(app, input);
      expectFailure(response, status, code);
      expect(response.body).not.toContain(canary);
    }
    calculate.mockReturnValueOnce({ status: 'refused', reason: 'unsupported-combination', detail: canary });
    const refused = await post(app, input);
    expectFailure(refused);
    expect(refused.body).not.toContain(canary);
    expectResult(await post(app, input), input);
  });
});

describe('houses protection and privacy', () => {
  it('authenticates and shares per-key tokens with other routes before calculation', async () => {
    const app = createApp({ rateLimit: { capacity: 2, refillPerSecond: 1 }, monotonicNow: () => 0 });
    await app.ready();
    const calculate = vi.spyOn(calc, 'houses');
    expectFailure(await app.inject({ method: 'POST', url: '/v1/houses', payload: input }), 401, 'unauthorized');
    expect(calculate).not.toHaveBeenCalled();
    expect((await post(app, { at: input.time }, '/v1/moon-phase')).statusCode).toBe(200);
    expect((await post(app, input)).statusCode).toBe(200);
    calculate.mockClear();
    const limited = await post(app, input);
    expectFailure(limited, 429, 'rate_limited');
    expect(limited.headers['retry-after']).toBe('1');
    expectFailure(await post(app, { utc: input.time }, '/v1/natal'), 429, 'rate_limited');
    expect(calculate).not.toHaveBeenCalled();
  });

  it('keeps inputs, output, receipt and refusal details out of trace logs', async () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); } });
    const app = createApp({ logger: { level: 'trace', stream } });
    await app.ready();
    const response = await post(app, input);
    expectResult(response, input);
    const canary = randomUUID();
    expectFailure(await post(app, input, '/v1/houses?private=' + canary));
    vi.spyOn(calc, 'houses').mockReturnValueOnce({ status: 'refused', reason: 'out-of-range', span: calc.CALC_SPAN, detail: canary });
    expectFailure(await post(app, input));
    vi.spyOn(calc, 'houses').mockImplementationOnce(() => { throw new Error(canary); });
    expectFailure(await post(app, input), 500, 'internal_error');
    await app.close();
    const logs = chunks.join('');
    for (const value of [key, canary, input.time, 'latitude', 'longitude', 'cusps', 'obliquity', 'conventions', String(response.json().data.angles.asc)]) {
      expect(logs).not.toContain(value);
    }
    const completed = logs.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((record) => record.event === 'request_completed');
    expect(completed.map((record) => [record.route, record.statusCode])).toEqual([200, 400, 400, 500].map((code) => ['/v1/houses', code]));
  });
});
