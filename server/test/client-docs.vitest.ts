import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { createContext, runInContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_VERSION, EPHEMERIS, natalChart } from '../../src/index.js';
import { createNatalEnvelope, parseNatalEnvelope } from '../../src/receipt.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';

// Execute the published examples themselves so changes to the guide are tested.
// The VM is a test harness for trusted repository code, not a security boundary.
const guide = readFileSync(new URL('../CLIENTS.md', import.meta.url), 'utf8');
const examples = [...guide.matchAll(/^```js\n([\s\S]*?)^```/gmu)].map((match) => match[1]!);
const disposers: (() => Promise<unknown>)[] = [];
const newKey = () => randomBytes(32).toString('base64url');
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
// Invented instant and coordinates, unrelated to any person's birth.
const birth = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

interface ClientFailure extends Error {
  status: number;
  code: string;
  requestId: string | null;
  retryAfterSeconds: number | null;
}

interface ExampleClient {
  ApiFailure: new (...args: unknown[]) => ClientFailure;
  requestNatal(options?: { origin?: string; key?: string; deadlineMs?: number }): Promise<unknown>;
}

function example(env: Record<string, string> = {}, fetchImpl: typeof fetch = fetch) {
  expect(examples).toHaveLength(2);
  const output: string[] = [];
  const localProcess: { env: Record<string, string>; exitCode?: number } = { env };
  const trackedFetch = vi.fn(fetchImpl);
  const context = createContext({
    URL, AbortSignal, fetch: trackedFetch, process: localProcess,
    console: { error: (line: string) => output.push(line) },
  });
  const moduleSource = examples[0]!.replace(/^export /gmu, '');
  const client = runInContext(`${moduleSource}\n({ ApiFailure, requestNatal });`, context) as ExampleClient;
  const runUsage = async () => {
    const usageSource = examples[1]!.replace(/^import .*;\n/mu, '');
    await runInContext(`(async () => {\n${usageSource}\n})()`, context);
  };
  return { ...client, trackedFetch, output, localProcess, runUsage };
}

async function realApp(options: Parameters<typeof buildApp>[0] = {}) {
  const key = newKey();
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  disposers.push(() => app.close());
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, key, origin };
}

async function httpFixture(handler: RequestListener) {
  const server = createServer(handler);
  disposers.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  }));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback listener.');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose();
});

