import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { connect, type Socket } from 'node:net';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { calculate, type CalculationRunner } from '../src/calculations.js';
import { DEFAULT_RESOURCE_LIMITS, HTTP_LIMITS } from '../src/resource-limits.js';

const apps: FastifyInstance[] = [];
const connections: RawConnection[] = [];
const processes: RunningProcess[] = [];
const key = randomBytes(32).toString('base64url');
const authorized = { authorization: `Bearer ${key}` };
const serverDirectory = fileURLToPath(new URL('..', import.meta.url));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Lifecycle test deadline exceeded.')), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}

function captureLogs() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return { stream, text: () => chunks.join('') };
}

function jsonLines(output: string): Record<string, unknown>[] {
  return output.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

type RawConnection = { socket: Socket; raw: string; closed: Promise<void> };

async function openSocket(address: string): Promise<RawConnection> {
  const url = new URL(address);
  const socket = connect({ host: url.hostname, port: Number(url.port) });
  const result: RawConnection = { socket, raw: '', closed: new Promise((resolve) => socket.once('close', () => resolve())) };
  connections.push(result);
  socket.setEncoding('utf8');
  // Rejected connections can reset before sending any bytes. The close event
  // is the relevant observation, and a socket error must not escape cleanup.
  socket.on('error', () => {});
  socket.on('data', (chunk: string) => {
    result.raw += chunk;
    if (result.raw.length > 128 * 1024) socket.destroy();
  });
  await bounded(new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  }));
  return result;
}

function expectRawError(raw: string, status: number, code = 'invalid_request') {
  const separator = raw.indexOf('\r\n\r\n');
  expect(separator).toBeGreaterThan(0);
  const headers = raw.slice(0, separator).toLowerCase();
  expect(headers).toMatch(new RegExp(`^http/1\\.1 ${status}\\b`));
  expect(headers).toContain('cache-control: no-store');
  expect(headers).toContain('x-content-type-options: nosniff');
  const body = JSON.parse(raw.slice(separator + 4)) as Record<string, unknown>;
  expect(body.error).toMatchObject({ code });
  expect(body.receipts).toEqual([]);
  expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
  expect(headers).toContain(`x-request-id: ${String(body.requestId)}`);
  return body;
}

type RunningProcess = {
  child: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
};

function launch(overrides: NodeJS.ProcessEnv): RunningProcess {
  const environment = { ...process.env };
  for (const name of ['API_KEYS', 'API_KEYS_FILE', 'RATE_LIMIT_CAPACITY', 'RATE_LIMIT_REFILL_PER_SECOND',
    'MAX_CONNECTIONS', 'REQUEST_TIMEOUT_MS', 'SHUTDOWN_TIMEOUT_MS', 'CALCULATION_TIMEOUT_MS', 'CALCULATION_QUEUE_SIZE']) {
    delete environment[name];
  }
  const child = spawn(process.execPath, ['build/main.js'], {
    cwd: serverDirectory,
    env: { ...environment, HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'trace', ...overrides },
    stdio: 'pipe',
  });
  const result: RunningProcess = {
    child, stdout: '', stderr: '',
    exited: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    }),
  };
  processes.push(result);
  for (const name of ['stdout', 'stderr'] as const) {
    child[name].setEncoding('utf8');
    child[name].on('data', (chunk: string) => {
      result[name] += chunk;
      if (result[name].length > 128 * 1024) child.kill('SIGKILL');
    });
  }
  return result;
}

async function processEvent(server: RunningProcess, name: string): Promise<Record<string, unknown>> {
  let inspect: () => void = () => {};
  let closed: () => void = () => {};
  try {
    return await bounded(new Promise<Record<string, unknown>>((resolve, reject) => {
      inspect = () => {
        // The final chunk can hold a partial line while the process is running.
        const lines = server.stdout.slice(0, server.stdout.lastIndexOf('\n') + 1);
        const event = jsonLines(lines).find((record) => record.event === name);
        if (event !== undefined) resolve(event);
      };
      closed = () => reject(new Error('Server exited before the expected lifecycle event.'));
      server.child.stdout.on('data', inspect);
      server.child.once('close', closed);
      inspect();
      if (server.child.exitCode !== null || server.child.signalCode !== null) closed();
    }));
  } finally {
    server.child.stdout.off('data', inspect);
    server.child.off('close', closed);
  }
}

afterEach(async () => {
  const pendingSockets = connections.splice(0);
  for (const connection of pendingSockets) connection.socket.destroy();
  await Promise.all(pendingSockets.map((connection) => bounded(connection.closed)));
  await Promise.all(processes.splice(0).map(async (server) => {
    if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill('SIGKILL');
    await bounded(server.exited);
  }));
  await Promise.all(apps.splice(0).map((app) => bounded(app.close())));
});

