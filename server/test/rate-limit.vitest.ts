import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, FastifyRequest, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';
import { success } from '../src/responses.js';

const apps: FastifyInstance[] = [];
const newKey = () => randomBytes(32).toString('base64url');
const authorization = (key: string) => ({ authorization: `Bearer ${key}` });

function createApp(options: NonNullable<Parameters<typeof buildApp>[0]> = {}) {
  const keys = [newKey(), newKey()];
  const apiKeys = new ApiKeyStore(keys);
  let now = 0;
  const app = buildApp({
    logger: false,
    apiKeys,
    rateLimit: { capacity: 2, refillPerSecond: 1 },
    monotonicNow: () => now,
    ...options,
  });
  apps.push(app);
  const handler = vi.fn(async (request: FastifyRequest) => success(request.id, { accepted: true }));
  app.get('/v1/first', handler);
  app.post('/v1/second', handler);
  app.post('/v1/schema', {
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['count'],
        properties: { count: { type: 'integer', minimum: 0 } },
      },
    },
  }, handler);
  return { app, keys, apiKeys, handler, setNow: (value: number) => { now = value; } };
}

function expectRateHeaders(response: LightMyRequestResponse, capacity: number, remaining: number) {
  expect(response.headers['x-ratelimit-limit']).toBe(String(capacity));
  expect(response.headers['x-ratelimit-remaining']).toBe(String(remaining));
}

function expectNoRateHeaders(response: LightMyRequestResponse) {
  expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
  expect(response.headers).not.toHaveProperty('x-ratelimit-remaining');
  expect(response.headers).not.toHaveProperty('retry-after');
}