describe('CLIENTS.md executable Node examples', () => {
  it('returns the complete natal result and original engine receipt through HTTP', async () => {
    const { origin, key } = await realApp();
    const client = example({ API_ORIGIN: origin, API_KEY: key });
    const result = await client.requestNatal();
    const chart = natalChart(birth);
    const receipt = createNatalEnvelope(chart, { sourceInstant: birth.utc });

    // Engine parity here checks transport and receipt preservation, not accuracy.
    expect(result).toEqual({
      requestId: expect.stringMatching(uuid),
      engine: { name: '@zodiacs/engine', version: ENGINE_VERSION, ephemeris: EPHEMERIS },
      data: json(chart),
      receipts: [{ scope: '/data', envelope: json(receipt) }],
    });
    const response = result as { receipts: { envelope: unknown }[] };
    expect(parseNatalEnvelope(JSON.stringify(response.receipts[0]!.envelope)).ok).toBe(true);
    expect(client.trackedFetch).toHaveBeenCalledTimes(1);
    expect(client.output).toEqual([]);
  });

  it('reports real authentication refusals without credentials or birth data in usage diagnostics', async () => {
    const { origin, key } = await realApp();
    const rejectedKey = newKey();
    const client = example({ API_ORIGIN: origin, API_KEY: rejectedKey });
    await client.runUsage();

    expect(client.output).toHaveLength(1);
    expect(JSON.parse(client.output[0]!)).toEqual({
      status: 401, code: 'unauthorized', requestId: expect.stringMatching(uuid),
    });
    expect(client.localProcess.exitCode).toBe(1);
    expect(client.trackedFetch).toHaveBeenCalledTimes(1);
    for (const privateValue of [key, rejectedKey, origin, birth.utc]) {
      expect(client.output.join('')).not.toContain(privateValue);
    }
  });

  it('exposes the real rate-limit retry delay without retrying the rejected call', async () => {
    const { origin, key } = await realApp({
      rateLimit: { capacity: 1, refillPerSecond: 1 }, monotonicNow: () => 0,
    });
    const client = example();
    await client.requestNatal({ origin, key });
    const error: unknown = await client.requestNatal({ origin, key }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(client.ApiFailure);
    expect(error).toMatchObject({
      message: 'API request failed.', status: 429, code: 'rate_limited',
      requestId: expect.stringMatching(uuid), retryAfterSeconds: 1,
    });
    expect(client.trackedFetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(error)).not.toContain(key);
  });

  it('rejects unsafe origins and invalid deadlines before sending any credentials', async () => {
    const key = newKey();
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new Error('Unexpected network request.'); });
    const client = example({}, fetchImpl);
    for (const origin of [
      'file:///tmp/client.json', `https://${key}@example.invalid`,
      'https://example.invalid/path', 'https://example.invalid/?query=value',
      'https://example.invalid/#fragment',
    ]) {
      await expect(client.requestNatal({ origin, key })).rejects.toThrow('API_ORIGIN must be an HTTP(S) origin.');
    }
    for (const deadlineMs of [0, -1, 1.5, Number.POSITIVE_INFINITY]) {
      await expect(client.requestNatal({ origin: 'https://example.invalid', key, deadlineMs }))
        .rejects.toThrow('A finite positive deadline is required.');
    }
    await expect(client.requestNatal()).rejects.toThrow('API_ORIGIN and API_KEY are required.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses HTTP redirects without forwarding credentials to the destination', async () => {
    const received = vi.fn();
    const destination = await httpFixture((request, response) => {
      received(request.headers.authorization);
      response.end('{}');
    });
    let initialRequests = 0;
    const origin = await httpFixture((_request, response) => {
      initialRequests += 1;
      response.writeHead(307, { location: `${destination}/collect` });
      response.end();
    });
    const client = example({ API_ORIGIN: origin, API_KEY: newKey() });
    await client.runUsage();

    expect(initialRequests).toBe(1);
    expect(received).not.toHaveBeenCalled();
    expect(client.trackedFetch).toHaveBeenCalledTimes(1);
    expect(client.output.map((line) => JSON.parse(line))).toEqual([
      { status: null, code: 'client_failure', requestId: null },
    ]);
  });

  it.each(['headers', 'body'] as const)('keeps the deadline active while waiting for %s', async (stage) => {
    let reachedServer = false;
    let receivedHeaders = false;
    const origin = await httpFixture((_request, response) => {
      reachedServer = true;
      if (stage === 'body') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{"data":');
      }
      // Keep the headers or body incomplete until the client deadline aborts it.
    });
    const client = example({}, async (...args: Parameters<typeof fetch>) => {
      const response = await fetch(...args);
      receivedHeaders = true;
      return response;
    });
    const error: unknown = await client.requestNatal({ origin, key: newKey(), deadlineMs: 500 })
      .catch((failure: unknown) => failure);

    expect(reachedServer).toBe(true);
    expect(receivedHeaders).toBe(stage === 'body');
    expect(error).toMatchObject({ name: expect.stringMatching(/^(?:Abort|Timeout)Error$/u) });
    expect(error).not.toBeInstanceOf(client.ApiFailure);
    expect(client.trackedFetch).toHaveBeenCalledTimes(1);
    expect(client.trackedFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('filters unrecognized error codes and unsafe correlation or retry metadata', async () => {
    const key = newKey();
    const origin = await httpFixture((_request, response) => {
      response.writeHead(503, {
        'content-type': 'application/json', 'x-request-id': key,
        'retry-after': '9007199254740992',
      });
      response.end(JSON.stringify({ error: { code: key, message: key }, data: birth }));
    });
    const client = example();
    const error: unknown = await client.requestNatal({ origin, key }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(client.ApiFailure);
    expect(error).toMatchObject({
      status: 503, code: 'unexpected_response', requestId: null, retryAfterSeconds: null,
    });
    expect(JSON.stringify(error)).not.toContain(key);
    expect(JSON.stringify(error)).not.toContain(birth.utc);
  });

  it('handles a non-JSON proxy response without logging its raw exception or body', async () => {
    const key = newKey();
    const origin = await httpFixture((_request, response) => {
      response.writeHead(502, { 'content-type': 'text/html' });
      response.end(`<html>${key} ${birth.utc}</html>`);
    });
    const client = example({ API_ORIGIN: origin, API_KEY: key });
    await client.runUsage();

    expect(client.output.map((line) => JSON.parse(line))).toEqual([
      { status: null, code: 'client_failure', requestId: null },
    ]);
    expect(client.localProcess.exitCode).toBe(1);
    expect(client.trackedFetch).toHaveBeenCalledTimes(1);
    for (const privateValue of [key, birth.utc, origin, '<html>']) {
      expect(client.output.join('')).not.toContain(privateValue);
    }
  });
});
