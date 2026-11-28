import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error autocannon's JavaScript package has no declarations.
import autocannon from 'autocannon';
// @ts-expect-error The standalone load script shares its JavaScript helpers.
import { WORKLOADS, clientKeySetup, observations, readOptions, summarize, verifyResponse } from '../scripts/load-support.mjs';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';
import { engineIdentity } from '../src/engine.js';

interface Workload {
  name: string;
  path: string;
  body: object;
  scopes: string[];
}

const workloads: Workload[] = WORKLOADS;
const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function resultFixture(count = 100) {
  return {
    start: new Date('2004-02-29T00:00:00Z'),
    finish: new Date('2004-02-29T00:00:02.500Z'),
    duration: 2.49,
    requests: { sent: count + 3, total: count },
    statusCodeStats: { 200: { count } } as Record<string, { count: number }>,
    errors: 0,
    timeouts: 0,
    mismatches: 0,
    non2xx: 0,
    // Deliberately unrelated to the independent observations. Autocannon's
    // standard percentiles do not include p95, so never rename its p97.5.
    latency: { p50: 900, p95: 950, p97_5: 975, max: 999 },
  };
}

const timing = { durationSeconds: 2.5, requestedDurationSeconds: 2 };

function sampleObservations(count = 100) {
  const observed = observations();
  for (let i = 1; i <= count; i++) observed.record(200, i);
  return observed;
}

describe('load harness options', () => {
  it('defaults to the synthetic workload suite with bounded settings', () => {
    expect(readOptions([])).toEqual({
      duration: 10, warmup: 2, connections: [1, 4], repetitions: 1,
      routes: workloads.map(({ name }) => name),
    });
    expect(new Set(workloads.map(({ name }) => name)).size).toBe(workloads.length);
    expect(new Set(workloads.map(({ path }) => path)).size).toBe(workloads.length);
  });

  it('accepts boundary values and selected route ordering', () => {
    expect(readOptions([
      '--duration', '60', '--warmup', '30', '--connections', '8,1',
      '--repetitions', '5', '--routes', 'houses,natal',
    ])).toEqual({ duration: 60, warmup: 30, connections: [8, 1], repetitions: 5, routes: ['houses', 'natal'] });
    expect(readOptions(['--duration', '1', '--warmup', '1', '--connections', '1', '--repetitions', '1']))
      .toMatchObject({ duration: 1, warmup: 1, connections: [1], repetitions: 1 });
  });

  it.each([
    ['--duration', '61'], ['--warmup', '31'], ['--connections', '9'], ['--repetitions', '6'],
    ['--duration', '0'], ['--warmup', '-1'], ['--connections', '1.5'], ['--repetitions', 'Infinity'],
    ['--duration', '01'], ['--duration', '1e1'], ['--duration', ' 1'], ['--duration', '+1'],
    ['--duration', '1,2'], ['--warmup', '1,2'], ['--repetitions', '1,2'],
    ['--connections', '1,1'], ['--connections', '1,'], ['--connections', ',1'],
    ['--routes', 'natal,natal'], ['--routes', 'NATAL'], ['--routes', 'natal,'], ['--routes', 'unknown'],
    ['--routes', ''], ['--duration'], ['duration', '1'], ['--duration=1'], ['--unknown', '1'],
    ['--duration', '1', '--duration', '2'],
  ])('rejects ambiguous or out-of-range arguments %j', (...args: string[]) => {
    expect(() => readOptions(args)).toThrow(/Invalid load/u);
  });
});

