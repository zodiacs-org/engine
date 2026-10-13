import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ENGINE_VERSION, EPHEMERIS, moonPhase, natalChart, synastry, transits } from '../../src/index.js';
import { houses } from '../../src/calc.js';
import { createNatalEnvelope, parseNatalEnvelope } from '../../src/receipt.js';
import { lunarReturn, solarReturn } from '../../src/techniques.js';

const serverDirectory = fileURLToPath(new URL('..', import.meta.url));
type Exit = { code: number | null; signal: NodeJS.Signals | null };
type RunningServer = {
  child: ChildProcessWithoutNullStreams;
  stdout: string;
  stderr: string;
  exited: Promise<Exit>;
};
const processes: RunningServer[] = [];
const temporaryDirectories: string[] = [];

function launch(overrides: NodeJS.ProcessEnv = {}): RunningServer {
  const inherited = { ...process.env };
  delete inherited.API_KEYS;
  delete inherited.API_KEYS_FILE;
  delete inherited.RATE_LIMIT_CAPACITY;
  delete inherited.RATE_LIMIT_REFILL_PER_SECOND;
  const child = spawn(process.execPath, ['build/main.js'], {
    cwd: serverDirectory,
    env: { ...inherited, HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'info', ...overrides },
    stdio: 'pipe',
  });
  const result: RunningServer = {
    child,
    stdout: '',
    stderr: '',
    exited: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    }),
  };
  for (const stream of ['stdout', 'stderr'] as const) {
    child[stream].setEncoding('utf8');
    child[stream].on('data', (chunk: string) => {
      result[stream] += chunk;
      if (result[stream].length > 256 * 1024) child.kill('SIGKILL');
    });
  }
  processes.push(result);
  return result;
}

async function bounded<T>(promise: Promise<T>, milliseconds = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Child process deadline exceeded.')), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function started(server: RunningServer): Promise<string> {
  return new Promise((resolve, reject) => {
    const { child } = server;
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', inspect);
      child.off('close', closed);
    };
    const inspect = () => {
      for (const line of server.stdout.split('\n')) {
        let record: Record<string, unknown>;
        try { record = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
        if (record.event === 'server_started' && typeof record.address === 'string') {
          cleanup();
          resolve(record.address);
          return;
        }
      }
    };
    const closed = () => {
      cleanup();
      reject(new Error('Server exited before reporting readiness.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Server startup deadline exceeded.'));
    }, 5000);
    child.stdout.on('data', inspect);
    child.once('close', closed);
    inspect();
    if (child.exitCode !== null || child.signalCode !== null) closed();
  });
}

function jsonLines(output: string): Record<string, unknown>[] {
  return output.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function temporaryDirectory(): Promise<string> {
  const cache = join(serverDirectory, '.cache');
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, 'process-auth-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function rawRequest(address: URL, request: string): Promise<string> {
  const socket = connect({ host: address.hostname, port: Number(address.port) });
  let raw = '';
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      socket.setEncoding('utf8');
      socket.once('error', reject);
      socket.once('connect', () => socket.write(request));
      socket.on('data', (chunk: string) => {
        raw += chunk;
        if (raw.length > 64 * 1024) reject(new Error('HTTP response exceeded its limit.'));
      });
      socket.once('end', resolve);
    }), 2000);
    return raw;
  } finally {
    socket.destroy();
  }
}

afterEach(async () => {
  try {
    await Promise.all(processes.splice(0).map(async (server) => {
      if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill('SIGKILL');
      await bounded(server.exited);
    }));
  } finally {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  }
});

