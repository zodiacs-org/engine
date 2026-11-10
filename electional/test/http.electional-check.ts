import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import type { ClientRequest, IncomingHttpHeaders, Server } from 'node:http';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import golden from './fixtures/composition-windows.json';
import policy from '../examples/http-policy.json';
import nativeControls from '../examples/http-controls.json';
import { parseRuleSet } from '../src/rules.js';
import { createElectionalServer } from '../src/http.js';
import { checkedHttpLimits, parseHttpSearch } from '../src/http-limits.js';
import type { HttpLimits } from '../src/http-limits.js';
import type { RuleSet, ElectionalRule } from '../src/rule-types.js';
import type { StreamChunk, StreamEnd } from '../src/stream.js';
import { receipt } from './support/http-basic-stub.js';

const goldenWorker = new URL('../generated/http-golden-worker.mjs', import.meta.url);
const nativeWorker = new URL('../generated/http-native-worker.mjs', import.meta.url);
const config: RuleSet = { schemaVersion: 'electional/v1', activity: 'Synthetic HTTP integer sets', location: { latitude: 0, longitude: 0 }, houseSystem: 'whole',
  range: { start: new Date(0).toISOString(), end: new Date(100).toISOString(), clock: 'utc' },
  rules: golden.rules.map(r => ({ id: r.id, kind: 'moon-sign', mode: r.mode, ...(r.mode === 'prefer' ? { weight: r.weight } : {}), options: { signs: ['aries'] } })) as ElectionalRule[] };
const controls = { stepMs: 10, lookaheadMs: 20, maxEvaluations: 1000, maxSkySamples: 1000,
  chunkMs: 25, maxChunks: 4, maxChunkEvaluations: 100, maxChunkSkySamples: 100, maxFrameBytes: 1000000 };
const limits: HttpLimits = { ...policy, minStepMs: 1, deadlineMs: 5000, maxConcurrentSearches: 1 };
const encode = (rules: unknown = config, settings: unknown = controls, format = 'json') => JSON.stringify({ format,
  rules: format === 'yaml' ? stringify(rules) : JSON.stringify(rules), controls: settings });
const single = (id: string): RuleSet => ({ ...config, rules: [{ id, kind: 'moon-sign', mode: 'require', options: { signs: ['aries'] } }] });
beforeAll(async () => {
  const entry = fileURLToPath(new URL('../src/http-worker.ts', import.meta.url));
  const common = { entryPoints: [entry], bundle: true, packages: 'external' as const, format: 'esm' as const, platform: 'node' as const, target: 'node22' };
  await build({ ...common, outfile: fileURLToPath(nativeWorker) });
  await build({ ...common, outfile: fileURLToPath(goldenWorker), plugins: [{ name: 'independent-golden-delegate', setup(builder) {
    builder.onResolve({ filter: /\/basic-rules\.js$/ }, () => ({ path: fileURLToPath(new URL('./support/http-basic-stub.ts', import.meta.url)) }));
  } }] });
});
const servers: Server[] = [], clients: ClientRequest[] = [];
afterEach(async () => {
  clients.splice(0).forEach(c => c.destroy());
  await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => { s.close(() => resolve()); s.closeAllConnections(); })));
});
async function host(overrides: Partial<HttpLimits> = {}, workerUrl = goldenWorker) {
  const server = createElectionalServer({ limits: { ...limits, ...overrides }, workerUrl });
  servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected TCP server.');
  return address.port;
}
function send(port: number, body: string | Buffer = encode(), options: { method?: string; path?: string; headers?: IncomingHttpHeaders; chunked?: boolean } = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method: options.method ?? 'POST', path: options.path ?? '/electional/search',
      headers: { 'Content-Type': 'application/json', ...(!options.chunked ? { 'Content-Length': Buffer.byteLength(body) } : {}), ...options.headers } }, response => {
      let text = ''; response.setEncoding('utf8'); response.on('data', value => { text += value; });
      response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: text })); response.on('error', reject);
    });
    clients.push(request); request.on('error', reject); request.end(body);
  });
}
const frames = (text: string) => text.trim().split('\n').map(line => JSON.parse(line)) as (StreamChunk | StreamEnd)[];

