import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdmissionLimiter, admissionLimits } from '../src/admission-limit.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe('bounded client admission', () => {
  it('enforces defaults and scales to the configured per-key allowance', () => {
    expect(admissionLimits()).toEqual({ capacity: 120, windowMs: 60_000, maxClients: 4_096 });
    expect(admissionLimits({ capacity: 500, refillPerSecond: 1 }).capacity).toBe(500);
    expect(admissionLimits({ capacity: 1, refillPerSecond: 10 }).capacity).toBe(600);
  });

  it('refuses excess clients without evicting exhausted identities, and recovers at the window boundary', () => {
    let now = 0;
    const limiter = new AdmissionLimiter({ capacity: 2, windowMs: 1_000, maxClients: 2 }, () => now);
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.consume('b').allowed).toBe(true);
    for (let index = 0; index < 10_000; index++) expect(limiter.consume(`new-${index}`).allowed).toBe(false);
    expect(limiter.consume('a').allowed).toBe(false);
    expect(limiter.consume('b').allowed).toBe(true);
    now = 999;
    expect(limiter.consume('new').allowed).toBe(false);
    now = 1_000;
    expect(limiter.consume('new').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(true);
  });

  it('does not reset allowances on a backwards or invalid clock', () => {
    let now = 1_000;
    const limiter = new AdmissionLimiter({ capacity: 1, windowMs: 1_000, maxClients: 1 }, () => now);
    limiter.consume('a');
    now = NaN;
    expect(() => limiter.consume('a')).toThrow('Admission clock must return finite milliseconds.');
    now = 0;
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterSeconds: 2 });
    now = 1_999;
    expect(limiter.consume('a').allowed).toBe(false);
    now = 2_000;
    expect(limiter.consume('a').allowed).toBe(true);
  });

  it.each([
    ['missing authentication', '/v1/natal', undefined, 401],
    ['rejected authentication', '/v1/natal', 'Bearer invalid', 401],
    ['malformed authentication', '/v1/natal', 'Basic invalid', 401],
    ['liveness', '/healthz', undefined, 200],
    ['readiness', '/readyz', undefined, 200],
    ['discovery', '/openapi.json', 'Bearer invalid', 200],
    ['unknown route', '/missing', undefined, 401],
  ] as const)('returns 429 after the admission limit for %s, before authentication and parsing', async (_name, url, authorization, status) => {
    let now = 0;
    const keys = new ApiKeyStore([randomBytes(32).toString('base64url')]);
    const authenticate = vi.spyOn(keys, 'authenticate');
    const app = buildApp({ logger: false, apiKeys: keys, monotonicNow: () => now });
    apps.push(app);
    const preParsing = vi.fn(async (_request, _reply, payload) => payload);
    app.addHook('preParsing', preParsing);
    let forwarded = 0;
    const request = (peer = '192.0.2.1') => app.inject({
      method: url === '/v1/natal' ? 'POST' : 'GET', url, remoteAddress: peer,
      headers: { ...(authorization ? { authorization } : {}), 'x-forwarded-for': `198.51.100.${forwarded++ % 256}` },
    });
    for (let index = 0; index < admissionLimits().capacity; index++) expect((await request()).statusCode).toBe(status);
    authenticate.mockClear();
    preParsing.mockClear();
    const limited = await request();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.json()).toMatchObject({
      requestId: limited.headers['x-request-id'], receipts: [],
      error: { code: 'rate_limited', message: 'Client request limit exceeded.' },
    });
    expect(authenticate).not.toHaveBeenCalled();
    expect(preParsing).not.toHaveBeenCalled();
    expect((await request('192.0.2.2')).statusCode).toBe(status);
    now = 60_000;
    expect((await request()).statusCode).toBe(status);
  });

  it('throttles public and rejected-auth traffic sharing a real loopback socket IP', async () => {
    const app = buildApp({ logger: false, monotonicNow: () => 0 });
    apps.push(app);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    for (let index = 0; index < admissionLimits().capacity; index++) {
      const response = await fetch(address + (index % 2 === 0 ? '/healthz' : '/missing'), {
        headers: { authorization: 'Bearer invalid', 'x-forwarded-for': `198.51.100.${index}` },
      });
      expect(response.status).toBe(index % 2 === 0 ? 200 : 401);
      await response.json();
    }
    for (const path of ['/healthz', '/missing']) {
      const response = await fetch(address + path);
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('60');
      expect((await response.json()).error.code).toBe('rate_limited');
    }
  });

  it('shares admission across routes, credentials and concurrent requests, including authenticated traffic', async () => {
    const key = randomBytes(32).toString('base64url');
    const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), monotonicNow: () => 0 });
    apps.push(app);
    const responses = await Promise.all(Array.from({ length: 121 }, (_, index) => app.inject({
      url: ['/healthz', '/readyz', '/missing'][index % 3]!,
      headers: index % 3 === 2 ? { authorization: `Bearer ${key}` } : {},
    })));
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(1);
    expect((await app.inject('/openapi.json')).statusCode).toBe(429);
    const otherApp = buildApp({ logger: false, monotonicNow: () => 0 });
    apps.push(otherApp);
    expect((await otherApp.inject('/healthz')).statusCode).toBe(200);
  });
});
