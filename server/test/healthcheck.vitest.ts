import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const script = fileURLToPath(new URL('../scripts/healthcheck.mjs', import.meta.url));
const servers: Server[] = [];
const ready = { data: { status: 'ready' }, engine: { name: '@zodiacs/engine' }, receipts: [] };

async function probe(port: number | string, host = '127.0.0.1') {
  return new Promise<{ code: number | string; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [script], {
      env: { HOST: host, PORT: String(port), API_KEYS: JSON.stringify([randomBytes(32).toString('base64url')]) },
      timeout: 5000, maxBuffer: 16_384,
    }, (error, stdout, stderr) => resolve({
      code: error ? error.code ?? error.signal ?? 'spawn_failed' : 0, stdout, stderr,
    }));
  });
}

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No probe listener.');
  return address.port;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }));
});

describe('container readiness probe', () => {
  it.each(['127.0.0.1', '0.0.0.0'])('probes the configured %s listener without credentials or output', async (host) => {
    let observed: IncomingMessage | undefined;
    const port = await listen((request, response) => {
      observed = request;
      response.end(JSON.stringify(ready));
    });
    expect(await probe(port, host)).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(observed?.method).toBe('GET');
    expect(observed?.url).toBe('/readyz');
    expect(observed?.headers.authorization).toBeUndefined();
  });

  it('follows actual engine readiness without needing an API key', async () => {
    let isReady = true;
    const app = buildApp({ logger: false, readiness: () => isReady });
    try {
      const address = new URL(await app.listen({ host: '127.0.0.1', port: 0 }));
      expect(await probe(address.port)).toEqual({ code: 0, stdout: '', stderr: '' });
      isReady = false;
      expect(await probe(address.port)).toEqual({ code: 1, stdout: '', stderr: '' });
    } finally {
      await app.close();
    }
  });

  it.each([
    { status: 503, body: JSON.stringify(ready) },
    { status: 302, body: JSON.stringify(ready) },
    { status: 200, body: '{' },
    { status: 200, body: JSON.stringify({ ...ready, data: { status: 'ok' } }) },
    { status: 200, body: JSON.stringify({ ...ready, engine: { name: 'different' } }) },
    { status: 200, body: JSON.stringify({ ...ready, receipts: [{}] }) },
    { status: 200, body: JSON.stringify(ready) + ' '.repeat(65_536) },
  ])('fails closed and silently for an unhealthy response %#', async ({ status, body }) => {
    const port = await listen((_request, response) => {
      response.writeHead(status, { location: '/readyz' });
      response.end(body);
    });
    expect(await probe(port)).toEqual({ code: 1, stdout: '', stderr: '' });
  });

  it('bounds the whole response even while the peer continuously sends bytes', async () => {
    const port = await listen((_request, response) => {
      response.writeHead(200);
      response.write(' ');
      const interval = setInterval(() => response.write(' '), 50);
      response.on('close', () => clearInterval(interval));
    });
    expect(await probe(port)).toEqual({ code: 1, stdout: '', stderr: '' });
  });

  it('fails silently when the configured listener is unavailable', async () => {
    const port = await listen((_request, response) => response.end());
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await probe(port)).toEqual({ code: 1, stdout: '', stderr: '' });
  });

  it.each(['0', '65536', '-1', 'bad-port'])('rejects invalid or undiscoverable port %s silently', async (port) => {
    expect(await probe(port)).toEqual({ code: 1, stdout: '', stderr: '' });
  });
});
