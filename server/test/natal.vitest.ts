import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../../src/index.js';
import type { BirthInput } from '../../src/index.js';
import * as receipt from '../../src/receipt.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
// Invented instant and coordinates, unrelated to any person's birth.
const birth = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const post = (app: FastifyInstance, payload: object) => app.inject({
  method: 'POST', url: '/v1/natal', headers, payload,
});

// These comparisons verify HTTP plumbing and regression parity with this
// checkout's public engine. They do not provide independent accuracy evidence.
function expectChart(response: LightMyRequestResponse, input: BirthInput) {
  expect(response.statusCode).toBe(200);
  const chart = engine.natalChart(input);
  const context = { sourceInstant: typeof input.utc === 'string' ? input.utc : null };
  const envelope = receipt.createNatalEnvelope(chart, context);
  const body = response.json();
  expect(body).toEqual({
    requestId: response.headers['x-request-id'],
    engine: { name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS },
    data: json(chart),
    receipts: [{ scope: '/data', envelope: json(envelope) }],
  });
  expect(response.headers['content-type']).toContain('application/json');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const parsed = receipt.parseNatalEnvelope(JSON.stringify(body.receipts[0].envelope));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error('Expected a readable engine envelope.');
  const replay = engine.natalChart(receipt.natalReplayInput(parsed.envelope));
  expect(receipt.createNatalEnvelope(replay, context)).toEqual(envelope);
  return { body, envelope: parsed.envelope };
}

