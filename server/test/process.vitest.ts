import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

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
