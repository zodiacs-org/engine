import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ApiKeyStore } from '../src/api-keys.js';

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('hex');
const authorized = { authorization: `Bearer ${key}` };

function createApp(options: Parameters<typeof buildApp>[0] = { logger: false }) {
  const app = buildApp({ apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}

function expectEngineEnvelope(body: Record<string, unknown>, requestId: unknown) {
  expect(body.engine).toEqual({
    name: '@zodiacs/engine',
    version: expect.any(String),
    ephemeris: { name: 'astronomy-engine', version: '2.1.19' },
  });
  expect(body.receipts).toEqual([]);
  expect(body.requestId).toBe(requestId);
  expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('service probes', () => {
  it.each([
    ['/healthz', 'ok'],
    ['/readyz', 'ready'],
  ])('serves %s with engine metadata and response headers', async (path, status) => {
    const response = await createApp().inject({ method: 'GET', url: path });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.json().data).toEqual({ status });
    expectEngineEnvelope(response.json(), response.headers['x-request-id']);
  });

  it('keeps liveness available while readiness changes', async () => {
    let ready = false;
    const app = createApp({ logger: false, readiness: () => ready });
    const unavailable = await app.inject('/readyz');
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error).toEqual({ code: 'not_ready', message: 'Server is not ready.' });
    expectEngineEnvelope(unavailable.json(), unavailable.headers['x-request-id']);
    expect(unavailable.headers['cache-control']).toBe('no-store');
    expect((await app.inject('/healthz')).statusCode).toBe(200);
    ready = true;
    expect((await app.inject('/readyz')).json().data).toEqual({ status: 'ready' });
  });

  it('generates distinct request IDs and ignores caller IDs', async () => {
    const app = createApp();
    const supplied = randomUUID();
    const first = await app.inject({ url: '/healthz', headers: { 'x-request-id': supplied } });
    const second = await app.inject({ url: '/healthz', headers: { 'x-request-id': supplied } });
    expect(first.headers['x-request-id']).not.toBe(supplied);
    expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id']);
    expectEngineEnvelope(first.json(), first.headers['x-request-id']);
    expectEngineEnvelope(second.json(), second.headers['x-request-id']);
  });
});

describe('error boundary', () => {
  it.each(['malformed URL', 'mismatched content length'])('sanitizes %s before ordinary route handling', async (kind) => {
    const canary = randomUUID();
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const app = createApp({ logger: { level: 'info', stream } });
    app.post('/payload', async () => ({ accepted: true }));
    const response = kind === 'malformed URL'
      ? await app.inject({ method: 'GET', url: `/%ZZ?private=${canary}` })
      : await app.inject({
        method: 'POST',
        url: '/payload',
        headers: { ...authorized, 'content-type': 'application/json', 'content-length': '1' },
        payload: JSON.stringify({ private: canary }),
      });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toEqual({ code: 'invalid_request', message: 'Request is invalid.' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expectEngineEnvelope(response.json(), response.headers['x-request-id']);
    await app.close();
    expect(response.body + chunks.join('')).not.toContain(canary);
  });

  it.each(['GET', 'POST', 'DELETE'] as const)('sanitizes unknown %s routes and methods', async (method) => {
    const canary = randomUUID();
    const response = await createApp().inject({ method, url: `/${canary}?private=${canary}`, headers: authorized });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toEqual({ code: 'not_found', message: 'Route not found.' });
    expect(response.body).not.toContain(canary);
    expectEngineEnvelope(response.json(), response.headers['x-request-id']);
  });

  it('does not treat an unsupported method as a successful probe', async () => {
    const response = await createApp().inject({ method: 'POST', url: '/healthz', headers: authorized });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('sanitizes unexpected route failures', async () => {
    const app = createApp();
    const canary = randomUUID();
    app.get('/failure', async () => { throw new Error(canary); });
    const response = await app.inject({ url: '/failure', headers: authorized });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toEqual({ code: 'internal_error', message: 'Internal server error.' });
    expect(response.body).not.toContain(canary);
    expectEngineEnvelope(response.json(), response.headers['x-request-id']);
  });

  it('sanitizes errors thrown by the readiness provider', async () => {
    const canary = randomUUID();
    const app = createApp({ logger: false, readiness: () => { throw new Error(canary); } });
    const response = await app.inject('/readyz');
    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe('internal_error');
    expect(response.body).not.toContain(canary);
  });

  it.each([
    { status: 400, contentType: 'application/json', payload: (canary: string) => `{"value":"${canary}` },
    { status: 413, contentType: 'application/json', payload: (canary: string) => JSON.stringify({ value: canary.repeat(8) }) },
    { status: 415, contentType: 'application/x-private', payload: (canary: string) => canary },
  ])('sanitizes framework body errors with status $status', async ({ status, contentType, payload }) => {
    const canary = randomUUID();
    const app = createApp();
    app.post('/payload', { bodyLimit: status === 413 ? 16 : 1024 }, async () => ({ accepted: true }));
    const response = await app.inject({ method: 'POST', url: '/payload', headers: { ...authorized, 'content-type': contentType }, payload: payload(canary) });
    expect(response.statusCode).toBe(status);
    expect(response.json().error).toEqual({ code: expect.any(String), message: expect.any(String) });
    expect(Object.keys(response.json()).sort()).toEqual(['engine', 'error', 'receipts', 'requestId']);
    expect(response.body).not.toContain(canary);
    expect(response.body).not.toContain('stack');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expectEngineEnvelope(response.json(), response.headers['x-request-id']);
  });
});

describe('structured request logs', () => {
  it('records route templates and timing while omitting caller data and raw errors', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const app = createApp({ logger: { level: 'info', stream } });
    const canary = randomUUID();
    app.get('/records/:id', async () => ({ accepted: true }));
    app.get('/failure', async () => { throw new Error(canary); });
    const responses = [
      await app.inject({ url: `/healthz?private=${canary}`, headers: { authorization: canary, 'x-request-id': canary, 'x-forwarded-for': canary } }),
      await app.inject({ url: `/records/${canary}`, headers: authorized }),
      await app.inject({ method: 'POST', url: `/${canary}?private=${canary}`, payload: { private: canary }, headers: authorized }),
      await app.inject({ url: '/failure', headers: authorized }),
    ];
    await app.close();
    const output = chunks.join('');
    expect(output).not.toContain(canary);
    expect(output).not.toContain(key);
    const records = output.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
    const completed = records.filter((record) => record.event === 'request_completed');
    expect(completed).toHaveLength(4);
    expect(completed.map(({ route, statusCode }) => ({ route, statusCode }))).toEqual([
      { route: '/healthz', statusCode: 200 },
      { route: '/records/:id', statusCode: 200 },
      { route: 'unmatched', statusCode: 404 },
      { route: '/failure', statusCode: 500 },
    ]);
    for (const [index, record] of completed.entries()) {
      expect(record.reqId).toBe(responses[index]!.headers['x-request-id']);
      expect(record.durationMs).toEqual(expect.any(Number));
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
      for (const key of ['url', 'body', 'headers', 'ip', 'remoteAddress', 'req', 'res', 'err', 'error']) {
        expect(record).not.toHaveProperty(key);
      }
    }
    expect(completed.map((record) => record.method)).toEqual(['GET', 'GET', 'POST', 'GET']);
  });
});