describe('load harness response checks', () => {
  it.each(workloads)('accepts actual engine receipts for $name and rejects incomplete envelopes', async (workload) => {
    const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]) });
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: workload.path,
      headers: { authorization: `Bearer ${key}` }, payload: workload.body,
    });
    expect(response.statusCode).toBe(200);
    expect(verifyResponse(response.body, workload, engineIdentity)).toBe(true);

    for (const malformed of ['{', 'null', '[]', 'true', '"response"']) {
      expect(verifyResponse(malformed, workload, engineIdentity)).toBe(false);
    }
    for (const field of ['data', 'requestId', 'engine', 'receipts']) {
      const incomplete = response.json();
      delete incomplete[field];
      expect(verifyResponse(JSON.stringify(incomplete), workload, engineIdentity)).toBe(false);
    }
    const incorrectEngine = response.json();
    incorrectEngine.engine.version = '0.0.0';
    expect(verifyResponse(JSON.stringify(incorrectEngine), workload, engineIdentity)).toBe(false);
    const error = response.json();
    error.error = { code: 'rate_limited', message: 'API key request limit exceeded.' };
    expect(verifyResponse(JSON.stringify(error), workload, engineIdentity)).toBe(false);
    const incorrectRequestId = response.json();
    incorrectRequestId.requestId = 123;
    expect(verifyResponse(JSON.stringify(incorrectRequestId), workload, engineIdentity)).toBe(false);
    const missingReceipt = response.json();
    missingReceipt.receipts.pop();
    expect(verifyResponse(JSON.stringify(missingReceipt), workload, engineIdentity)).toBe(false);
    const extraReceipt = response.json();
    extraReceipt.receipts.push(extraReceipt.receipts[0]);
    expect(verifyResponse(JSON.stringify(extraReceipt), workload, engineIdentity)).toBe(false);

    for (const [index, scope] of workload.scopes.entries()) {
      const incorrectScope = response.json();
      incorrectScope.receipts[index].scope = '/uncovered';
      expect(verifyResponse(JSON.stringify(incorrectScope), workload, engineIdentity)).toBe(false);
      const missingChart = response.json();
      const components = scope.split('/').slice(1);
      let container = missingChart;
      for (const component of components.slice(0, -1)) container = container[component];
      delete container[components.at(-1)!];
      expect(verifyResponse(JSON.stringify(missingChart), workload, engineIdentity)).toBe(false);

      const missingProvenance = response.json();
      if (workload.name === 'houses') delete missingProvenance.receipts[index].receipt;
      else delete missingProvenance.receipts[index].envelope.receipt;
      expect(verifyResponse(JSON.stringify(missingProvenance), workload, engineIdentity)).toBe(false);
      const inconsistent = response.json();
      if (workload.name === 'houses') inconsistent.receipts[index].receipt = { unrelated: true };
      else inconsistent.receipts[index].envelope.receipt.engine.version = '0.0.0';
      expect(verifyResponse(JSON.stringify(inconsistent), workload, engineIdentity)).toBe(false);
      for (const field of ['name', 'ephemeris']) {
        const incorrectIdentity = response.json();
        const receipt = workload.name === 'houses'
          ? incorrectIdentity.receipts[index].receipt
          : incorrectIdentity.receipts[index].envelope.receipt;
        delete receipt.engine[field];
        if (workload.name === 'houses') incorrectIdentity.data.receipt = receipt;
        expect(verifyResponse(JSON.stringify(incorrectIdentity), workload, engineIdentity)).toBe(false);
      }
      if (workload.name === 'houses') {
        const emptyReceipts = response.json();
        emptyReceipts.receipts[index].receipt = {};
        emptyReceipts.data.receipt = {};
        expect(verifyResponse(JSON.stringify(emptyReceipts), workload, engineIdentity)).toBe(false);
        for (const field of ['schema', 'request', 'engine', 'instants', 'conventions']) {
          const missing = response.json();
          delete missing.receipts[index].receipt[field];
          missing.data.receipt = missing.receipts[index].receipt;
          expect(verifyResponse(JSON.stringify(missing), workload, engineIdentity)).toBe(false);
        }
        for (const field of ['instants', 'conventions']) {
          for (const invalid of [[], {}, null]) {
            const invalidArray = response.json();
            invalidArray.receipts[index].receipt[field] = invalid;
            invalidArray.data.receipt = invalidArray.receipts[index].receipt;
            expect(verifyResponse(JSON.stringify(invalidArray), workload, engineIdentity)).toBe(false);
          }
        }
      }
      if (workload.name !== 'houses') {
        for (const position of ['envelope', 'receipt']) {
          const missingSchema = response.json();
          const envelope = missingSchema.receipts[index].envelope;
          delete (position === 'envelope' ? envelope : envelope.receipt).schema;
          expect(verifyResponse(JSON.stringify(missingSchema), workload, engineIdentity)).toBe(false);
        }
        const missingResult = response.json();
        delete missingResult.receipts[index].envelope.result;
        expect(verifyResponse(JSON.stringify(missingResult), workload, engineIdentity)).toBe(false);
        const missingBodies = response.json();
        let chart = missingBodies;
        for (const component of components) chart = chart[component];
        delete chart.bodies;
        expect(verifyResponse(JSON.stringify(missingBodies), workload, engineIdentity)).toBe(false);
      }
    }
  });
});

