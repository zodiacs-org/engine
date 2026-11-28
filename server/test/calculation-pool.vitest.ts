import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalculationError, CalculationPool } from '../src/calculation-pool.js';
import type { CalculationErrorCode, CalculationPoolOptions } from '../src/calculation-pool.js';
import { calculate } from '../src/calculations.js';
import type { CalculationTask } from '../src/calculations.js';

const pools: CalculationPool[] = [];
const directories: string[] = [];
const fixtureUrl = new URL('./fixtures/calculation-worker.mjs', import.meta.url);
// Synthetic engine inputs, unrelated to any person's birth.
const natal = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };

function pool(options: CalculationPoolOptions = {}): CalculationPool {
  const value = new CalculationPool(options);
  pools.push(value);
  return value;
}

function fixture(options: CalculationPoolOptions = {}): CalculationPool {
  return pool({ workerUrl: fixtureUrl, ...options });
}

async function stateUrl(mode?: string): Promise<{ url: URL; path: string }> {
  const cache = new URL('../.cache/', import.meta.url);
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(fileURLToPath(new URL('workers-', cache)));
  directories.push(directory);
  const path = `${directory}/starts.txt`;
  const url = new URL(fixtureUrl);
  url.searchParams.set('state', path);
  if (mode !== undefined) url.searchParams.set('mode', mode);
  // Node's Worker entry resolves file URLs without their query. An ordinary
  // ESM import retains it, so keep fixture settings in an ignored wrapper.
  const wrapper = pathToFileURL(`${directory}/worker.mjs`);
  await writeFile(wrapper, `import ${JSON.stringify(url.href)};\n`);
  return { url: wrapper, path };
}

async function rejected(promise: Promise<unknown>, code: CalculationErrorCode): Promise<CalculationError> {
  const result = await promise.then(() => undefined, (error: unknown) => error);
  expect(result).toBeInstanceOf(CalculationError);
  expect(result).toMatchObject({ code, message: new CalculationError(code).message });
  expect((result as Error).cause).toBeUndefined();
  return result as CalculationError;
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((value) => value.close()));
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('calculation worker admission and transport', () => {
  it.each([
    { timeoutMs: 99 }, { timeoutMs: 30_001 }, { timeoutMs: 100.5 }, { timeoutMs: NaN },
    { maxQueue: -1 }, { maxQueue: 65 }, { maxQueue: 0.5 }, { maxQueue: Infinity },
  ])('rejects invalid limits without retaining their values: %j', (options) => {
    expect(() => pool(options)).toThrow('Invalid calculation pool limits.');
  });

  it('requires start, shares concurrent startup, and closes idempotently', async () => {
    const value = fixture();
    expect(value.ready).toBe(false);
    await rejected(value.run('natal', {}, randomUUID()), 'not_ready');
    const first = value.start();
    expect(value.start()).toBe(first);
    await first;
    await value.start();
    expect(value.ready).toBe(true);
    const closing = value.close();
    expect(value.ready).toBe(false);
    expect(value.close()).toBe(closing);
    await closing;
    await rejected(value.start(), 'not_ready');
    await rejected(value.run('natal', {}, randomUUID()), 'not_ready');
  });

  it('checks the real engine before readiness and preserves every task result and Date', async () => {
    const value = pool();
    expect(value.ready).toBe(false);
    await value.start();
    expect(value.ready).toBe(true);
    const cases: [CalculationTask, unknown][] = [
      ['natal', natal],
      ['transits', { natal, at: '2002-03-04T05:06:07Z' }],
      ['synastry', { a: natal, b: { utc: '2002-03-04T05:06:07Z' } }],
      ['solar-return', { natal, at: '2002-03-04T05:06:07Z' }],
      ['lunar-return', { natal, after: '2002-03-04T05:06:07Z' }],
      ['moon-phase', { at: '2002-03-04T05:06:07Z' }],
      ['houses', { time: { iso: natal.utc }, place: { latitude: natal.latitude, longitude: natal.longitude }, houseSystem: 'whole' }],
    ];
    for (const [task, input] of cases) {
      const requestId = randomUUID();
      const result = await value.run(task, input, requestId);
      // Integration/regression parity only, not independent accuracy evidence.
      expect(result).toEqual(calculate(task, input, requestId));
      if (task === 'natal') expect((result as { data: { input: { utc: unknown } } }).data.input.utc).toBeInstanceOf(Date);
    }
  });

  it('sanitizes real engine validation, receipt refusal and unexpected exceptions', async () => {
    const value = pool();
    await value.start();
    const canary = randomBytes(32).toString('base64url');
    for (const [task, input, code] of [
      ['natal', { utc: canary }, 'invalid_request'],
      ['natal', { utc: '2000-01-02T03:04:05Z', latitude: 89.99999999999999, longitude: 0, houseSystem: 'regiomontanus' }, 'receipt_unavailable'],
      ['synastry', null, 'internal_error'],
    ] as const) {
      const error = await rejected(value.run(task, input, randomUUID()), code);
      expect(JSON.stringify(error) + error.stack).not.toContain(canary);
      expect(value.ready).toBe(true);
    }
    const requestId = randomUUID();
    expect(await value.run('natal', natal, requestId)).toEqual(calculate('natal', natal, requestId));
  });

  it('bounds the waiting queue and dispatches serially in admission order', async () => {
    const value = fixture({ maxQueue: 1 });
    await value.start();
    const firstId = randomUUID();
    const secondId = randomUUID();
    const first = value.run('natal', { action: 'delay', ms: 100 }, firstId);
    const date = new Date(natal.utc);
    const second = value.run('natal', { date }, secondId);
    await rejected(value.run('natal', {}, randomUUID()), 'server_busy');
    expect(value.ready).toBe(true);
    expect(await first).toMatchObject({ concurrent: 1, history: [firstId] });
    expect(await second).toMatchObject({ concurrent: 1, history: [firstId, secondId], input: { date } });
  });

  it('allows the active slot with a zero-length waiting queue', async () => {
    const value = fixture({ maxQueue: 0 });
    await value.start();
    const first = value.run('natal', { action: 'delay', ms: 30 }, randomUUID());
    await rejected(value.run('natal', {}, randomUUID()), 'server_busy');
    await first;
    await expect(value.run('natal', {}, randomUUID())).resolves.toMatchObject({ concurrent: 1 });
  });

  it('does not copy environment secrets or inherited runtime flags to a worker', async () => {
    const credential = randomBytes(32).toString('base64url');
    vi.stubEnv('API_KEYS', JSON.stringify([credential]));
    vi.stubEnv('NODE_OPTIONS', '--trace-warnings');
    const value = fixture();
    await value.start();
    const result = await value.run('natal', {}, randomUUID());
    expect(result).toMatchObject({ environment: [], execArgv: [] });
    expect(JSON.stringify(result)).not.toContain(credential);
  });

  it('sanitizes protocol error text and local structured-clone failures', async () => {
    const value = fixture();
    await value.start();
    const canary = randomUUID();
    for (const kind of ['invalid_request', 'receipt_unavailable', 'internal_error', canary] as const) {
      const expected = kind === 'invalid_request' || kind === 'receipt_unavailable' ? kind : 'internal_error';
      const error = await rejected(value.run('natal', { action: 'error', kind, canary }, randomUUID()), expected);
      expect(JSON.stringify(error) + error.stack).not.toContain(canary);
    }
    await rejected(value.run('natal', { uncloneable: () => canary }, randomUUID()), 'internal_error');
    expect(value.ready).toBe(true);
    await expect(value.run('natal', {}, randomUUID())).resolves.toMatchObject({ concurrent: 1 });
  });
});