describe('HTTP connection and request work limits', () => {
  it('drops connections above the configured cap and admits one after a connection closes', async () => {
    const app = createApp({ limits: { ...DEFAULT_RESOURCE_LIMITS, maxConnections: 1 } });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const accepted = deferred<Socket>();
    app.server.once('connection', (socket) => accepted.resolve(socket));
    const first = await openSocket(address);
    const serverSocket = await bounded(accepted.promise);
    const excess = await openSocket(address);
    excess.socket.write('GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    await bounded(excess.closed);
    expect(excess.raw).toBe('');
    expect(first.socket.destroyed).toBe(false);

    const released = new Promise<void>((resolve) => serverSocket.once('close', () => resolve()));
    first.socket.destroy();
    await bounded(released);
    const next = await openSocket(address);
    next.socket.write('GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    await bounded(next.closed);
    expect(next.raw).toMatch(/^HTTP\/1\.1 200\b/);
    expect(next.raw).toContain('"status":"ok"');
  });

  it('sanitizes oversized HTTP headers before authentication and keeps credentials out of trace logs', async () => {
    const canary = randomUUID();
    const logs = captureLogs();
    const app = createApp({ logger: { level: 'trace', stream: logs.stream } });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const connection = await openSocket(address);
    connection.socket.write([
      'POST /v1/natal HTTP/1.1', 'Host: localhost', `Authorization: Bearer ${key}`,
      `X-Private: ${canary}${'x'.repeat(HTTP_LIMITS.headerBytes)}`,
      'Content-Type: application/json', 'Content-Length: 2', 'Connection: close', '', '{}',
    ].join('\r\n'));
    await bounded(connection.closed);
    expectRawError(connection.raw, 431);
    const records = jsonLines(logs.text());
    expect(records.some((record) => record.event === 'http_request_rejected' && record.statusCode === 431)).toBe(true);
    for (const value of [key, canary]) expect(connection.raw + logs.text()).not.toContain(value);
    expect((await app.inject('/healthz')).statusCode).toBe(200);
  });

  it('expires a trickled incomplete body despite continued bytes and releases its connection capacity', async () => {
    const canary = randomUUID();
    const logs = captureLogs();
    const app = createApp({
      logger: { level: 'trace', stream: logs.stream },
      limits: { ...DEFAULT_RESOURCE_LIMITS, maxConnections: 1, requestTimeoutMs: 100 },
    });
    const admitted = deferred<void>();
    app.addHook('preParsing', async () => { admitted.resolve(); });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const connection = await openSocket(address);
    connection.socket.write([
      'POST /v1/natal HTTP/1.1', 'Host: localhost', `Authorization: Bearer ${key}`,
      `X-Private: ${canary}`, 'Content-Type: application/json', 'Content-Length: 4096', '', '{"utc":',
    ].join('\r\n'));
    const trickle = setInterval(() => { if (!connection.socket.destroyed) connection.socket.write(' '); }, 20);
    try {
      await bounded(admitted.promise);
      await bounded(connection.closed, 3500);
    } finally {
      clearInterval(trickle);
      connection.socket.destroy();
    }
    expectRawError(connection.raw, 408);
    await expect.poll(() => new Promise<number>((resolve, reject) => {
      app.server.getConnections((error, count) => error ? reject(error) : resolve(count));
    })).toBe(0);
    const next = await openSocket(address);
    next.socket.write('GET /healthz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    await bounded(next.closed);
    expect(next.raw).toMatch(/^HTTP\/1\.1 200\b/);
    for (const value of [key, canary]) expect(connection.raw + logs.text()).not.toContain(value);
    expect(jsonLines(logs.text()).some((record) => record.event === 'http_request_rejected' && record.statusCode === 408)).toBe(true);
  });
});

describe('calculation readiness and shutdown', () => {
  it('serves public probes during an async calculation and tracks worker readiness independently', async () => {
    const entered = deferred<void>();
    const finish = deferred<void>();
    let workerReady = true;
    const runner: CalculationRunner = {
      async run(task, input, requestId) {
        entered.resolve();
        await finish.promise;
        return calculate(task, input, requestId);
      },
    };
    const app = createApp({ calculations: runner, readiness: () => workerReady });
    const pending = app.inject({ method: 'POST', url: '/v1/moon-phase', headers: authorized, payload: { at: '2004-04-15T12:00:00Z' } }).then((response) => response);
    try {
      await bounded(entered.promise);
      for (const path of ['/healthz', '/readyz']) {
        const response = await bounded(app.inject(path).then((result) => result));
        expect(response.statusCode).toBe(200);
        expect(response.headers['x-ratelimit-limit']).toBeUndefined();
      }
      workerReady = false;
      const unavailable = await bounded(app.inject('/readyz').then((result) => result));
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.json()).toMatchObject({ receipts: [], error: { code: 'not_ready' } });
      expect((await app.inject('/healthz')).statusCode).toBe(200);
      workerReady = true;
      expect((await app.inject('/readyz')).statusCode).toBe(200);
    } finally {
      finish.resolve();
      expect((await bounded(pending)).statusCode).toBe(200);
    }
  });

  it('drains an executing calculation before closing its real listener', async () => {
    const entered = deferred<void>();
    const finish = deferred<void>();
    const closing = deferred<void>();
    const runner: CalculationRunner = {
      async run(task, input, requestId) {
        entered.resolve();
        await finish.promise;
        return calculate(task, input, requestId);
      },
    };
    const app = createApp({ calculations: runner });
    app.addHook('preClose', async () => { closing.resolve(); });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = fetch(new URL('/v1/moon-phase', address), {
      method: 'POST', headers: { ...authorized, 'content-type': 'application/json' },
      body: JSON.stringify({ at: '2004-04-15T12:00:00Z' }), signal: AbortSignal.timeout(5000),
    });
    let closed = false;
    let close: Promise<void> | undefined;
    try {
      await bounded(entered.promise);
      close = app.close().then(() => { closed = true; });
      await bounded(closing.promise);
      expect(closed).toBe(false);
      finish.resolve();
      const result = await bounded(response);
      expect(result.status).toBe(200);
      const body = await result.json() as { receipts: unknown[]; data: { sky: unknown } };
      expect(body.receipts).toHaveLength(1);
      expect(body.data.sky).toBeDefined();
      await bounded(close);
      expect(closed).toBe(true);
    } finally {
      finish.resolve();
      await response.then((result) => result.body?.cancel()).catch(() => {});
      if (close !== undefined) await bounded(close);
    }
  });

  it('refuses a body admitted before shutdown when its last bytes arrive after preClose', async () => {
    const admitted = deferred<void>();
    const closing = deferred<void>();
    const canary = randomUUID();
    const logs = captureLogs();
    let calls = 0;
    const app = createApp({
      logger: { level: 'trace', stream: logs.stream },
      calculations: { async run() { calls++; throw new Error(canary); } },
    });
    app.addHook('preParsing', async () => { admitted.resolve(); });
    app.addHook('preClose', async () => { closing.resolve(); });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const connection = await openSocket(address);
    const body = JSON.stringify({ utc: '2004-04-15T12:00:00Z' });
    connection.socket.write([
      'POST /v1/natal HTTP/1.1', 'Host: localhost', `Authorization: Bearer ${key}`,
      `X-Private: ${canary}`, 'Content-Type: application/json', `Content-Length: ${Buffer.byteLength(body)}`,
      'Connection: close', '', body.slice(0, -1),
    ].join('\r\n'));
    await bounded(admitted.promise);
    const close = app.close();
    try {
      await bounded(closing.promise);
      connection.socket.write(body.slice(-1));
      await bounded(connection.closed);
      expectRawError(connection.raw, 503, 'not_ready');
      expect(calls).toBe(0);
      for (const value of [key, canary]) expect(connection.raw + logs.text()).not.toContain(value);
      expect(jsonLines(logs.text()).some((record) => record.event === 'request_completed' && record.statusCode === 503)).toBe(true);
    } finally {
      connection.socket.destroy();
      await bounded(close);
    }
  });

  it('deduplicates repeated signals and enforces the process shutdown deadline for an incomplete body', async () => {
    const canary = randomUUID();
    const server = launch({ API_KEYS: JSON.stringify([key]), REQUEST_TIMEOUT_MS: '10000', SHUTDOWN_TIMEOUT_MS: '1000' });
    const started = await processEvent(server, 'server_started');
    expect(typeof started.address).toBe('string');
    const connection = await openSocket(started.address as string);
    connection.socket.write([
      'POST /v1/natal HTTP/1.1', 'Host: localhost', `Authorization: Bearer ${key}`, `X-Private: ${canary}`,
      'Content-Type: application/json', 'Content-Length: 4096', 'Expect: 100-continue', '', '{"utc":',
    ].join('\r\n'));
    // The interim response proves that Node has admitted a live HTTP request.
    await expect.poll(() => connection.raw, { timeout: 2000 }).toContain('HTTP/1.1 100 Continue');
    server.child.kill('SIGTERM');
    await processEvent(server, 'server_stopping');
    server.child.kill('SIGINT');
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited, 4000)).toEqual({ code: 1, signal: null });
    expect(server.stderr).toBe('');
    const records = jsonLines(server.stdout);
    expect(records.filter((record) => record.event === 'server_stopping')).toHaveLength(1);
    expect(records.filter((record) => record.event === 'shutdown_timeout')).toHaveLength(1);
    expect(records.some((record) => record.event === 'server_stopped' || record.event === 'shutdown_failed')).toBe(false);
    for (const value of [key, canary]) expect(server.stdout + server.stderr + connection.raw).not.toContain(value);
  });
});