function expectFailure(response: LightMyRequestResponse, status = 400, code = 'invalid_request') {
  expect(response.statusCode).toBe(status);
  const messages: Record<string, string> = {
    invalid_request: 'Request is invalid.',
    unauthorized: 'A valid API key is required.',
    rate_limited: 'API key request limit exceeded.',
    receipt_unavailable: 'The engine could not produce a receipt for this calculation.',
    internal_error: 'Internal server error.',
  };
  expect(response.json()).toEqual({
    requestId: response.headers['x-request-id'],
    engine: { name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS },
    receipts: [],
    error: { code, message: messages[code] },
  });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('POST /v1/natal engine results and receipts', () => {
  it('preserves the complete chart and scopes the original replayable engine envelope', async () => {
    const { body, envelope } = expectChart(await post(createApp(), birth), birth);
    expect(body.data.input).toEqual({ ...birth, houseSystem: 'whole', timeKnown: true });
    expect(body.data.houses.system).toBe('whole');
    expect(envelope.receipt.sourceInstant).toBe(birth.utc);
    expect(envelope.receipt.provenance).toBeNull();
    expect(envelope.receipt.localResolution).toBeNull();
    expect(envelope.receipt.reference).toBe('supplied-instant');
  });

  it.each(engine.HOUSE_SYSTEMS)('forwards the %s house system unchanged', async (houseSystem) => {
    const input = { ...birth, houseSystem };
    const { body, envelope } = expectChart(await post(createApp(), input), input);
    expect(body.data.houses.system).toBe(houseSystem);
    expect(envelope.receipt.houses).toEqual({ requested: houseSystem, actual: houseSystem, absenceReason: null });
  });

  it.each([
    { input: { utc: birth.utc }, reason: 'missing-location', flags: [] },
    { input: { ...birth, timeKnown: false }, reason: 'unknown-time', flags: ['no-time'] },
    { input: { utc: birth.utc, timeKnown: false }, reason: 'unknown-time', flags: ['no-time'] },
  ])('reports $reason without inventing angles, houses or a noon convention', async ({ input, reason, flags }) => {
    const { body, envelope } = expectChart(await post(createApp(), input), input);
    expect(body.data.angles).toBeNull();
    expect(body.data.houses).toBeNull();
    expect(body.data.flags).toEqual(flags);
    expect(envelope.receipt.houses.absenceReason).toBe(reason);
    expect(envelope.receipt.instant).toBe(birth.utc);
    expect(envelope.receipt.reference).toBe('supplied-instant');
  });

  it.each(['placidus', 'koch'] as const)('preserves requested %s when polar houses fall back', async (houseSystem) => {
    const input: BirthInput = { ...birth, latitude: 78.25, houseSystem, flags: ['polar-fallback'] };
    const { body, envelope } = expectChart(await post(createApp(), input), input);
    expect(body.data.houses.system).toBe('whole');
    expect(body.data.flags).toEqual(['polar-fallback']);
    expect(body.data.input.flags).toEqual([]);
    expect(envelope.receipt.houses).toEqual({ requested: houseSystem, actual: 'whole', absenceReason: null });
    expect(receipt.natalReplayInput(envelope).houseSystem).toBe(houseSystem);
  });

  it('retains the engine reference-coverage flag and receipt outside its reference span', async () => {
    const input: BirthInput = { ...birth, utc: '1701-02-03T04:05:06Z', flags: ['outside-reference-span'] };
    const { body, envelope } = expectChart(await post(createApp(), input), input);
    expect(body.data.flags).toEqual(['outside-reference-span']);
    expect(envelope.receipt.resultFlags).toEqual(['outside-reference-span']);
    expect(envelope.receipt.inputFlags).toEqual([]);
  });

  it('normalizes repeated caller assertions and consistent derived flags through the engine', async () => {
    const app = createApp();
    const input: BirthInput = {
      ...birth, timeKnown: false,
      flags: ['lmt', 'no-time', 'dst-fold', 'lmt', 'dst-fold', 'no-time'],
    };
    const { body, envelope } = expectChart(await post(app, input), input);
    expect(body.data.input.flags).toEqual(['lmt', 'dst-fold']);
    expect(body.data.flags).toEqual(['lmt', 'dst-fold', 'no-time']);
    expect(envelope.receipt.inputFlags).toEqual(['lmt', 'dst-fold']);
    const boundary: BirthInput = { ...birth, flags: Array(64).fill('dst-gap') };
    const accepted = expectChart(await post(app, boundary), boundary);
    expect(accepted.body.data.flags).toEqual(['dst-gap']);
  });

  it.each([
    '2001-02-03',
    '2001-02-03T04:05:06.789+05:30',
    '2001-02-03T04:05:06-00:00',
    '2001-02-03T04:05Z',
    Date.parse(birth.utc),
    Date.parse(birth.utc) + 0.75,
  ])('retains source spelling for string instant %j and leaves numeric provenance unavailable', async (utc) => {
    const input = { ...birth, utc };
    const { body, envelope } = expectChart(await post(createApp(), input), input);
    expect(envelope.receipt.sourceInstant).toBe(typeof utc === 'string' ? utc : null);
    expect(envelope.receipt.instant).toBe(body.data.input.utc);
  });

  it.each(['utc', 'ut1', 'tt'] as const)('preserves %s and isolates pinned deltaT across requests', async (timeScale) => {
    const app = createApp();
    const input = { ...birth, timeScale };
    const baseline = expectChart(await post(app, input), input);
    for (const deltaT of [-1e10, 0, 123.456, 1e10]) {
      const pinned = { ...input, deltaT };
      const { body, envelope } = expectChart(await post(app, pinned), pinned);
      expect(body.data.deltaT).toMatchObject({ seconds: deltaT, model: 'pinned' });
      expect(envelope.receipt.timeScale).toBe(timeScale);
      expect(receipt.natalReplayInput(envelope).deltaT).toBe(deltaT);
    }
    const restored = expectChart(await post(app, input), input);
    expect(restored.body.data).toEqual(baseline.body.data);
    expect(restored.envelope).toEqual(baseline.envelope);
  });

  it('accepts coordinate endpoints when the time is unknown and longitude endpoints when timed', async () => {
    const app = createApp();
    for (const latitude of [-90, 90]) {
      for (const longitude of [-180, 180]) {
        const input = { ...birth, latitude, longitude, timeKnown: false };
        expectChart(await post(app, input), input);
      }
    }
    for (const longitude of [-180, 180]) {
      const input = { ...birth, longitude };
      expectChart(await post(app, input), input);
    }
  });
});

describe('POST /v1/natal validation', () => {
  it('requires a flat object with utc and rejects unknown body and query properties', async () => {
    const app = createApp();
    for (const input of [{}, { birth }, { input: birth }, { ...birth, unknown: true }, { ...birth, UTC: birth.utc }, { ...birth, timescale: 'tt' }]) {
      expectFailure(await post(app, input));
    }
    expectFailure(await app.inject({ method: 'POST', url: '/v1/natal', headers }));
    for (const suffix of ['?utc=2001-02-03', '?unknown=true', '?flags=dst-gap&flags=lmt']) {
      expectFailure(await app.inject({ method: 'POST', url: '/v1/natal' + suffix, headers, payload: birth }));
    }
  });

  it('rejects invalid field types without coercing or dropping them', async () => {
    const app = createApp({ rateLimit: { capacity: 100, refillPerSecond: 1 } });
    const values: Record<string, unknown[]> = {
      utc: [null, true, false, [], {}, [birth.utc]],
      latitude: [null, '23.45', true, [], {}],
      longitude: [null, '-67.89', false, [], {}],
      houseSystem: [null, 1, true, [], 'Placidus', 'not-a-system'],
      timeKnown: [null, 0, 1, 'false', 'true', []],
      timeScale: [null, 1, false, [], 'UTC', 'tai'],
      deltaT: [null, '69', false, [], {}],
      flags: [null, 'lmt', {}, [null], [1], ['unknown']],
    };
    for (const [field, invalid] of Object.entries(values)) {
      for (const value of invalid) expectFailure(await post(app, { ...birth, [field]: value }));
    }
  });

  it('rejects unmatched coordinates and fields beyond their bounds', async () => {
    const app = createApp();
    const invalid = [
      { utc: birth.utc, latitude: 0 }, { utc: birth.utc, longitude: 0 },
      ...[-90.001, 90.001].map((latitude) => ({ ...birth, latitude })),
      ...[-180.001, 180.001].map((longitude) => ({ ...birth, longitude })),
      ...[-1e10 - 1, 1e10 + 1].map((deltaT) => ({ ...birth, deltaT })),
      ...[-8_640_000_000_000_001, 8_640_000_000_000_001].map((utc) => ({ ...birth, utc })),
      { ...birth, utc: 'x'.repeat(41) }, { ...birth, flags: Array(65).fill('lmt') },
    ];
    for (const input of invalid) expectFailure(await post(app, input));
    for (const payload of ['{"utc":1e999}', '{"utc":"2001-02-03","deltaT":-1e999}']) {
      expectFailure(await app.inject({ method: 'POST', url: '/v1/natal', headers, payload }));
    }
  });

  it('refuses exact timed geographic poles that the natal receipt cannot represent', async () => {
    const app = createApp();
    for (const latitude of [-90, 90]) {
      expectFailure(await post(app, { ...birth, latitude }));
      expectFailure(await post(app, { ...birth, latitude, timeKnown: true }));
    }
  });

  it('maps invalid calendar syntax and ephemeris coverage refusals to client errors', async () => {
    const app = createApp();
    for (const utc of [
      '', 'not-an-instant', '2001-02-30', '2001-02-03T24:00:00Z',
      '2001-02-03T04:05:60Z', '2001-02-03T04:05:06', '02/03/2001',
      '2001-02-03T04:05:06.1234Z', '2001-02-03T04:05:06+24:00',
      '+030000-02-03T00:00:00Z', '0001-01-01', '4000-01-01',
      -8_640_000_000_000_000, 8_640_000_000_000_000,
    ]) expectFailure(await post(app, { ...birth, utc }));
  });

  it('rejects contradictory caller flag claims instead of accepting derived overrides', async () => {
    const app = createApp();
    const invalid = [
      { ...birth, flags: ['dst-gap', 'dst-fold'] },
      { ...birth, flags: ['no-time'] },
      { ...birth, flags: ['outside-reference-span'] },
      { ...birth, flags: ['polar-fallback'] },
      { ...birth, houseSystem: 'placidus', flags: ['polar-fallback'] },
      { ...birth, latitude: 78.25, houseSystem: 'koch', timeKnown: false, flags: ['polar-fallback'] },
    ];
    for (const input of invalid) expectFailure(await post(app, input));
  });
});

describe('POST /v1/natal protection and error boundary', () => {
  it('requires authentication and shares the per-key allowance before performing calculations', async () => {
    const otherKey = randomBytes(32).toString('base64url');
    const app = createApp({
      apiKeys: new ApiKeyStore([key, otherKey]),
      rateLimit: { capacity: 1, refillPerSecond: 1 }, monotonicNow: () => 0,
    });
    await app.ready();
    const calculate = vi.spyOn(engine, 'natalChart');
    expectFailure(await app.inject({ method: 'POST', url: '/v1/natal', payload: birth }), 401, 'unauthorized');
    expect(calculate).not.toHaveBeenCalled();
    const accepted = await post(app, birth);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.headers['x-ratelimit-remaining']).toBe('0');
    expect(calculate).toHaveBeenCalledTimes(1);
    const limited = await post(app, birth);
    expectFailure(limited, 429, 'rate_limited');
    expect(limited.headers['retry-after']).toBe('1');
    expect(calculate).toHaveBeenCalledTimes(1);
    expect((await app.inject({
      method: 'POST', url: '/v1/natal', headers: { authorization: `Bearer ${otherKey}` }, payload: birth,
    })).statusCode).toBe(200);
    expect(calculate).toHaveBeenCalledTimes(2);
  });

  it('sanitizes an unexpected engine exception as a server failure', async () => {
    const app = createApp();
    await app.ready();
    const canary = randomUUID();
    vi.spyOn(engine, 'natalChart').mockImplementationOnce(() => { throw new Error(canary); });
    const response = await post(app, birth);
    expectFailure(response, 500, 'internal_error');
    expect(response.body).not.toContain(canary);
  });

  it.each(['regiomontanus', 'topocentric'] as const)('refuses a %s result that its engine receipt cannot represent and recovers', async (houseSystem) => {
    const app = createApp();
    const input = { utc: '2000-01-02T03:04:05Z', latitude: 89.99999999999999, longitude: 0, houseSystem };
    // A valid engine request can produce a result beyond the receipt codec's
    // geometric checks. Never return that chart with an empty receipt list.
    const chart = engine.natalChart(input);
    expect(() => receipt.createNatalEnvelope(chart)).toThrow(receipt.NatalEnvelopeError);
    const refused = await post(app, input);
    expectFailure(refused, 422, 'receipt_unavailable');
    expect(refused.json()).not.toHaveProperty('data');
    expectChart(await post(app, birth), birth);
  });

  it('maps a native envelope refusal to a sanitized receipt-unavailable response', async () => {
    const app = createApp();
    await app.ready();
    const error = new receipt.NatalEnvelopeError('inconsistent_result');
    const canary = randomUUID();
    error.message = canary;
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw error; });
    const response = await post(app, birth);
    expectFailure(response, 422, 'receipt_unavailable');
    expect(response.body).not.toContain(canary);
    expect(response.body).not.toContain('inconsistent_result');
    expectChart(await post(app, birth), birth);
  });

  it.each([new Error(), new RangeError()])('keeps unexpected receipt %s failures distinct from input refusals', async (error) => {
    const app = createApp();
    await app.ready();
    error.message = randomUUID();
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw error; });
    const response = await post(app, birth);
    expectFailure(response, 500, 'internal_error');
    expect(response.body).not.toContain(error.message);
  });

  it('logs route outcomes without credentials, birth details, receipts or raw calculation errors', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); },
    });
    const app = createApp({ logger: { level: 'trace', stream } });
    await app.ready();
    const canary = randomUUID();
    const accepted = await post(app, birth);
    expect(accepted.statusCode).toBe(200);
    const invalid = await post(app, { ...birth, utc: canary });
    expectFailure(invalid);
    vi.spyOn(engine, 'natalChart').mockImplementationOnce(() => { throw new RangeError(canary); });
    const refused = await post(app, birth);
    expectFailure(refused);
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw new Error(canary); });
    const failed = await post(app, birth);
    expectFailure(failed, 500, 'internal_error');
    await app.close();
    const logs = chunks.join('');
    for (const value of [key, canary, birth.utc, '"latitude"', '"longitude"', 'sourceInstant', 'resultFlags']) {
      expect(logs).not.toContain(value);
    }
    expect(invalid.body + refused.body + failed.body).not.toContain(canary);
    const completed = logs.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((record) => record.event === 'request_completed');
    expect(completed.map((record) => [record.route, record.statusCode])).toEqual([
      ['/v1/natal', 200], ['/v1/natal', 400], ['/v1/natal', 400], ['/v1/natal', 500],
    ]);
    for (const record of completed) {
      expect(record.durationMs).toEqual(expect.any(Number));
      for (const field of ['body', 'data', 'receipts', 'headers', 'url', 'error', 'err']) expect(record).not.toHaveProperty(field);
    }
  });
});