describe('HTTP hand-derived window transport', () => {
  it.each(['json', 'yaml'])('streams %s with exact golden membership, uncertainty, receipts and facts-only explanations', async format => {
    const result = await send(await host(), encode(config, controls, format));
    expect(result.status).toBe(200); expect(result.headers['content-type']).toContain('application/x-ndjson');
    expect(result.headers['cache-control']).toBe('no-store'); expect(result.headers['x-content-type-options']).toBe('nosniff');
    const output = frames(result.body), chunks = output.filter((f): f is StreamChunk => f.type === 'chunk');
    expect(output.at(-1)).toMatchObject({ type: 'end', status: 'unresolved', chunks: 4, remaining: null });
    const fragments = chunks.flatMap(c => c.fragments);
    for (const cell of golden.windows) {
      const parts = fragments.filter(f => f.startMs >= cell.span[0]! && f.endMs <= cell.span[1]!);
      expect(parts.reduce((sum, f) => sum + f.durationMs, 0)).toBe(cell.span[1]! - cell.span[0]!);
      expect(parts.every(f => f.explanations.map(e => e.state).join() === cell.states.join())).toBe(true);
    }
    expect(fragments.reduce((sum, f) => sum + f.durationMs, 0)).toBe(100);
    expect(chunks.every(c => !('scoring' in c.facts) && !('ranking' in c.facts))).toBe(true);
    expect(fragments.every(f => !('score' in f) && !('internalScore' in f) && !('chunkRank' in f) && !('rank' in f)
      && f.explanations.every(e => !('contribution' in e)) && f.receipts.every(r => JSON.stringify(r) === JSON.stringify(receipt)))).toBe(true);
  });
  it('retains a chunk-budget refusal and an unattempted suffix', async () => {
    const result = await send(await host(), encode(config, { ...controls, maxChunks: 1 }));
    expect(result.status).toBe(200);
    expect(frames(result.body).at(-1)).toMatchObject({ type: 'end', status: 'refused', reason: 'chunk-budget', remaining: { startMs: 25, endMs: 100 } });
  });
  it('retains empty complete results when the required hand-derived set is outside the range', async () => {
    const rules = { ...single('hard-a'), range: { ...config.range, end: new Date(5).toISOString() } };
    const result = await send(await host(), encode(rules));
    expect(result.status).toBe(200); expect(frames(result.body)[0]).toMatchObject({ fragments: [{ explanations: [{ state: 'failed' }] }], facts: { status: 'complete', eligible: [] } });
    expect(frames(result.body).at(-1)).toMatchObject({ type: 'end', status: 'complete' });
  });
  it('bounds cumulative output without sending a successful end after a provisional prefix', async () => {
    const port = await host();
    const reference = frames((await send(port, encode(config, { ...controls, maxChunks: 1 }))).body)[0]!;
    // Independently count the UTF-8 bytes of the first serialized line. The
    // reserved diagnostic must fit; the following full chunk must not fit.
    const maxResponseBytes = Buffer.byteLength(JSON.stringify(reference) + '\n') + 128;
    const result = await send(await host({ maxResponseBytes }));
    const output = result.body.trim().split('\n').map(line => JSON.parse(line));
    expect(result.status).toBe(200); expect(output).toHaveLength(2);
    expect(output[0].type).toBe('chunk'); expect(output[1]).toEqual({ type: 'error', code: 'response-limit' });
    expect(Buffer.byteLength(result.body)).toBeLessThanOrEqual(maxResponseBytes);
  });
  it('rejects an oversized first frame with a bounded JSON transport error', async () => {
    const result = await send(await host({ maxResponseBytes: 256 }));
    expect(result.status).toBe(507); expect(JSON.parse(result.body)).toEqual({ type: 'error', code: 'response-limit' });
  });
  it('preserves the stream output-budget end refusal when the caller requests tiny frames', async () => {
    const result = await send(await host(), encode(config, { ...controls, maxFrameBytes: 1 }));
    expect(result.status).toBe(200); expect(frames(result.body)).toHaveLength(1);
    expect(frames(result.body)[0]).toMatchObject({ type: 'end', status: 'refused', reason: 'output-budget', chunks: 0 });
  });
});

