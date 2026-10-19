import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { Worker } from 'node:worker_threads';
import { EVENT_BODIES } from './engine.js';

/** Service caps, not astronomical accuracy or completeness guarantees. */
export const HTTP_LIMITS = Object.freeze({ bodyBytes: 16384, maxEvaluations: 100000,
  responseBytes: 1048576, deadlineMs: 10000, concurrent: 1 });
export interface HttpServerOptions {
  /** May reduce, never increase, the service deadline. */
  readonly deadlineMs?: number;
  /** Trusted local bundled worker entry. Never supplied by an HTTP request. */
  readonly workerUrl?: URL;
}
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const keys = (x: Record<string, unknown>, allowed: readonly string[]) => Object.keys(x).every(k => allowed.includes(k));
function validRequest(x: unknown): x is { query: string; options: Record<string, unknown> } {
  if (!object(x) || !keys(x, ['query', 'options']) || typeof x.query !== 'string' || !object(x.options)) return false;
  const o = x.options;
  if (!keys(o, ['stepMs', 'stationStepMs', 'maxEvaluations', 'clock', 'horizon', 'natalLongitudes', 'eclipse']) ||
      !Number.isSafeInteger(o.stepMs) || (o.stepMs as number) < 1 ||
      (o.stationStepMs !== undefined && (!Number.isSafeInteger(o.stationStepMs) ||
        (o.stationStepMs as number) < 1 || (o.stationStepMs as number) > (o.stepMs as number))) ||
      !Number.isSafeInteger(o.maxEvaluations) || (o.maxEvaluations as number) < 1 ||
      (o.maxEvaluations as number) > HTTP_LIMITS.maxEvaluations) return false;
  if (o.natalLongitudes !== undefined && (!object(o.natalLongitudes) ||
      !keys(o.natalLongitudes, EVENT_BODIES) || Object.values(o.natalLongitudes).some(v =>
        typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 360))) return false;
  return true;
}
function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', connection: 'close' });
  res.end(json);
}
/** No listening or worker creation at import time. Call listen explicitly. */
export function createEventServer(options: HttpServerOptions = {}) {
  if (!keys(options as Record<string, unknown>, ['deadlineMs', 'workerUrl'])) throw new TypeError('Unknown server option.');
  const deadline = options.deadlineMs ?? HTTP_LIMITS.deadlineMs;
  if (!Number.isSafeInteger(deadline) || deadline < 1 || deadline > HTTP_LIMITS.deadlineMs) throw new RangeError('Invalid deadline.');
  const workerUrl = options.workerUrl ?? new URL('./http-worker.js', import.meta.url);
  if (!(workerUrl instanceof URL) || workerUrl.protocol !== 'file:') throw new TypeError('Worker must be a local file URL.');
  let active = 0;
  const server = createServer((req, res) => {
    const fail = (status: number, code: string) => send(res, status, { error: { code } });
    if (req.url !== '/search') { fail(404, 'not-found'); req.resume(); return; }
    if (req.method !== 'POST') { res.setHeader('allow', 'POST'); fail(405, 'method-not-allowed'); req.resume(); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '') || req.headers['content-encoding'] !== undefined) {
      fail(415, 'unsupported-media-type'); req.resume(); return;
    }
    if (active >= HTTP_LIMITS.concurrent) { fail(503, 'busy'); req.resume(); return; }
    active++;
    let worker: Worker | undefined;
    let finished = false;
    let cleanup: Promise<void> | undefined;
    const finish = () => {
      if (finished) return cleanup;
      finished = true; clearTimeout(timer);
      if (worker) {
        // Retain admission slot until the terminated worker actually exits.
        cleanup = worker.terminate().then(() => { active--; });
      } else active--;
      return cleanup;
    };
    const timer = setTimeout(() => { fail(408, 'deadline'); finish(); req.resume(); }, deadline);
    res.once('close', finish);
    req.once('error', finish);
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (finished) return;
      size += chunk.length;
      if (size > HTTP_LIMITS.bodyBytes) { fail(413, 'body-limit'); finish(); chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      let data: unknown;
      try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { fail(400, 'invalid-json'); finish(); return; }
      if (!validRequest(data)) { fail(400, 'invalid-request'); finish(); return; }
      try { worker = new Worker(workerUrl, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: 64 } }); }
      catch { fail(500, 'internal-error'); finish(); return; }
      worker.once('message', async (message: { status: number; body: unknown }) => {
        if (finished) return;
        await finish();
        if (Buffer.byteLength(JSON.stringify(message.body)) > HTTP_LIMITS.responseBytes) fail(413, 'response-limit');
        else send(res, message.status, message.body);
      });
      worker.once('error', () => { if (!finished) fail(500, 'internal-error'); finish(); });
      worker.once('exit', () => { if (!finished) fail(500, 'internal-error'); finish(); });
    });
  });
  server.requestTimeout = deadline;
  server.headersTimeout = deadline;
  server.maxHeadersCount = 32;
  return server;
}