describe('built server process', () => {
  it('serves an authenticated natal chart and its receipt through the built listener without logging birth details', async () => {
    const key = randomBytes(32).toString('base64url');
    const server = launch({ API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
    const address = await started(server);
    const input = {
      utc: '2004-02-29T08:30:00+02:00', latitude: 48.25, longitude: -3.75,
      houseSystem: 'placidus' as const,
    };
    const chart = natalChart(input);
    const envelope = createNatalEnvelope(chart, { sourceInstant: input.utc });
    const response = await fetch(new URL('/v1/natal', address), {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(5000),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({
      requestId: response.headers.get('x-request-id'),
      engine: expect.objectContaining({ name: '@zodiacs/engine', version: chart.engineVersion }),
      data: JSON.parse(JSON.stringify(chart)),
      receipts: [{ scope: '/data', envelope }],
    });
    expect(parseNatalEnvelope(JSON.stringify(envelope)).ok).toBe(true);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('59');
    const invalid = await fetch(new URL('/v1/natal', address), {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ utc: '2004-02-30T08:30:00+02:00' }), signal: AbortSignal.timeout(5000),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      receipts: [], error: { code: 'invalid_request', message: 'Request is invalid.' },
    });
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    const logs = server.stdout + server.stderr;
    for (const value of [key, input.utc, chart.input.utc.toISOString(), '"latitude"', '"longitude"', '"bodies"', '"receipt"', '2004-02-30']) {
      expect(logs).not.toContain(value);
    }
    expect(JSON.stringify(body)).not.toContain(key);
    expect(jsonLines(server.stdout).filter((record) => record.event === 'request_completed')
      .map(({ route, statusCode }) => ({ route, statusCode }))).toEqual([
      { route: '/v1/natal', statusCode: 200 }, { route: '/v1/natal', statusCode: 400 },
    ]);
  });

  it('serves transit and synastry results with scoped receipts through the built listener and keeps calculations out of trace logs', async () => {
    const key = randomBytes(32).toString('base64url');
    const canary = randomUUID();
    const server = launch({ API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
    const address = await started(server);
    // Invented instants and coordinates. Each contributing chart uses its own
    // requested clock; the moving sky always uses the engine's UTC default.
    const first = {
      utc: '2005-01-02T03:04:05+05:30', latitude: 23.45, longitude: -67.89,
      houseSystem: 'placidus' as const, timeScale: 'tt' as const, deltaT: 70,
    };
    const second = { utc: '2007-08-09T10:11:12-03:30', timeKnown: false, deltaT: 123.456 };
    const at = '2024-10-11T12:13:14+02:00';
    const a = natalChart(first);
    const b = natalChart(second);
    const sky = natalChart({ utc: at });
    const current = transits(a, at);
    const pair = synastry(a, b);
    const firstReceipt = createNatalEnvelope(a, { sourceInstant: first.utc });
    const secondReceipt = createNatalEnvelope(b, { sourceInstant: second.utc });
    const skyReceipt = createNatalEnvelope(sky, { sourceInstant: at });
    const identity = { name: '@zodiacs/engine', version: ENGINE_VERSION, ephemeris: EPHEMERIS };
    const request = (path: string, payload: unknown) => fetch(new URL(path, address), {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    let responseText = '';
    for (const example of [
      {
        path: '/v1/transits', input: { natal: first, at }, data: { ...current, sky },
        receipts: [{ scope: '/data/natal', envelope: firstReceipt }, { scope: '/data/sky', envelope: skyReceipt }],
      },
      {
        path: '/v1/synastry', input: { a: first, b: second }, data: pair,
        receipts: [{ scope: '/data/a', envelope: firstReceipt }, { scope: '/data/b', envelope: secondReceipt }],
      },
    ]) {
      const response = await request(example.path, example.input);
      expect(response.status).toBe(200);
      const text = await response.text();
      responseText += text;
      const body = JSON.parse(text) as { receipts: { scope: string; envelope: unknown }[] };
      expect(body).toEqual({
        requestId: response.headers.get('x-request-id'), engine: identity,
        data: JSON.parse(JSON.stringify(example.data)), receipts: example.receipts,
      });
      for (const receipt of body.receipts) expect(parseNatalEnvelope(JSON.stringify(receipt.envelope)).ok).toBe(true);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    }
    expect(current.positions).toEqual(sky.bodies);
    for (const example of [
      { path: '/v1/transits', input: { natal: first, at: canary } },
      { path: '/v1/synastry', input: { a: first, b: { ...second, utc: canary } } },
    ]) {
      const response = await request(example.path, example.input);
      expect(response.status).toBe(400);
      const text = await response.text();
      responseText += text;
      expect(JSON.parse(text)).toEqual({
        requestId: response.headers.get('x-request-id'), engine: identity, receipts: [],
        error: { code: 'invalid_request', message: 'Request is invalid.' },
      });
    }
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    const logs = server.stdout + server.stderr;
    for (const value of [
      key, canary, first.utc, second.utc, at, a.input.utc.toISOString(), b.input.utc.toISOString(), sky.input.utc.toISOString(),
      '"latitude"', '"longitude"', '"bodies"', '"aspects"', '"receipts"', '"envelope"', 'sourceInstant', 'resultFlags',
      String(a.bodies[0]!.lon), String(b.bodies[0]!.lon), String(sky.bodies[0]!.lon),
    ]) expect(logs).not.toContain(value);
    for (const value of [key, canary]) expect(responseText).not.toContain(value);
    expect(jsonLines(server.stdout).filter((record) => record.event === 'request_completed')
      .map(({ route, statusCode }) => ({ route, statusCode }))).toEqual([
      { route: '/v1/transits', statusCode: 200 }, { route: '/v1/synastry', statusCode: 200 },
      { route: '/v1/transits', statusCode: 400 }, { route: '/v1/synastry', statusCode: 400 },
    ]);
  });

  it('serves solar and lunar returns with scoped receipts through the built listener without exposing calculations in trace logs', async () => {
    const key = randomBytes(32).toString('base64url');
    const canary = randomUUID();
    const server = launch({ API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
    const address = await started(server);
    // Synthetic examples match the documented return requests.
    const input = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };
    const at = '2024-06-07T08:09:10+02:00';
    const invalidDate = '2024-02-30T08:09:10+02:00';
    const solarOptions = {
      selection: 'most-recent' as const,
      location: { latitude: 45.25, longitude: 12.5 },
      houseSystem: 'placidus' as const,
    };
    const lunarOptions = { location: null };
    const natal = natalChart(input);
    const solar = solarReturn(natal, at, solarOptions);
    const lunar = lunarReturn(natal, at, lunarOptions);
    const natalReceipt = createNatalEnvelope(natal, { sourceInstant: input.utc });
    const identity = { name: '@zodiacs/engine', version: ENGINE_VERSION, ephemeris: EPHEMERIS };
    const request = (path: string, payload: unknown) => fetch(new URL(path, address), {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    let responseText = '';
    for (const example of [
      { path: '/v1/returns/solar', input: { natal: input, at, ...solarOptions }, result: solar },
      { path: '/v1/returns/lunar', input: { natal: input, after: at, ...lunarOptions }, result: lunar },
    ]) {
      const response = await request(example.path, example.input);
      expect(response.status).toBe(200);
      const text = await response.text();
      responseText += text;
      const body = JSON.parse(text) as { receipts: { scope: string; envelope: unknown }[] };
      const returnReceipt = createNatalEnvelope(example.result.chart);
      expect(body).toEqual({
        requestId: response.headers.get('x-request-id'), engine: identity,
        data: JSON.parse(JSON.stringify({ ...example.result, natal })),
        receipts: [{ scope: '/data/natal', envelope: natalReceipt }, { scope: '/data/chart', envelope: returnReceipt }],
      });
      expect(returnReceipt.receipt.sourceInstant).toBeNull();
      for (const receipt of body.receipts) expect(parseNatalEnvelope(JSON.stringify(receipt.envelope)).ok).toBe(true);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    }
    for (const example of [
      { path: '/v1/returns/lunar', input: { natal: { ...input, timeKnown: false }, after: at } },
      { path: '/v1/returns/solar', input: { natal: input, at: canary } },
      { path: '/v1/returns/lunar', input: { natal: input, after: invalidDate } },
    ]) {
      const response = await request(example.path, example.input);
      expect(response.status).toBe(400);
      const text = await response.text();
      responseText += text;
      expect(JSON.parse(text)).toEqual({
        requestId: response.headers.get('x-request-id'), engine: identity, receipts: [],
        error: { code: 'invalid_request', message: 'Request is invalid.' },
      });
    }
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    const logs = server.stdout + server.stderr;
    for (const value of [
      key, canary, input.utc, at, invalidDate, solar.instant.toISOString(), lunar.instant.toISOString(),
      '"latitude"', '"longitude"', '"bodies"', '"receipts"', '"envelope"', '"natalLongitude"', 'sourceInstant',
      String(natal.bodies[0]!.lon), String(solar.natalLongitude), String(lunar.natalLongitude),
    ]) expect(logs).not.toContain(value);
    for (const value of [key, canary, invalidDate]) expect(responseText).not.toContain(value);
    expect(jsonLines(server.stdout).filter((record) => record.event === 'request_completed')
      .map(({ route, statusCode }) => ({ route, statusCode }))).toEqual([
      { route: '/v1/returns/solar', statusCode: 200 }, { route: '/v1/returns/lunar', statusCode: 200 },
      { route: '/v1/returns/lunar', statusCode: 400 }, { route: '/v1/returns/solar', statusCode: 400 },
      { route: '/v1/returns/lunar', statusCode: 400 },
    ]);
  });

  it('serves moon phase and houses with their engine receipts through the built listener and keeps calculations out of trace logs', async () => {
    const key = randomBytes(32).toString('base64url');
    const canary = randomUUID();
    const server = launch({ API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
    const address = await started(server);
    // Synthetic examples match the documented moon-phase and houses requests.
    const at = '2024-06-07T08:09:10+02:00';
    const houseInputs = [
      {
        time: { iso: '2004-02-29T08:30:00+02:00', deltaT: 70 },
        place: { latitude: 48.25, longitude: -3.75 }, houseSystem: 'placidus' as const,
      },
      {
        time: { jd: 2451545, scale: 'tt' as const, deltaT: 64 },
        place: { latitude: 78.25, longitude: 15.5 }, houseSystem: 'placidus' as const,
        zodiac: 'tropical' as const,
      },
    ];
    const sky = natalChart({ utc: at });
    const phase = moonPhase(at);
    const envelope = createNatalEnvelope(sky, { sourceInstant: at });
    const houseResults = houseInputs.map((input) => {
      const result = houses(input);
      if (result.status !== 'ok') throw new Error('Synthetic houses example was refused.');
      return result;
    });
    const identity = { name: '@zodiacs/engine', version: ENGINE_VERSION, ephemeris: EPHEMERIS };
    const request = (path: string, payload: unknown) => fetch(new URL(path, address), {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    let responseText = '';
    for (const example of [
      {
        path: '/v1/moon-phase', input: { at }, data: { ...phase, sky },
        receipts: [{ scope: '/data/sky', envelope }],
      },
      ...houseInputs.map((input, index) => ({
        path: '/v1/houses', input, data: houseResults[index]!,
        receipts: [{ scope: '/data', receipt: houseResults[index]!.receipt }],
      })),
    ]) {
      const response = await request(example.path, example.input);
      expect(response.status).toBe(200);
      const text = await response.text();
      responseText += text;
      expect(JSON.parse(text)).toEqual({
        requestId: response.headers.get('x-request-id'), engine: identity,
        data: JSON.parse(JSON.stringify(example.data)),
        receipts: JSON.parse(JSON.stringify(example.receipts)),
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-ratelimit-limit')).toBe('60');
    }
    expect(parseNatalEnvelope(JSON.stringify(envelope)).ok).toBe(true);
    expect(houseResults[1]).toMatchObject({ requested: 'placidus', system: 'whole', flags: ['polar-fallback'] });
    const outsideCalcSpan = '1700-01-01T00:00:00Z';
    for (const example of [
      { path: '/v1/moon-phase', input: { at: canary } },
      { path: '/v1/houses', input: { ...houseInputs[0], time: canary } },
      { path: '/v1/houses', input: { ...houseInputs[0], time: outsideCalcSpan } },
    ]) {
      const response = await request(example.path, example.input);
      expect(response.status).toBe(400);
      const text = await response.text();
      responseText += text;
      expect(JSON.parse(text)).toEqual({
        requestId: response.headers.get('x-request-id'), engine: identity, receipts: [],
        error: { code: 'invalid_request', message: 'Request is invalid.' },
      });
    }
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    const logs = server.stdout + server.stderr;
    for (const value of [
      key, canary, at, houseInputs[0]!.time.iso!, outsideCalcSpan, sky.input.utc.toISOString(),
      '2451545', 'sourceInstant', 'polar-fallback', 'out-of-range',
      '"latitude"', '"longitude"', '"bodies"', '"receipts"', '"envelope"', '"bounds"', '"cusps"',
      String(sky.bodies[0]!.lon), String(houseResults[0]!.angles.asc),
    ]) expect(logs).not.toContain(value);
    for (const value of [key, canary, outsideCalcSpan]) expect(responseText).not.toContain(value);
    expect(jsonLines(server.stdout).filter((record) => record.event === 'request_completed')
      .map(({ route, statusCode }) => ({ route, statusCode }))).toEqual([
      { route: '/v1/moon-phase', statusCode: 200 },
      { route: '/v1/houses', statusCode: 200 }, { route: '/v1/houses', statusCode: 200 },
      { route: '/v1/moon-phase', statusCode: 400 },
      { route: '/v1/houses', statusCode: 400 }, { route: '/v1/houses', statusCode: 400 },
    ]);
  });

  it.each(['SIGTERM', 'SIGINT'] as const)('serves probes and shuts down cleanly on %s', async (signal) => {
    const server = launch();
    const address = await started(server);
    const url = new URL(address);
    expect(url.hostname).toBe('127.0.0.1');
    expect(Number(url.port)).toBeGreaterThan(0);
    for (const path of ['/healthz', '/readyz']) {
      const response = await fetch(new URL(path, address), { signal: AbortSignal.timeout(2000) });
      expect(response.status).toBe(200);
      const body = await response.json() as Record<string, unknown>;
      expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
      expect(body.receipts).toEqual([]);
    }
    server.child.kill(signal);
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    expect(jsonLines(server.stdout).some((record) => record.event === 'server_started')).toBe(true);
  });

  it('sanitizes malformed HTTP headers at trace log level', async () => {
    const canary = randomUUID();
    const server = launch({ LOG_LEVEL: 'trace' });
    const address = new URL(await started(server));
    const raw = await rawRequest(address,
      `GET / HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${canary}\r\nBad Header: value\r\n\r\n`);
    const separator = raw.indexOf('\r\n\r\n');
    expect(separator).toBeGreaterThan(0);
    const headers = raw.slice(0, separator).toLowerCase();
    expect(headers).toMatch(/^http\/1\.1 400\b/);
    expect(headers).toContain('connection: close');
    expect(headers).toContain('cache-control: no-store');
    expect(headers).toContain('x-content-type-options: nosniff');
    const body = JSON.parse(raw.slice(separator + 4)) as Record<string, unknown>;
    expect(body.error).toEqual({ code: 'invalid_request', message: 'Request is invalid.' });
    expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
    expect(body.receipts).toEqual([]);
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(headers).toContain(`x-request-id: ${String(body.requestId)}`);
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(raw + server.stdout + server.stderr).not.toContain(canary);
    expect(server.stderr).toBe('');
    expect(jsonLines(server.stdout).length).toBeGreaterThan(0);
  });

  it('keeps protected requests closed when no keys are configured', async () => {
    const server = launch();
    const address = await started(server);
    const key = randomBytes(32).toString('base64url');
    for (const authorization of [undefined, `Bearer ${key}`]) {
      const response = await fetch(new URL('/v1/unmatched', address), {
        headers: authorization === undefined ? {} : { authorization },
        signal: AbortSignal.timeout(2000),
      });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toMatch(/^Bearer(?: |$)/);
      const body = await response.json() as Record<string, unknown>;
      expect(body.error).toMatchObject({ code: 'unauthorized' });
      expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
      expect(body.receipts).toEqual([]);
    }
  });

  it.each(['environment', 'file'] as const)('loads %s keys in the built process without leaking them', async (source) => {
    const keys = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
    const unknownKey = randomBytes(32).toString('base64url');
    const overrides: NodeJS.ProcessEnv = { LOG_LEVEL: 'trace' };
    let path: string | undefined;
    if (source === 'file') {
      path = join(await temporaryDirectory(), `${randomUUID()}.json`);
      await writeFile(path, JSON.stringify(keys), { mode: 0o600 });
      overrides.API_KEYS_FILE = path;
    } else {
      overrides.API_KEYS = JSON.stringify(keys);
    }
    const server = launch(overrides);
    const address = await started(server);
    let responseText = '';
    for (const authorization of [undefined, `Bearer ${unknownKey}`, `Bearer ${keys[0]}`, `bEaReR ${keys[1]}`]) {
      const response = await fetch(new URL('/v1/unmatched', address), {
        headers: authorization === undefined ? {} : { authorization },
        signal: AbortSignal.timeout(2000),
      });
      const valid = authorization === `Bearer ${keys[0]}` || authorization === `bEaReR ${keys[1]}`;
      expect(response.status).toBe(valid ? 404 : 401);
      const text = await response.text();
      responseText += text;
      const body = JSON.parse(text) as Record<string, unknown>;
      expect(body.error).toMatchObject({ code: valid ? 'not_found' : 'unauthorized' });
      expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
      expect(body.receipts).toEqual([]);
    }
    for (const probe of ['/healthz', '/readyz']) {
      const response = await fetch(new URL(probe, address), { signal: AbortSignal.timeout(2000) });
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    }
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    const output = responseText + server.stdout + server.stderr;
    for (const key of [...keys, unknownKey]) expect(output).not.toContain(key);
    if (path !== undefined) expect(output).not.toContain(path);
    expect(jsonLines(server.stdout).some((record) => record.event === 'request_completed')).toBe(true);
  });

  it.each(['malformed environment', 'conflicting sources', 'missing file', 'malformed file'] as const)(
    'sanitizes startup failure for %s credentials', async (failure) => {
      const key = randomBytes(32).toString('base64url');
      const path = join(await temporaryDirectory(), `${randomUUID()}.json`);
      const overrides: NodeJS.ProcessEnv = { LOG_LEVEL: 'trace' };
      if (failure === 'malformed environment') {
        overrides.API_KEYS = `["${key}"`;
      } else if (failure === 'conflicting sources') {
        overrides.API_KEYS = JSON.stringify([key]);
        overrides.API_KEYS_FILE = path;
        await writeFile(path, JSON.stringify([key]), { mode: 0o600 });
      } else {
        overrides.API_KEYS_FILE = path;
        if (failure === 'malformed file') await writeFile(path, `["${key}"`, { mode: 0o600 });
      }
      const server = launch(overrides);
      expect(await bounded(server.exited)).toEqual({ code: 1, signal: null });
      expect(server.stdout).toBe('');
      expect(jsonLines(server.stderr)).toEqual([{ level: 'error', event: 'startup_failed' }]);
      expect(server.stdout + server.stderr).not.toContain(key);
      expect(server.stdout + server.stderr).not.toContain(path);
    },
  );

  it('applies configured per-key limits, exempts probes and refills in the built process', async () => {
    const keys = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')];
    const canary = randomUUID();
    const server = launch({
      API_KEYS: JSON.stringify(keys),
      RATE_LIMIT_CAPACITY: '1',
      RATE_LIMIT_REFILL_PER_SECOND: '1',
      LOG_LEVEL: 'trace',
    });
    const address = await started(server);
    let responseText = '';
    const request = async (key: string) => {
      const response = await fetch(new URL(`/v1/${canary}`, address), {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(2000),
      });
      const text = await response.text();
      responseText += text;
      const body = JSON.parse(text) as Record<string, unknown>;
      expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
      expect(body.receipts).toEqual([]);
      expect(response.headers.get('x-request-id')).toBe(body.requestId);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-ratelimit-limit')).toBe('1');
      expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
      return { response, body };
    };

    const first = await request(keys[0]!);
    expect(first.response.status).toBe(404);
    expect(first.body.error).toMatchObject({ code: 'not_found' });
    expect(first.response.headers.get('retry-after')).toBeNull();

    const limited = await request(keys[0]!);
    expect(limited.response.status).toBe(429);
    expect(limited.body.error).toEqual({ code: 'rate_limited', message: 'API key request limit exceeded.' });
    const retryAfter = limited.response.headers.get('retry-after');
    expect(retryAfter).toMatch(/^[1-9][0-9]*$/);
    expect(Number(retryAfter)).toBe(1);

    const independent = await request(keys[1]!);
    expect(independent.response.status).toBe(404);
    expect(independent.body.error).toMatchObject({ code: 'not_found' });
    for (const path of ['/healthz', '/readyz']) {
      for (const authorization of [undefined, `Bearer ${keys[0]}`]) {
        const response = await fetch(new URL(path, address), {
          headers: authorization === undefined ? {} : { authorization },
          signal: AbortSignal.timeout(2000),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('x-ratelimit-limit')).toBeNull();
        expect(response.headers.get('x-ratelimit-remaining')).toBeNull();
        expect(response.headers.get('retry-after')).toBeNull();
        responseText += await response.text();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, Number(retryAfter) * 1000));
    const refilled = await request(keys[0]!);
    expect(refilled.response.status).toBe(404);
    expect(refilled.body.error).toMatchObject({ code: 'not_found' });
    expect(refilled.response.headers.get('retry-after')).toBeNull();
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    for (const value of [...keys, canary]) expect(responseText + server.stdout + server.stderr).not.toContain(value);
    const logs = jsonLines(server.stdout);
    expect(logs.some((record) => record.event === 'request_completed' && record.statusCode === 429)).toBe(true);
  });

  it.each(['RATE_LIMIT_CAPACITY', 'RATE_LIMIT_REFILL_PER_SECOND'] as const)(
    'sanitizes startup failure for invalid %s', async (field) => {
      const canary = randomUUID();
      const key = randomBytes(32).toString('base64url');
      const server = launch({ [field]: canary, API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
      expect(await bounded(server.exited)).toEqual({ code: 1, signal: null });
      expect(server.stdout).toBe('');
      expect(jsonLines(server.stderr)).toEqual([{ level: 'error', event: 'startup_failed' }]);
      expect(server.stdout + server.stderr).not.toContain(canary);
      expect(server.stdout + server.stderr).not.toContain(key);
    },
  );

  it.each([
    ['Content-Type', 'application/json'],
    ['Content-Encoding', 'identity'],
  ] as const)('rejects duplicate %s fields after authentication on raw HTTP requests', async (field, value) => {
    const key = randomBytes(32).toString('base64url');
    const server = launch({ API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
    const address = new URL(await started(server));
    let responses = '';
    for (const authenticated of [false, true]) {
      const fields = [
        'POST /v1/unmatched HTTP/1.1',
        'Host: localhost',
        ...(authenticated ? [`Authorization: Bearer ${key}`] : []),
        ...(field === 'Content-Type' ? [] : ['Content-Type: application/json']),
        `${field}: ${value}`,
        `${field.toLowerCase()}: ${value}`,
        'Content-Length: 2',
        'Connection: close',
        '',
        '{}',
      ];
      const raw = await rawRequest(address, fields.join('\r\n'));
      responses += raw;
      const separator = raw.indexOf('\r\n\r\n');
      expect(separator).toBeGreaterThan(0);
      const headers = raw.slice(0, separator).toLowerCase();
      expect(headers).toMatch(authenticated ? /^http\/1\.1 400\b/ : /^http\/1\.1 401\b/);
      expect(headers).toContain('cache-control: no-store');
      const body = JSON.parse(raw.slice(separator + 4)) as Record<string, unknown>;
      expect(body.error).toMatchObject({ code: authenticated ? 'invalid_request' : 'unauthorized' });
      expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
      expect(body.receipts).toEqual([]);
      expect(headers).toContain(`x-request-id: ${String(body.requestId)}`);
    }
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    expect(responses + server.stdout + server.stderr).not.toContain(key);
    expect(jsonLines(server.stdout).some((record) => record.event === 'request_completed' && record.statusCode === 400)).toBe(true);
  });

  it('bounds chunked JSON bodies without a Content-Length on the real listener', async () => {
    const key = randomBytes(32).toString('base64url');
    const canary = randomUUID();
    const server = launch({ API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
    const address = new URL(await started(server));
    const payload = JSON.stringify({ value: canary + 'x'.repeat(65_536) });
    const chunks = [payload.slice(0, 32_768), payload.slice(32_768)];
    const raw = await rawRequest(address, [
      'POST /v1/unmatched HTTP/1.1',
      'Host: localhost',
      `Authorization: Bearer ${key}`,
      'Content-Type: application/json',
      'Transfer-Encoding: chunked',
      'Connection: close',
      '',
      ...chunks.flatMap((chunk) => [Buffer.byteLength(chunk).toString(16), chunk]),
      '0',
      '',
      '',
    ].join('\r\n'));
    const separator = raw.indexOf('\r\n\r\n');
    expect(separator).toBeGreaterThan(0);
    const headers = raw.slice(0, separator).toLowerCase();
    expect(headers).toMatch(/^http\/1\.1 413\b/);
    expect(headers).toContain('cache-control: no-store');
    const body = JSON.parse(raw.slice(separator + 4)) as Record<string, unknown>;
    expect(body.error).toEqual({ code: 'body_too_large', message: 'Request body is too large.' });
    expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
    expect(body.receipts).toEqual([]);
    expect(headers).toContain(`x-request-id: ${String(body.requestId)}`);
    const health = await fetch(new URL('/healthz', address), { signal: AbortSignal.timeout(2000) });
    expect(health.status).toBe(200);
    await health.arrayBuffer();
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    for (const value of [key, canary]) expect(raw + server.stdout + server.stderr).not.toContain(value);
    expect(jsonLines(server.stdout).some((record) => record.event === 'request_completed' && record.statusCode === 413)).toBe(true);
  });

  it.each(['same', 'different'] as const)('rejects duplicate mixed-case Authorization headers with %s values', async (values) => {
    const key = randomBytes(32).toString('base64url');
    const secondKey = values === 'same' ? key : randomBytes(32).toString('base64url');
    const server = launch({ API_KEYS: JSON.stringify([key]), LOG_LEVEL: 'trace' });
    const address = new URL(await started(server));
    const raw = await rawRequest(address, [
      'GET /v1/unmatched HTTP/1.1',
      'Host: localhost',
      `Authorization: Bearer ${key}`,
      `aUtHoRiZaTiOn: Bearer ${secondKey}`,
      'Connection: close',
      '',
      '',
    ].join('\r\n'));
    const separator = raw.indexOf('\r\n\r\n');
    expect(separator).toBeGreaterThan(0);
    const headers = raw.slice(0, separator).toLowerCase();
    expect(headers).toMatch(/^http\/1\.1 401\b/);
    expect(headers).toContain('www-authenticate: bearer');
    expect(headers).toContain('cache-control: no-store');
    const body = JSON.parse(raw.slice(separator + 4)) as Record<string, unknown>;
    expect(body.error).toMatchObject({ code: 'unauthorized' });
    expect(body.engine).toMatchObject({ name: '@zodiacs/engine' });
    expect(body.receipts).toEqual([]);
    expect(headers).toContain(`x-request-id: ${String(body.requestId)}`);
    server.child.kill('SIGTERM');
    expect(await bounded(server.exited)).toEqual({ code: 0, signal: null });
    expect(server.stderr).toBe('');
    for (const credential of [key, secondKey]) expect(raw + server.stdout + server.stderr).not.toContain(credential);
    expect(jsonLines(server.stdout).some((record) => record.event === 'request_completed')).toBe(true);
  });

  it('fails invalid configuration without echoing the supplied value', async () => {
    const canary = `${randomUUID()} ${randomUUID()}`;
    const server = launch({ HOST: canary, LOG_LEVEL: 'trace' });
    expect(await bounded(server.exited)).toEqual({ code: 1, signal: null });
    expect(server.stdout + server.stderr).not.toContain(canary);
    expect(jsonLines(server.stderr)).toEqual([{ level: 'error', event: 'startup_failed' }]);
    expect(server.stdout).toBe('');
  });

  it('reports listener conflicts as sanitized startup failures', async () => {
    const occupied = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        occupied.once('error', reject);
        occupied.listen(0, '127.0.0.1', () => resolve());
      });
      const address = occupied.address();
      if (address === null || typeof address === 'string') throw new Error('No reserved TCP port.');
      const server = launch({ PORT: String(address.port), LOG_LEVEL: 'trace' });
      expect(await bounded(server.exited)).toEqual({ code: 1, signal: null });
      const output = server.stdout + server.stderr;
      expect(jsonLines(server.stderr)).toEqual([{ level: 'error', event: 'startup_failed' }]);
      expect(server.stdout).toBe('');
      expect(output).not.toContain('EADDRINUSE');
      expect(output).not.toContain('stack');
      expect(output).not.toContain('server_started');
    } finally {
      await new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
    }
  });
});