describe('HTTP strict inputs and operator policy', () => {
  it.each([
    { method: 'GET', expected: 405 }, { method: 'PUT', expected: 405 }, { method: 'OPTIONS', expected: 405 },
    { path: '/chart', expected: 404 }, { path: '/electional/search?score=true', expected: 404 },
    { headers: { 'content-type': 'text/yaml' }, expected: 415 }, { headers: { 'content-type': '' }, expected: 415 },
    { headers: { 'content-encoding': 'gzip' }, expected: 415 },
    { headers: { expect: '100-continue' }, expected: 417 },
    { headers: { expect: 'unsupported' }, expected: 417 },
  ])('rejects unsupported route/method/media $expected $method $path', async ({ expected, ...request }) => {
    const result = await send(await host(), '', request); expect(result.status).toBe(expected);
    expect(result.headers['connection']).toBe('close'); expect(result.body).not.toContain('private');
    if (expected === 405) expect(result.headers['allow']).toBe('POST');
  });
  it.each([
    '{', 'null', '[]', '{}', '{"format":"json","format":"json"}',
    encode(config).replace('"stepMs":10', '"stepMs":10,"stepMs":10'),
    JSON.stringify({ format: 'json', rules: '{}', controls }),
    JSON.stringify({ format: 'auto', rules: JSON.stringify(config), controls }),
    JSON.stringify({ format: 'json', rules: config, controls }),
    JSON.stringify({ format: 'json', rules: JSON.stringify(config), controls, url: 'private-secret' }),
    encode(config, { ...controls, internalScoring: true }), encode(config, { ...controls, scoring: { enabled: true } }),
    encode({ ...config, scoring: { enabled: true } }), encode(config, { ...controls, signal: {} }),
    encode(config, { ...controls, deadlineMs: 1 }), encode(config, { ...controls, maxEvaluations: 0 }),
    encode({ ...config, natal: { synthetic: false } }),
    encode(single('plain')).replace('"chunkMs":25', '"chunkMs":25,"chunkMs":26'),
  ])('rejects malformed or unsupported public input %#', async text => {
    const result = await send(await host(), text); expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ type: 'error', code: 'invalid-request' });
  });
  it.each([false, true])('enforces incremental and declared request byte limits, chunked=%s', async chunked => {
    const text = encode(), result = await send(await host({ maxRequestBytes: Buffer.byteLength(text) - 1 }), text, { chunked });
    expect(result.status).toBe(413); expect(JSON.parse(result.body).code).toBe('request-too-large');
  });
  it('accepts exactly the UTF-8 request allowance with multibyte activity', async () => {
    const text = encode({ ...config, activity: 'Synthetic é界 activity' });
    const result = await send(await host({ maxRequestBytes: Buffer.byteLength(text) }), text, { chunked: true });
    expect(result.status).toBe(200);
  });
  it('rejects malformed UTF-8 instead of normalizing it', async () => {
    const result = await send(await host(), Buffer.from([0xc3, 0x28])); expect(result.status).toBe(400);
    expect(JSON.parse(result.body).code).toBe('invalid-utf8');
  });
  it.each([
    { maxRangeMs: 99 }, { minStepMs: 11 }, { maxLookaheadMs: 19 }, { maxChunkMs: 24 }, { maxChunks: 3 },
    { maxEvaluations: 999 }, { maxSkySamples: 999 }, { maxChunkEvaluations: 99 }, { maxChunkSkySamples: 99 }, { maxFrameBytes: 999999 },
  ])('rejects controls above host policy rather than silently changing them %j', async cap => {
    const result = await send(await host(cap)); expect(result.status).toBe(422); expect(JSON.parse(result.body).code).toBe('policy-limit');
  });
  it('accepts policy equality and detaches the operator snapshot', () => {
    const input = { ...limits }; const snapshot = checkedHttpLimits(input); input.maxRangeMs = 1;
    expect(Object.isFrozen(snapshot)).toBe(true); expect(snapshot.maxRangeMs).toBe(limits.maxRangeMs);
    expect(parseHttpSearch(encode(), { ...limits, maxRangeMs: 100, minStepMs: 10, maxLookaheadMs: 20, maxChunkMs: 25,
      maxChunks: 4, maxEvaluations: 1000, maxSkySamples: 1000, maxChunkEvaluations: 100, maxChunkSkySamples: 100 }).controls).toEqual(controls);
  });
  it.each(Object.keys(limits))('requires explicit safe operator field %s', key => {
    const input = { ...limits } as Record<string, unknown>; delete input[key];
    expect(() => checkedHttpLimits(input as unknown as HttpLimits)).toThrow(RangeError);
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null]) {
      expect(() => checkedHttpLimits({ ...limits, [key]: value })).toThrow(RangeError);
    }
  });
  it('rejects unsupported policy keys and timer overflow; supports zero maximum lookahead', () => {
    expect(() => checkedHttpLimits({ ...limits, extra: true } as HttpLimits)).toThrow();
    expect(() => checkedHttpLimits({ ...limits, deadlineMs: 2147483648 })).toThrow();
    expect(() => checkedHttpLimits({ ...limits, maxFrameBytes: 255 })).toThrow();
    expect(() => checkedHttpLimits({ ...limits, maxResponseBytes: 255 })).toThrow();
    expect(checkedHttpLimits({ ...limits, maxLookaheadMs: 0 }).maxLookaheadMs).toBe(0);
  });
});

