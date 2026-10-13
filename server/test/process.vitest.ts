import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';
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

function launch(overrides: NodeJS.ProcessEnv = {}): RunningServer {
  const child = spawn(process.execPath, ['build/main.js'], {
    cwd: serverDirectory,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', LOG_LEVEL: 'info', ...overrides },
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

afterEach(async () => {
  await Promise.all(processes.splice(0).map(async (server) => {
    if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill('SIGKILL');
    await bounded(server.exited);
  }));
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
    const socket = connect({ host: address.hostname, port: Number(address.port) });
    let raw = '';
    try {
      await bounded(new Promise<void>((resolve, reject) => {
        socket.setEncoding('utf8');
        socket.once('error', reject);
        socket.once('connect', () => {
          socket.write(`GET / HTTP/1.1\r\nHost: localhost\r\nAuthorization: ${canary}\r\nBad Header: value\r\n\r\n`);
        });
        socket.on('data', (chunk: string) => {
          raw += chunk;
          if (raw.length > 64 * 1024) reject(new Error('Malformed request response exceeded its limit.'));
        });
        socket.once('end', resolve);
      }), 2000);
    } finally {
      socket.destroy();
    }
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

  it('fails invalid configuration without echoing the supplied value', async () => {
    const canary = `${randomUUID()} ${randomUUID()}`;
    const server = launch({ HOST: canary });
    expect(await bounded(server.exited)).toEqual({ code: 1, signal: null });
    expect(server.stdout + server.stderr).not.toContain(canary);
    expect(jsonLines(server.stderr)).toEqual([expect.objectContaining({ event: 'startup_failed' })]);
    expect(server.stdout).not.toContain('server_started');
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
      const server = launch({ PORT: String(address.port) });
      expect(await bounded(server.exited)).toEqual({ code: 1, signal: null });
      const output = server.stdout + server.stderr;
      expect(jsonLines(server.stderr)).toEqual([expect.objectContaining({ event: 'startup_failed' })]);
      expect(output).not.toContain('EADDRINUSE');
      expect(output).not.toContain('stack');
      expect(output).not.toContain('server_started');
    } finally {
      await new Promise<void>((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
    }
  });
});
