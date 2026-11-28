import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../../src/index.js';
import type { MoonPhaseName } from '../../src/index.js';
import * as receipt from '../../src/receipt.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
const route = '/v1/moon-phase';
// Invented instants and coordinates, unrelated to any person's birth.
const at = '2024-06-07T08:09:10.123-03:00';
const birth = { utc: '2001-02-03T04:05:06.789+05:30', latitude: 23.45, longitude: -67.89 };
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const post = (app: FastifyInstance, payload: unknown, url = route) => app.inject({
  method: 'POST', url, headers, payload: JSON.stringify(payload),
});

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}

// These comparisons check HTTP transport and public-engine integration.
// They are not independent evidence of astronomical accuracy.
function expectPhase(response: LightMyRequestResponse, instant: string | number = at) {
  expect(response.statusCode).toBe(200);
  const phase = engine.moonPhase(instant);
  const sky = engine.natalChart({ utc: instant });
  const context = { sourceInstant: typeof instant === 'string' ? instant : null };
  const envelope = receipt.createNatalEnvelope(sky, context);
  const body = response.json();
  expect(body).toEqual({
    requestId: response.headers['x-request-id'],
    engine: { name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS },
    data: json({ ...phase, sky }),
    receipts: [{ scope: '/data/sky', envelope: json(envelope) }],
  });
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  const parsed = receipt.parseNatalEnvelope(JSON.stringify(body.receipts[0].envelope));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error('Expected a readable sky chart receipt.');
  const replay = engine.natalChart(receipt.natalReplayInput(parsed.envelope));
  expect(receipt.createNatalEnvelope(replay, context)).toEqual(envelope);
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

describe('POST /v1/moon-phase results and chart receipt', () => {
  it('preserves the complete public phase result with a replayable receipt scoped only to the sky chart', async () => {
    const body = expectPhase(await post(createApp(), { at }));
    expect(body.data.sky.input.utc).toBe(body.data.at);
    expect(body.data.sky.angles).toBeNull();
    expect(body.data.sky.houses).toBeNull();
    expect(body.data.sky.input.timeKnown).toBe(true);
    expect(body.receipts[0].envelope.receipt.sourceInstant).toBe(at);
    expect(body.receipts[0].envelope.receipt.houses.absenceReason).toBe('missing-location');
    expect(body.receipts.map((entry: { scope: string }) => entry.scope)).toEqual(['/data/sky']);
    expect(body.data).not.toHaveProperty('receipt');
  });

  it('transports every engine phase name and both waxing states over synthetic daily instants', async () => {
    const app = createApp();
    const samples = new Map<MoonPhaseName, string>();
    for (let day = 1; day <= 31; day++) {
      const instant = `2003-03-${String(day).padStart(2, '0')}T06:07:08Z`;
      samples.set(engine.moonPhase(instant).name, instant);
    }
    expect([...samples.keys()].sort()).toEqual([
      'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
      'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent',
    ].sort());
    const waxing = new Set<boolean>();
    for (const [name, instant] of samples) {
      const body = expectPhase(await post(app, { at: instant }), instant);
      expect(body.data.name).toBe(name);
      waxing.add(body.data.waxing);
    }
    expect(waxing).toEqual(new Set([true, false]));
  });

  it.each([
    '2003-04-05', '2003-04-05T06:07:08.12+05:30',
    '2003-04-05T06:07:08-00:00', '+002003-04-05T06:07:08Z',
  ])('keeps source spelling and resolved instant semantics for %s', async (instant) => {
    const body = expectPhase(await post(createApp(), { at: instant }), instant);
    expect(body.data.at).toBe(new Date(instant).toISOString());
    expect(body.receipts[0].envelope.receipt.sourceInstant).toBe(instant);
  });

  it.each([Date.parse(at) + 0.75, Date.parse('1963-04-05T06:07:08Z') - 0.75])(
    'retains Date millisecond truncation for numeric instant %s without inventing a source string',
    async (instant) => {
      const body = expectPhase(await post(createApp(), { at: instant }), instant);
      expect(body.data.at).toBe(new Date(instant).toISOString());
      expect(body.data.sky.input.utc).toBe(new Date(Math.trunc(instant)).toISOString());
      expect(body.receipts[0].envelope.receipt.sourceInstant).toBeNull();
    },
  );

  it('uses the default UTC time basis after natal calls on every pinned clock', async () => {
    const app = createApp();
    const baseline = expectPhase(await post(app, { at }));
    for (const timeScale of ['utc', 'ut1', 'tt'] as const) {
      const previous = await post(app, { ...birth, timeScale, deltaT: 123.456 }, '/v1/natal');
      expect(previous.statusCode).toBe(200);
      expect(previous.json().data.deltaT).toMatchObject({ model: 'pinned', seconds: 123.456 });
      const body = expectPhase(await post(app, { at }));
      expect(body.data).toEqual(baseline.data);
      expect(body.receipts).toEqual(baseline.receipts);
      expect(body.data.sky.timeScale.input).toBe('utc');
      expect(body.data.sky.deltaT.model).not.toBe('pinned');
      expect(body.data.sky.input).not.toHaveProperty('timeScale');
      expect(body.data.sky.input).not.toHaveProperty('deltaT');
    }
  });

  it.each(['1701-02-03', '2301-04-05'])('preserves reference coverage flags on the sky chart at %s', async (instant) => {
    const body = expectPhase(await post(createApp(), { at: instant }), instant);
    expect(body.data.sky.flags).toEqual(['outside-reference-span']);
    expect(body.receipts[0].envelope.receipt.resultFlags).toEqual(['outside-reference-span']);
    expect(body.data).not.toHaveProperty('flags');
  });
});

describe('moon-phase request validation', () => {
  it('requires a strict instant object and rejects unknown settings and query parameters before calculations', async () => {
    const app = createApp({ rateLimit: { capacity: 100, refillPerSecond: 1 } });
    await app.ready();
    const chart = vi.spyOn(engine, 'natalChart');
    const phase = vi.spyOn(engine, 'moonPhase');
    for (const input of [null, [], at, {}, birth, { utc: at }]) expectFailure(await post(app, input));
    expectFailure(await app.inject({ method: 'POST', url: route, headers }));
    for (const value of [null, true, [], {}, { utc: at }, '', 'x'.repeat(41), -8_640_000_000_000_001, 8_640_000_000_000_001]) {
      expectFailure(await post(app, { at: value }));
    }
    for (const field of ['extra', 'latitude', 'longitude', 'timeKnown', 'timeScale', 'deltaT', 'flags', 'houseSystem', 'from', 'to', 'maxSamples']) {
      expectFailure(await post(app, { at, [field]: 1 }));
    }
    for (const query of ['?at=2024-01-02', '?timeScale=tt', '?unknown=true']) {
      expectFailure(await post(app, { at }, route + query));
    }
    expect(chart).not.toHaveBeenCalled();
    expect(phase).not.toHaveBeenCalled();
  });

  it('sanitizes invalid calendar dates, unresolved times and unsupported ephemeris instants', async () => {
    const app = createApp();
    for (const instant of [
      '2001-02-30', '2001-02-03T04:05:06', '2001-02-03T24:00:00Z',
      '2001-02-03T04:05:60Z', '2001-02-03T04:05:06.1234Z', 'not-a-date',
      '0000-01-02', '+030000-01-02T00:00:00Z', -8_640_000_000_000_000, 8_640_000_000_000_000,
    ]) {
      const response = await post(app, { at: instant });
      expectFailure(response);
      expect(response.body).not.toContain(String(instant));
    }
    expectPhase(await post(app, { at }));
  });
});

describe('moon-phase protection and failures', () => {
  it('requires authentication and shares a key allowance with natal before computing', async () => {
    const app = createApp({ rateLimit: { capacity: 2, refillPerSecond: 1 }, monotonicNow: () => 0 });
    await app.ready();
    const chart = vi.spyOn(engine, 'natalChart');
    const phase = vi.spyOn(engine, 'moonPhase');
    expectFailure(await app.inject({ method: 'POST', url: route, payload: { at } }), 401, 'unauthorized');
    expectFailure(await app.inject({ method: 'POST', url: route, payload: {} }), 401, 'unauthorized');
    expect(chart).not.toHaveBeenCalled();
    expect(phase).not.toHaveBeenCalled();
    expect((await post(app, birth, '/v1/natal')).statusCode).toBe(200);
    expect((await post(app, { at })).statusCode).toBe(200);
    chart.mockClear();
    phase.mockClear();
    const limited = await post(app, { at });
    expectFailure(limited, 429, 'rate_limited');
    expect(limited.headers['retry-after']).toBe('1');
    expectFailure(await post(app, birth, '/v1/natal'), 429, 'rate_limited');
    expect(chart).not.toHaveBeenCalled();
    expect(phase).not.toHaveBeenCalled();
  });

  it.each(['moonPhase', 'natalChart'] as const)('sanitizes %s refusals and unexpected exceptions', async (method) => {
    const app = createApp();
    await app.ready();
    const calculate = vi.spyOn(engine, method);
    for (const [error, status, code] of [
      [new RangeError(randomUUID()), 400, 'invalid_request'],
      [new Error(randomUUID()), 500, 'internal_error'],
    ] as const) {
      calculate.mockImplementationOnce(() => { throw error; });
      const response = await post(app, { at });
      expectFailure(response, status, code);
      expect(response.body).not.toContain(error.message);
    }
    expectPhase(await post(app, { at }));
  });

  it('returns no partial phase result when the sky receipt is refused', async () => {
    const app = createApp();
    await app.ready();
    const error = new receipt.NatalEnvelopeError('inconsistent_result');
    error.message = randomUUID();
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw error; });
    const response = await post(app, { at });
    expectFailure(response, 422, 'receipt_unavailable');
    expect(response.body).not.toContain(error.message);
    expect(response.body).not.toContain('inconsistent_result');
    expectPhase(await post(app, { at }));
  });

  it('treats unexpected receipt RangeErrors as server failures', async () => {
    const app = createApp();
    await app.ready();
    const error = new RangeError(randomUUID());
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw error; });
    const response = await post(app, { at });
    expectFailure(response, 500, 'internal_error');
    expect(response.body).not.toContain(error.message);
  });

  it('logs route outcomes without instants, phase data, receipts, credentials or raw failures', async () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); } });
    const app = createApp({ logger: { level: 'trace', stream } });
    await app.ready();
    const canary = randomUUID();
    expect((await post(app, { at })).statusCode).toBe(200);
    expectFailure(await post(app, { at }, route + '?private=' + canary));
    const phase = vi.spyOn(engine, 'moonPhase');
    phase.mockImplementationOnce(() => { throw new Error(canary); });
    const response = await post(app, { at });
    expectFailure(response, 500, 'internal_error');
    expect(response.body).not.toContain(canary);
    await app.close();
    const logs = chunks.join('');
    for (const value of [key, canary, at, 'illumination', 'waxing', 'sourceInstant', 'resultFlags', 'latitude', 'longitude']) {
      expect(logs).not.toContain(value);
    }
    const completed = logs.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((record) => record.event === 'request_completed');
    expect(completed.map((record) => [record.route, record.statusCode])).toEqual([
      [route, 200], [route, 400], [route, 500],
    ]);
    for (const record of completed) {
      for (const field of ['body', 'data', 'receipts', 'headers', 'url', 'error', 'err']) expect(record).not.toHaveProperty(field);
    }
  });
});