function expectLimited(response: LightMyRequestResponse, capacity: number) {
  expect(response.statusCode).toBe(429);
  expectRateHeaders(response, capacity, 0);
  expect(response.headers['retry-after']).toBe('1');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.json()).toEqual({
    requestId: response.headers['x-request-id'],
    engine: {
      name: '@zodiacs/engine', version: expect.any(String),
      ephemeris: { name: 'astronomy-engine', version: '2.1.19' },
    },
    receipts: [],
    error: { code: 'rate_limited', message: 'API key request limit exceeded.' },
  });
  expect(response.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('per-key HTTP rate limiting', () => {
  it('shares one allowance across routes while keeping configured keys independent', async () => {
    const { app, keys, handler } = createApp();
    for (const key of keys) {
      const first = await app.inject({ url: '/v1/first', headers: authorization(key) });
      expect(first.statusCode).toBe(200);
      expectRateHeaders(first, 2, 1);
      expect(first.headers).not.toHaveProperty('retry-after');
      const second = await app.inject({ method: 'POST', url: '/v1/second', headers: authorization(key), payload: {} });
      expect(second.statusCode).toBe(200);
      expectRateHeaders(second, 2, 0);
      expect(second.headers).not.toHaveProperty('retry-after');
      expectLimited(await app.inject({ url: '/v1/first', headers: authorization(key) }), 2);
    }
    expect(handler).toHaveBeenCalledTimes(4);
  });

  it('admits exactly the available capacity during concurrent requests', async () => {
    const { app, keys, handler } = createApp({ rateLimit: { capacity: 3, refillPerSecond: 1 } });
    const responses = await Promise.all(Array.from({ length: 12 }, () => app.inject({
      url: '/v1/first', headers: authorization(keys[0]!),
    })));
    const admitted = responses.filter((response) => response.statusCode === 200);
    const limited = responses.filter((response) => response.statusCode === 429);
    expect(admitted).toHaveLength(3);
    expect(limited).toHaveLength(9);
    expect(admitted.map((response) => Number(response.headers['x-ratelimit-remaining'])).sort()).toEqual([0, 1, 2]);
    for (const response of limited) expectLimited(response, 3);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('refills from elapsed milliseconds without charging rejections or accumulating beyond capacity', async () => {
    const { app, keys, handler, setNow } = createApp({ rateLimit: { capacity: 1, refillPerSecond: 2 } });
    const request = () => app.inject({ url: '/v1/first', headers: authorization(keys[0]!) });
    expect((await request()).statusCode).toBe(200);
    setNow(200);
    expectLimited(await request(), 1);
    setNow(400);
    expectLimited(await request(), 1);
    setNow(500);
    const refilled = await request();
    expect(refilled.statusCode).toBe(200);
    expectRateHeaders(refilled, 1, 0);
    setNow(100_000);
    expect((await request()).statusCode).toBe(200);
    expectLimited(await request(), 1);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('exempts both public probes before and after exhaustion, including supplied credentials', async () => {
    const { app, keys } = createApp({
      rateLimit: { capacity: 1, refillPerSecond: 1 }, readiness: () => false,
    });
    for (let round = 0; round < 2; round++) {
      for (const [url, statusCode] of [['/healthz', 200], ['/readyz', 503]] as const) {
        for (const headers of [{}, authorization(keys[0]!), authorization(newKey())]) {
          const response = await app.inject({ url, headers });
          expect(response.statusCode).toBe(statusCode);
          expectNoRateHeaders(response);
        }
      }
      const response = await app.inject({ url: '/v1/first', headers: authorization(keys[0]!) });
      if (round === 0) {
        expect(response.statusCode).toBe(200);
        expectRateHeaders(response, 1, 0);
      } else expectLimited(response, 1);
    }
  });

  it('denies invalid authentication without using tokens, even for an exhausted key', async () => {
    const { app, keys, handler } = createApp({ rateLimit: { capacity: 1, refillPerSecond: 1 } });
    const badHeaders = [{}, authorization(newKey()), { authorization: `Bearer ${keys[0]} extra` }];
    for (let round = 0; round < 2; round++) {
      for (const headers of badHeaders) {
        const response = await app.inject({
          method: 'POST', url: '/v1/second',
          headers: { ...headers, 'content-type': 'application/json' }, payload: '{invalid',
        });
        expect(response.statusCode).toBe(401);
        expectNoRateHeaders(response);
      }
      const response = await app.inject({ url: '/v1/first', headers: authorization(keys[0]!) });
      if (round === 0) expect(response.statusCode).toBe(200);
      else expectLimited(response, 1);
    }
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('charges authenticated parser failures, schema failures and unknown routes', async () => {
    const { app, keys, handler } = createApp({ rateLimit: { capacity: 3, refillPerSecond: 1 } });
    const headers = authorization(keys[0]!);
    const malformed = await app.inject({
      method: 'POST', url: '/v1/second', headers: { ...headers, 'content-type': 'application/json' }, payload: '{invalid',
    });
    expect(malformed.statusCode).toBe(400);
    expectRateHeaders(malformed, 3, 2);
    const invalid = await app.inject({ method: 'POST', url: '/v1/schema', headers, payload: { count: '1' } });
    expect(invalid.statusCode).toBe(400);
    expectRateHeaders(invalid, 3, 1);
    const missing = await app.inject({ url: '/v1/missing', headers });
    expect(missing.statusCode).toBe(404);
    expectRateHeaders(missing, 3, 0);
    expectLimited(await app.inject({ url: '/v1/first', headers }), 3);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects exhausted requests before body parsing, media validation or route execution', async () => {
    const { app, keys, handler } = createApp({ rateLimit: { capacity: 1, refillPerSecond: 1 } });
    const preParsing = vi.fn(async (_request, _reply, payload) => payload);
    app.addHook('preParsing', preParsing);
    const headers = authorization(keys[0]!);
    expect((await app.inject({ url: '/v1/first', headers })).statusCode).toBe(200);
    preParsing.mockClear();
    for (const body of [
      { headers: { 'content-type': 'application/json' }, payload: '{invalid' },
      { headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ value: 'x'.repeat(65_536) }) },
      { headers: { 'content-type': 'text/plain' }, payload: 'unsupported' },
      { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, payload: '{}' },
    ]) {
      expectLimited(await app.inject({ method: 'POST', url: '/v1/second', ...body, headers: { ...headers, ...body.headers } }), 1);
    }
    expect(preParsing).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('rate-limit response and log privacy', () => {
  it('records outcomes at trace without credentials, opaque key identities or request content', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); },
    });
    const { app, keys, apiKeys } = createApp({
      logger: { level: 'trace', stream }, rateLimit: { capacity: 1, refillPerSecond: 1 },
    });
    const privateValue = randomUUID();
    const unknownKey = newKey();
    const headers = { ...authorization(keys[0]!), cookie: privateValue, 'x-request-id': privateValue };
    const responses = [
      await app.inject({ method: 'POST', url: `/v1/second?private=${privateValue}`, headers, payload: { privateValue } }),
      await app.inject({ method: 'POST', url: `/v1/${privateValue}?private=${privateValue}`, headers, payload: { privateValue } }),
      await app.inject({ url: '/v1/first', headers: authorization(unknownKey) }),
    ];
    expect(responses.map((response) => response.statusCode)).toEqual([200, 429, 401]);
    expectLimited(responses[1]!, 1);
    await app.close();
    const logs = chunks.join('');
    const output = logs + responses.map((response) => JSON.stringify({ headers: response.headers, body: response.body })).join('');
    for (const value of [...keys, unknownKey, privateValue, ...keys.map((key) => apiKeys.authenticate(key)!)]) {
      expect(output).not.toContain(value);
    }
    const records = logs.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const completed = records.filter((record) => record.event === 'request_completed');
    expect(completed.map((record) => record.statusCode)).toEqual([200, 429, 401]);
    expect(completed.map((record) => record.route)).toEqual(['/v1/second', 'unmatched', '/v1/first']);
    for (const record of records) {
      for (const field of ['apiKeyId', 'authorization', 'body', 'headers', 'url', 'err', 'error']) {
        expect(record).not.toHaveProperty(field);
      }
    }
  });
});
