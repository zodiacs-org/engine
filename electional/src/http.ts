import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Worker } from 'node:worker_threads';
import { checkedHttpLimits, HttpFailure, parseHttpSearch } from './http-limits.js';
import type { HttpLimits, HttpSearchRequest } from './http-limits.js';

export interface HttpServerOptions {
  readonly limits: HttpLimits;
  /** Trusted local worker entry override for host integration and transport tests. */
  readonly workerUrl?: URL;
}
const errorLine = (code: string) => JSON.stringify({ type: 'error', code }) + '\n';

function readBody(request: IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const cleanup = () => {
      request.off('data', data); request.off('end', end); request.off('error', failed);
      request.off('aborted', aborted); signal.removeEventListener('abort', aborted);
    };
    const failed = (error: unknown) => { cleanup(); request.pause(); reject(error); };
    const aborted = () => failed(new HttpFailure(408, 'request-aborted'));
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) failed(new HttpFailure(413, 'request-too-large'));
      else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))); }
      catch { reject(new HttpFailure(400, 'invalid-utf8')); }
    };
    request.on('data', data); request.once('end', end); request.once('error', failed); request.once('aborted', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

/** Import-safe server factory. The caller chooses when and where to listen. */
export function createElectionalServer(options: HttpServerOptions): Server {
  const limits = checkedHttpLimits(options.limits);
  const workerUrl = options.workerUrl ?? new URL('./http-worker.js', import.meta.url);
  let active = 0;
  const server = createServer({ maxHeaderSize: 16_384, headersTimeout: limits.deadlineMs,
    requestTimeout: limits.deadlineMs, connectionsCheckingInterval: Math.min(limits.deadlineMs, 1000) }, (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // One request per connection also makes early body rejection safe: unread
    // bytes cannot be interpreted as the next request on a reusable socket.
    response.setHeader('Connection', 'close');
    const reject = (status: number, code: string) => {
      response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(errorLine(code));
      response.once('finish', () => { if (!request.complete) request.destroy(); });
    };
    if (request.url !== '/electional/search') { reject(404, 'not-found'); return; }
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); reject(405, 'method-not-allowed'); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers['content-type'] ?? '')
      || (request.headers['content-encoding'] !== undefined && request.headers['content-encoding'] !== 'identity')) {
      reject(415, 'unsupported-media-type'); return;
    }
    const length = request.headers['content-length'];
    if (length !== undefined && (!/^\d+$/u.test(length) || Number(length) > limits.maxRequestBytes)) {
      reject(413, 'request-too-large'); return;
    }
    if (active >= limits.maxConcurrentSearches) { reject(503, 'busy'); return; }
    active++;
    const controller = new AbortController();
    let worker: Worker | undefined, stopped = false, released = false, pending = false, emittedBytes = 0;
    const release = () => { if (!released) { released = true; active--; } };
    const stop = () => {
      if (stopped) return;
      stopped = true; clearTimeout(deadline); controller.abort();
      // Keep the admission slot until termination actually finishes.
      if (worker) void worker.terminate().then(release, release); else release();
    };
    const fail = (status: number, code: string) => {
      if (stopped) return;
      stop();
      if (response.destroyed || response.writableEnded) return;
      if (!response.headersSent) { reject(status, code); return; }
      const line = errorLine(code);
      // Reserve a diagnostic line before every provisional chunk. If an output
      // write is still blocked, destroy the socket instead of queueing more.
      if (pending || emittedBytes + Buffer.byteLength(line) > limits.maxResponseBytes) response.destroy();
      else response.end(line);
    };
    const deadline = setTimeout(() => fail(504, 'deadline-exceeded'), limits.deadlineMs);
    response.once('close', stop); response.once('error', stop); request.once('aborted', stop); request.on('error', stop);
    void (async () => {
      try {
        const text = await readBody(request, limits.maxRequestBytes, controller.signal);
        if (stopped) return;
        const parsed = parseHttpSearch(text, limits);
        if (stopped) return;
        worker = new Worker(workerUrl, { workerData: parsed satisfies HttpSearchRequest });
        worker.on('error', () => fail(500, 'search-failed'));
        worker.on('exit', () => { if (!stopped) fail(500, 'search-failed'); });
        worker.on('message', (message: unknown) => {
          if (stopped) return;
          if (!message || typeof message !== 'object') { fail(500, 'search-failed'); return; }
          const value = message as Record<string, unknown>;
          if (value.type !== 'frame' || typeof value.json !== 'string' || typeof value.terminal !== 'boolean' || pending
            || value.json.includes('\n')) { fail(500, 'search-failed'); return; }
          const line = value.json + '\n', bytes = Buffer.byteLength(line);
          const reserve = value.terminal ? 0 : 128;
          if (bytes - 1 > limits.maxFrameBytes || emittedBytes + bytes + reserve > limits.maxResponseBytes) {
            fail(507, 'response-limit'); return;
          }
          if (!response.headersSent) { response.statusCode = 200; response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8'); }
          emittedBytes += bytes; pending = true;
          if (value.terminal) {
            response.end(line, () => { pending = false; stop(); });
          } else response.write(line, error => {
            pending = false;
            if (error) { stop(); return; }
            if (!stopped) worker!.postMessage('accepted');
          });
        });
      } catch (error) {
        fail(error instanceof HttpFailure ? error.status : 500, error instanceof HttpFailure ? error.code : 'search-failed');
      }
    })();
  });
  // Unsupported upgrade/expectation requests must never launch searches.
  const expectationFailed = (_request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(417, { Connection: 'close', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json; charset=utf-8' });
    response.end(errorLine('expectation-failed'));
  };
  server.on('checkContinue', expectationFailed);
  server.on('checkExpectation', expectationFailed);
  return server;
}