describe('HTTP deadlines cancellation and worker lifetime', () => {
  it('enforces a deadline while a worker is in a synchronous call after a provisional chunk', async () => {
    const result = await send(await host({ deadlineMs: 1500 }), encode(single('block-after-first')));
    const output = result.body.trim().split('\n').map(line => JSON.parse(line));
    expect(result.status).toBe(200); expect(output[0].type).toBe('chunk');
    expect(output.at(-1)).toEqual({ type: 'error', code: 'deadline-exceeded' });
    expect(output.some(f => f.type === 'end')).toBe(false);
  });
  it('returns a JSON deadline error before headers when no worker frame is available', async () => {
    const result = await send(await host({ deadlineMs: 500 }), encode(single('block')));
    expect(result.status).toBe(504); expect(JSON.parse(result.body)).toEqual({ type: 'error', code: 'deadline-exceeded' });
  });
  it('includes stalled body upload time in the deadline', async () => {
    const port = await host({ deadlineMs: 100 });
    const result = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/electional/search',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 100 } }, response => { response.resume(); resolve(response.statusCode!); });
      request.on('error', reject); clients.push(request); request.write('{');
    });
    expect(result).toBe(504);
  });
  it('counts body uploads in admission and releases the slot on disconnect', async () => {
    const port = await host();
    const request = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/electional/search',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 100 } });
    clients.push(request); request.on('error', () => {}); request.write('{');
    // The first request's body is flowing before the competing request is sent.
    await new Promise(resolve => setTimeout(resolve, 25));
    const busy = await send(port); expect(busy.status).toBe(503); expect(JSON.parse(busy.body).code).toBe('busy');
    request.destroy();
    await new Promise(resolve => setTimeout(resolve, 25));
    expect((await send(port)).status).toBe(200);
  });
  it('terminates a working search on response disconnect and admits a later request', async () => {
    const port = await host({ deadlineMs: 5000 });
    await new Promise<void>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/electional/search', headers: { 'Content-Type': 'application/json' } }, response => {
        response.once('data', () => { response.destroy(); request.destroy(); resolve(); }); response.on('error', () => {});
      });
      clients.push(request); request.on('error', reject); request.end(encode(single('block-after-first')));
    });
    // Termination is asynchronous; the admission slot stays occupied until exit.
    let result = await send(port);
    for (let attempt = 0; attempt < 30 && result.status === 503; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10)); result = await send(port);
    }
    expect(result.status).toBe(200);
  });
  it.each(['crash', 'crash-after-first'])('reports bounded source errors without a false terminal completion: %s', async id => {
    const result = await send(await host(), encode(single(id)));
    expect(result.status).toBe(id === 'crash' ? 500 : 200);
    const output = result.body.trim().split('\n').map(line => JSON.parse(line));
    expect(output.at(-1)).toEqual({ type: 'error', code: 'search-failed' });
    expect(output.some(f => f.type === 'end')).toBe(false); expect(result.body).not.toContain('private-source-message');
  });
  it('reports an unavailable worker module without exposing its path', async () => {
    const result = await send(await host({}, new URL('../generated/private-missing-module.mjs', import.meta.url)));
    expect(result.status).toBe(500); expect(JSON.parse(result.body).code).toBe('search-failed'); expect(result.body).not.toContain('private');
  });
  it('pulls exactly one frame until the worker receives the host acknowledgement', async () => {
    const request = parseHttpSearch(encode(), limits);
    const worker = new Worker(goldenWorker, { workerData: request });
    const messages: { type: string; json: string }[] = []; worker.on('message', message => messages.push(message));
    try {
      await once(worker, 'message'); expect(messages).toHaveLength(1);
      await new Promise(resolve => setTimeout(resolve, 50)); expect(messages).toHaveLength(1);
      worker.postMessage('accepted'); await once(worker, 'message'); expect(messages).toHaveLength(2);
      expect(JSON.parse(messages[1]!.json)).toMatchObject({ type: 'chunk', index: 1 });
    } finally { await worker.terminate(); }
  });
});