describe('load harness measurements', () => {
  it('uses observed p50 and p95 ranks in milliseconds and conserves completed requests', () => {
    const summary = summarize(resultFixture(), sampleObservations(), timing);
    expect(summary).toMatchObject({
      passed: true, durationSeconds: 2.5, sent: 103, completed: 100, unfinishedAtStop: 3,
      autocannonDurationSeconds: 2.49, requestedDurationSeconds: 2,
      successfulResponsesPerSecond: 40, statusCounts: { 200: 100 }, latencyMs: { samples: 100 },
    });
    // Rank 95 among observations 1..100 is 95, distinct from ranks 97 and 98.
    // The histogram uses three significant digits, so allow its bucket width.
    expect(summary.latencyMs.p50).toBeGreaterThanOrEqual(50);
    expect(summary.latencyMs.p50).toBeLessThan(50.1);
    expect(summary.latencyMs.p95).toBeGreaterThanOrEqual(95);
    expect(summary.latencyMs.p95).toBeLessThan(95.1);
    expect(summary.latencyMs.max).toBeGreaterThanOrEqual(100);
    expect(summary.latencyMs.max).toBeLessThan(100.1);
  });

  it.each(['errors', 'timeouts', 'mismatches', 'non2xx'] as const)('fails the run on %s despite HTTP 200 responses', (field) => {
    const result = resultFixture();
    result[field] = 1;
    expect(summarize(result, sampleObservations(), timing).passed).toBe(false);
  });

  it('counts throttled responses as failures and excludes them from successful throughput', () => {
    const result = resultFixture(2);
    result.statusCodeStats = { 200: { count: 1 }, 429: { count: 1 } };
    result.non2xx = 1;
    const observed = observations();
    observed.record(200, 1);
    observed.record(429, 2);
    expect(summarize(result, observed, timing)).toMatchObject({
      passed: false, completed: 2, successfulResponsesPerSecond: 0.4,
      statusCounts: { 200: 1, 429: 1 }, non2xx: 1, latencyMs: { samples: 2 },
    });
  });

  it('refuses missing samples or disagreement among response and request totals', () => {
    const mutations: ((result: ReturnType<typeof resultFixture>) => void)[] = [
      (result) => { result.duration = 0; },
      (result) => { result.duration = Number.NaN; },
      (result) => { result.duration = Infinity; },
      (result) => { result.requests.sent = 99; },
      (result) => { result.requests.sent = 100.5; },
      (result) => { result.requests.total = 99; },
      (result) => { result.statusCodeStats = { 200: { count: 99 } }; },
      (result) => { result.statusCodeStats = { 200: { count: 99 }, 429: { count: 1 } }; },
    ];
    for (const mutate of mutations) {
      const result = resultFixture();
      mutate(result);
      expect(() => summarize(result, sampleObservations(), timing)).toThrow('Incomplete load measurements.');
    }
    expect(() => summarize(resultFixture(), sampleObservations(99), timing)).toThrow('Incomplete load measurements.');
    expect(() => summarize(resultFixture(0), observations(), timing)).toThrow('Incomplete load measurements.');
  });

  it.each([0, -1, Number.NaN, Infinity])('refuses an invalid monotonic elapsed duration %s', (durationSeconds) => {
    expect(() => summarize(resultFixture(), sampleObservations(), { ...timing, durationSeconds }))
      .toThrow('Incomplete load measurements.');
  });

  it.each([0, -1, Number.NaN, Infinity])('refuses an invalid requested duration %s', (requestedDurationSeconds) => {
    expect(() => summarize(resultFixture(), sampleObservations(), { ...timing, requestedDurationSeconds }))
      .toThrow('Incomplete load measurements.');
  });

  it.each([-1, Number.NaN, Infinity, 60_000.001])('refuses invalid response duration %s without dropping the status count', (duration) => {
    const observed = observations();
    observed.record(200, duration);
    expect(observed.statuses).toEqual({ 200: 1 });
    expect(observed.invalidTimings).toBe(1);
    expect(observed.histogram.count).toBe(0);
    expect(() => summarize(resultFixture(1), observed, timing)).toThrow('Incomplete load measurements.');
  });

  it('accepts a zero observation and the maximum supported duration', () => {
    const observed = observations();
    observed.record(200, 0);
    observed.record(200, 60_000);
    expect(observed.invalidTimings).toBe(0);
    expect(observed.histogram.count).toBe(2);
    expect(summarize(resultFixture(2), observed, timing).passed).toBe(true);
  });

  it('serializes only whitelisted aggregate fields without request or response details', () => {
    const canary = randomUUID();
    const result = {
      ...resultFixture(),
      url: `http://127.0.0.1/${canary}`,
      headers: { authorization: `Bearer ${canary}` },
      body: JSON.stringify({ birth: canary }),
      error: new Error(canary),
      response: { data: canary, requestId: canary },
      arbitrary: canary,
      statusCodeStats: { 200: { count: 100, body: canary } },
      requests: { sent: 103, total: 100, private: canary },
    };
    const summary = summarize(result, sampleObservations(), timing);
    expect(JSON.stringify(summary)).not.toContain(canary);
    expect(Object.keys(summary).sort()).toEqual([
      'autocannonDurationSeconds', 'bodyMismatches', 'completed', 'durationSeconds', 'errors', 'finishedAt', 'latencyMs', 'non2xx',
      'passed', 'requestedDurationSeconds', 'sent', 'startedAt', 'statusCounts', 'successfulResponsesPerSecond', 'timeouts', 'unfinishedAtStop',
    ].sort());
    expect(Object.keys(summary.latencyMs).sort()).toEqual(['max', 'p50', 'p95', 'samples']);
    expect(summary.statusCounts).toEqual({ 200: 100 });
  });
});