describe('calculation deadlines, recovery and shutdown', () => {
  it('terminates a hung calculation, rejects waiting work, and verifies a replacement', async () => {
    const value = fixture({ timeoutMs: 150 });
    await value.start();
    const first = rejected(value.run('natal', { action: 'hang' }, randomUUID()), 'calculation_timeout');
    const second = rejected(value.run('natal', {}, randomUUID()), 'not_ready');
    await first;
    expect(value.ready).toBe(false);
    await rejected(value.run('natal', {}, randomUUID()), 'not_ready');
    await second;
    await vi.waitFor(() => expect(value.ready).toBe(true));
    await expect(value.run('natal', {}, randomUUID())).resolves.toMatchObject({ concurrent: 1 });
  });

  it('counts time waiting in the queue against the execution deadline', async () => {
    const value = fixture({ timeoutMs: 300 });
    await value.start();
    const first = value.run('natal', { action: 'delay', ms: 175 }, randomUUID());
    const second = rejected(value.run('natal', { action: 'delay', ms: 175 }, randomUUID()), 'calculation_timeout');
    await first;
    await second;
    expect(value.ready).toBe(false);
  });

  it.each(['crash', 'exit'])('recovers after unexpected worker %s without exposing its exception', async (action) => {
    const value = fixture();
    await value.start();
    const canary = randomUUID();
    const active = rejected(value.run('natal', { action, canary }, randomUUID()), 'calculation_failed');
    const queued = rejected(value.run('natal', {}, randomUUID()), 'not_ready');
    const error = await active;
    await queued;
    expect(JSON.stringify(error) + error.stack).not.toContain(canary);
    expect(value.ready).toBe(false);
    await vi.waitFor(() => expect(value.ready).toBe(true));
    await expect(value.run('natal', {}, randomUUID())).resolves.toMatchObject({ concurrent: 1 });
  });

  it('captures and discards worker stdout and stderr', async () => {
    const canary = randomUUID();
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');
    const value = fixture();
    await value.start();
    await value.run('natal', { action: 'output', canary }, randomUUID());
    await value.close();
    for (const spy of [stdout, stderr]) {
      expect(spy.mock.calls.map((call) => String(call[0])).join('')).not.toContain(canary);
    }
  });

  it('stays unready without spinning when a replacement fails to initialize', async () => {
    const { url, path } = await stateUrl('fail-restart');
    const value = fixture({ workerUrl: url, timeoutMs: 100 });
    await value.start();
    await rejected(value.run('natal', { action: 'hang' }, randomUUID()), 'calculation_timeout');
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('2'));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await readFile(path, 'utf8')).toBe('2');
    expect(value.ready).toBe(false);
    await rejected(value.run('natal', {}, randomUUID()), 'not_ready');
  });

  it('does not loop when replacements report ready and then repeatedly crash while idle', async () => {
    const { url, path } = await stateUrl('ready-crash');
    const value = fixture({ workerUrl: url });
    await value.start();
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('2'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await readFile(path, 'utf8')).toBe('2');
    expect(value.ready).toBe(false);
    await rejected(value.run('natal', {}, randomUUID()), 'not_ready');
    // An explicit operator restart grants another attempt, without a loop.
    await value.start();
    await vi.waitFor(async () => expect(await readFile(path, 'utf8')).toBe('4'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await readFile(path, 'utf8')).toBe('4');
    expect(value.ready).toBe(false);
  });

  it('resets its replacement allowance only after a successful calculation', async () => {
    const { url, path } = await stateUrl();
    const value = fixture({ workerUrl: url, timeoutMs: 100 });
    await value.start();
    await rejected(value.run('natal', { action: 'hang' }, randomUUID()), 'calculation_timeout');
    await vi.waitFor(() => expect(value.ready).toBe(true));
    await value.run('natal', {}, randomUUID());
    await rejected(value.run('natal', { action: 'hang' }, randomUUID()), 'calculation_timeout');
    await vi.waitFor(() => expect(value.ready).toBe(true));
    expect(await readFile(path, 'utf8')).toBe('3');
    await rejected(value.run('natal', { action: 'error', kind: 'invalid_request' }, randomUUID()), 'invalid_request');
    await rejected(value.run('natal', { action: 'hang' }, randomUUID()), 'calculation_timeout');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(value.ready).toBe(false);
    expect(await readFile(path, 'utf8')).toBe('3');
  });

  it('rejects late real engine results even when the parent event loop was delayed', async () => {
    const value = pool({ timeoutMs: 100 });
    await value.start();
    const active = rejected(value.run('natal', natal, randomUUID()), 'calculation_timeout');
    // The worker computes independently while its completed result and the
    // parent's timer both wait for the parent event loop to resume.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
    await active;
    expect(value.ready).toBe(false);
    await value.close();
  });

  it('closes during recovery without starting a replacement', async () => {
    const { url, path } = await stateUrl();
    const value = fixture({ workerUrl: url, timeoutMs: 100 });
    await value.start();
    await rejected(value.run('natal', { action: 'hang' }, randomUUID()), 'calculation_timeout');
    await value.close();
    expect(value.ready).toBe(false);
    expect(await readFile(path, 'utf8')).toBe('1');
  });

  it('rejects startup failure with fixed text and closes a pending startup', async () => {
    const { url } = await stateUrl('startup-fail');
    const failed = fixture({ workerUrl: url });
    await rejected(failed.start(), 'calculation_failed');
    expect(failed.ready).toBe(false);
    await failed.close();
    const hanging = await stateUrl('startup-hang');
    const pending = fixture({ workerUrl: hanging.url });
    const starting = rejected(pending.start(), 'not_ready');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await pending.close();
    await starting;
    expect(pending.ready).toBe(false);
  });

  it('drains only accepted active work on close and rejects new and queued jobs', async () => {
    const value = fixture();
    await value.start();
    const active = value.run('natal', { action: 'delay', ms: 100 }, randomUUID());
    const queued = rejected(value.run('natal', {}, randomUUID()), 'not_ready');
    const closing = value.close();
    expect(value.ready).toBe(false);
    await queued;
    await rejected(value.run('natal', {}, randomUUID()), 'not_ready');
    await expect(active).resolves.toMatchObject({ concurrent: 1 });
    await closing;
    expect(value.ready).toBe(false);
  });

  it('retains the active deadline during close and never starts a replacement', async () => {
    const { url, path } = await stateUrl();
    const value = fixture({ workerUrl: url, timeoutMs: 150 });
    await value.start();
    const active = rejected(value.run('natal', { action: 'hang' }, randomUUID()), 'calculation_timeout');
    await value.close();
    await active;
    expect(await readFile(path, 'utf8')).toBe('1');
    expect(value.ready).toBe(false);
  });

  it('drains a real engine calculation while refusing queued work during close', async () => {
    const value = pool();
    await value.start();
    const requestId = randomUUID();
    const active = value.run('natal', natal, requestId);
    const queued = rejected(value.run('natal', natal, randomUUID()), 'not_ready');
    await value.close();
    expect(await active).toEqual(calculate('natal', natal, requestId));
    await queued;
    expect(value.ready).toBe(false);
  });
});