describe('HTTP native delegation', () => {
  it('retains pre-reference engine coverage as a refusal without invented eligibility', async () => {
    const result = await send(await host({}, nativeWorker), encode({ ...single('native'), range: { start: '1600-01-01T00:00:00Z', end: '1600-01-01T00:00:00.100Z', clock: 'utc' } }));
    expect(result.status).toBe(200); const output = frames(result.body);
    expect(output[0]).toMatchObject({ type: 'chunk', fragments: [], facts: { status: 'refused' } });
    expect(output.at(-1)).toMatchObject({ type: 'end', status: 'refused' });
  });
  it('runs the synthetic all-ruler hour example and preserves native receipts without astronomical golden values', async () => {
    const rules = parseRuleSet(await readFile(new URL('../examples/synthetic-hours.yaml', import.meta.url), 'utf8'), 'yaml');
    const settings = { ...nativeControls, chunkMs: 3600000, maxChunkEvaluations: 1000, maxChunkSkySamples: 10000 };
    expect(() => parseHttpSearch(encode(rules, settings), policy)).not.toThrow();
    const result = await send(await host({}, nativeWorker), encode(rules, settings));
    expect(result.status).toBe(200); const output = frames(result.body);
    expect(output.at(-1)).toMatchObject({ type: 'end', status: 'complete', remaining: null });
    const chunk = output[0] as StreamChunk;
    expect(chunk.facts.eligible).toEqual([{ startMs: Date.parse(rules.range.start), endMs: Date.parse(rules.range.end) }]);
    expect(chunk.facts.receipts.length).toBeGreaterThan(0);
    expect(chunk.facts.receipts.every(r => r.engine.ephemeris.version === '2.1.19')).toBe(true);
    expect(chunk.fragments.every(f => f.receipts.length > 0 && !('internalScore' in f))).toBe(true);
  });
});