describe('autocannon response accounting integration', () => {
  it('refuses an extra connection instead of silently reusing an assigned key', () => {
    const setup = clientKeySetup([randomBytes(32).toString('base64url')]);
    let assigned = 0;
    const client = { setHeaders() { assigned++; } };
    setup(client);
    expect(() => setup(client)).toThrow('Insufficient load client keys.');
    expect(assigned).toBe(1);
  });

  it('assigns distinct temporary API keys to connections and keeps each connection on its own key', async () => {
    const keys = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
    const received = new Map<Socket, { authorizations: Set<string | undefined>; count: number }>();
    const server = createServer((request, response) => {
      const record = received.get(request.socket) ?? { authorizations: new Set<string | undefined>(), count: 0 };
      record.authorizations.add(request.headers.authorization);
      record.count++;
      received.set(request.socket, record);
      request.resume();
      request.once('end', () => {
        const authorized = keys.some((key) => request.headers.authorization === `Bearer ${key}`);
        response.writeHead(authorized && request.headers['content-type'] === 'application/json' ? 200 : 401,
          { 'content-type': 'application/json' });
        response.end('{"test":"synthetic"}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const observed = observations();
      const startedAt = performance.now();
      const result = await new Promise<ReturnType<typeof resultFixture>>((resolve, reject) => {
        const run = autocannon({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          method: 'POST', body: '{"test":"synthetic"}',
          connections: 2, pipelining: 1, amount: 10, duration: 2,
          setupClient: clientKeySetup(keys),
          verifyBody: (body: string) => body === '{"test":"synthetic"}',
        }, (error: Error | null, result: ReturnType<typeof resultFixture>) => error ? reject(error) : resolve(result));
        run.on('response', (_client: unknown, statusCode: number, _bytes: number, milliseconds: number) => {
          observed.record(statusCode, milliseconds);
        });
      });
      const durationSeconds = (performance.now() - startedAt) / 1000;
      const summary = summarize(result, observed, { durationSeconds, requestedDurationSeconds: 2 });
      expect(summary).toMatchObject({ passed: true, completed: 10, statusCounts: { 200: 10 } });
      expect(received.size).toBe(2);
      expect([...received.values()].map(({ count }) => count)).toEqual([5, 5]);
      for (const record of received.values()) expect(record.authorizations.size).toBe(1);
      const authorizations = [...received.values()].flatMap(({ authorizations }) => [...authorizations]);
      expect(new Set(authorizations)).toEqual(new Set(keys.map((key) => `Bearer ${key}`)));
      for (const key of keys) expect(JSON.stringify(summary)).not.toContain(key);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it.each([
    { status: 200, matches: true, passed: true },
    { status: 200, matches: false, passed: false },
    { status: 429, matches: true, passed: false },
  ])('accounts for a fixed small batch: HTTP $status, matching body $matches', async ({ status, matches, passed }) => {
    const server = createServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end('{"test":"synthetic"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const observed = observations();
      let checkedBodies = 0;
      const startedAt = performance.now();
      const result = await new Promise<ReturnType<typeof resultFixture>>((resolve, reject) => {
        const run = autocannon({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          connections: 1, pipelining: 1, amount: 5, duration: 2,
          verifyBody(body: string) { checkedBodies++; return matches && body === '{"test":"synthetic"}'; },
        }, (error: Error | null, result: ReturnType<typeof resultFixture>) => error ? reject(error) : resolve(result));
        run.on('response', (_client: unknown, statusCode: number, _bytes: number, milliseconds: number) => {
          observed.record(statusCode, milliseconds);
        });
      });
      const durationSeconds = (performance.now() - startedAt) / 1000;
      const summary = summarize(result, observed, { durationSeconds, requestedDurationSeconds: 2 });
      expect(summary).toMatchObject({
        passed, sent: 5, completed: 5, unfinishedAtStop: 0,
        statusCounts: { [status]: 5 }, latencyMs: { samples: 5 },
        bodyMismatches: matches ? 0 : 5, non2xx: status === 200 ? 0 : 5,
      });
      expect(summary.durationSeconds).toBe(durationSeconds);
      expect(summary.autocannonDurationSeconds).toBe(result.duration);
      expect(summary.successfulResponsesPerSecond).toBe(status === 200 ? 5 / durationSeconds : 0);
      expect(checkedBodies).toBe(5);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
