import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, FastifyRequest, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';
import { success } from '../src/responses.js';

const apps: FastifyInstance[] = [];
const newKey = () => randomBytes(32).toString('base64url');

function createApp(keys?: string[], logger: NonNullable<Parameters<typeof buildApp>[0]>['logger'] = false) {
  const apiKeys = keys === undefined ? new ApiKeyStore() : new ApiKeyStore(keys);
  const app = buildApp({ logger, apiKeys });
  apps.push(app);
  const handler = vi.fn(async (request: FastifyRequest) => success(request.id, { accepted: true }));
  // This test-only route verifies that future calculation handlers inherit auth.
  app.post('/v1/protected', handler);
  return { app, handler };
}

function expectUnauthorized(response: LightMyRequestResponse) {
  expect(response.statusCode).toBe(401);
  expect(response.headers['www-authenticate']).toBe('Bearer realm="engine-api"');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.json()).toEqual({
    requestId: response.headers['x-request-id'],
    engine: expect.objectContaining({ name: '@zodiacs/engine', version: expect.any(String) }),
    receipts: [],
    error: { code: 'unauthorized', message: 'A valid API key is required.' },
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('default route authentication', () => {
  it('denies protected requests when the app has no configured keys', async () => {
    const { app, handler } = createApp();
    for (const headers of [{}, { authorization: `Bearer ${newKey()}` }]) {
      expectUnauthorized(await app.inject({ method: 'POST', url: '/v1/protected', headers }));
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts configured keys with a case-insensitive scheme and keeps key identities separate', async () => {
    const keys = [newKey(), newKey()];
    const { app, handler } = createApp(keys);
    for (const [index, scheme] of ['Bearer', 'bearer', 'BEARER'].entries()) {
      const response = await app.inject({
        method: 'POST', url: '/v1/protected',
        headers: { authorization: `${scheme} ${keys[index % keys.length]}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual({ accepted: true });
      expect(response.headers).not.toHaveProperty('www-authenticate');
      for (const key of keys) expect(response.body).not.toContain(key);
    }
    const identities = handler.mock.calls.map(([request]) => request.apiKeyId);
    expect(identities[0]).toEqual(expect.any(String));
    expect(identities[1]).not.toBe(identities[0]);
    expect(identities[2]).toBe(identities[0]);
    for (const key of keys) expect(identities).not.toContain(key);
  });

  it.each([
    'missing', 'unknown', 'basic', 'empty', 'extra spaces', 'tab', 'comma',
    'suffix', 'newline', 'oversize', 'array', 'duplicate',
  ])('denies %s credentials before validation or handler execution', async (kind) => {
    const key = newKey();
    const { app, handler } = createApp([key]);
    const headerCases: Record<string, string | string[] | undefined> = {
      missing: undefined,
      unknown: `Bearer ${newKey()}`,
      basic: `Basic ${key}`,
      empty: 'Bearer ',
      'extra spaces': `Bearer  ${key}`,
      tab: `Bearer\t${key}`,
      comma: `Bearer ${key}, Bearer ${key}`,
      suffix: `Bearer ${key} extra`,
      newline: `Bearer ${key}\n`,
      oversize: `Bearer ${key.repeat(8)}`,
      array: [`Bearer ${key}`, `Bearer ${newKey()}`],
      duplicate: [`Bearer ${key}`, `Bearer ${key}`],
    };
    const authorization = headerCases[kind];
    const headers: Record<string, string | string[]> = { 'content-type': 'application/json' };
    if (authorization !== undefined) headers.authorization = authorization;
    const response = await app.inject({
      method: 'POST', url: '/v1/protected',
      headers,
      payload: '{invalid-json',
    });
    expectUnauthorized(response);
    expect(handler).not.toHaveBeenCalled();
    expect(response.body).not.toContain(key);
  });

  it('ignores keys in query parameters, bodies, cookies and alternate headers', async () => {
    const key = newKey();
    const { app, handler } = createApp([key]);
    const response = await app.inject({
      method: 'POST', url: `/v1/protected?api_key=${key}&access_token=${key}`,
      headers: { 'x-api-key': key, cookie: `api_key=${key}` },
      payload: { apiKey: key, authorization: `Bearer ${key}` },
    });
    expectUnauthorized(response);
    expect(handler).not.toHaveBeenCalled();
  });

  it('leaves exact GET probes and discovery public, including while unready', async () => {
    const app = buildApp({ logger: false, readiness: () => false });
    apps.push(app);
    for (const [url, status] of [['/healthz', 200], ['/readyz', 503]] as const) {
      const response = await app.inject({ url: `${url}?ignored=1`, headers: { authorization: 'invalid' } });
      expect(response.statusCode).toBe(status);
      expect(response.headers).not.toHaveProperty('www-authenticate');
    }
    expect((await app.inject('/openapi.json')).statusCode).toBe(200);
    for (const url of ['/healthz/', '/readyz/extra', '/HEALTHZ', '/openapi.json/', '/v1/unknown']) {
      expectUnauthorized(await app.inject({ method: 'GET', url }));
    }
    for (const method of ['POST', 'OPTIONS', 'DELETE'] as const) {
      expectUnauthorized(await app.inject({ method, url: '/healthz' }));
    }
    const head = await app.inject({ method: 'HEAD', url: '/healthz' });
    expect(head.statusCode).toBe(401);
    expect(head.headers['www-authenticate']).toBe('Bearer realm="engine-api"');
    expect(head.headers['cache-control']).toBe('no-store');
  });

  it('returns a sanitized not-found only after authentication and protects nested routes', async () => {
    const key = newKey();
    const { app } = createApp([key]);
    app.register(async (child) => {
      child.get('/nested', async (request) => success(request.id, { authenticated: request.apiKeyId !== null }));
    }, { prefix: '/v1' });
    expectUnauthorized(await app.inject('/v1/nested'));
    const headers = { authorization: `Bearer ${key}` };
    expect((await app.inject({ url: '/v1/nested', headers })).json().data).toEqual({ authenticated: true });
    expectUnauthorized(await app.inject('/v1/unknown'));
    const missing = await app.inject({ url: '/v1/unknown', headers });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
  });
});

describe('authentication privacy', () => {
  it('logs request outcomes at trace without raw keys, paths, bodies or headers', async () => {
    const key = newKey();
    const unknownKey = newKey();
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); },
    });
    const { app } = createApp([key], { level: 'trace', stream });
    const responses = [
      await app.inject({ method: 'POST', url: '/v1/protected', headers: { authorization: `Bearer ${key}` } }),
      await app.inject({ method: 'POST', url: '/v1/protected', headers: { authorization: `Bearer ${unknownKey}` } }),
      await app.inject({ url: `/v1/${key}?api_key=${unknownKey}` }),
      await app.inject({ method: 'POST', url: '/v1/protected', payload: { key }, headers: { cookie: unknownKey } }),
      await app.inject({ url: `/healthz?key=${key}`, headers: { authorization: `Bearer ${unknownKey}` } }),
    ];
    await app.close();
    const logs = chunks.join('');
    const output = logs + responses.map((response) => response.body).join('');
    expect(output).not.toContain(key);
    expect(output).not.toContain(unknownKey);
    const records = logs.trim().split('\n').map((line) => JSON.parse(line));
    expect(records.filter((record) => record.event === 'request_completed').map((record) => record.statusCode))
      .toEqual([200, 401, 401, 401, 200]);
  });
});
