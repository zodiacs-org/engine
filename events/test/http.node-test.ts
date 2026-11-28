import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEventServer, HTTP_LIMITS } from '../src/http.js';

async function service(deadlineMs?: number) {
  const server = createEventServer({ workerUrl: new URL('../src/http-worker.js', import.meta.url),
    ...(deadlineMs === undefined ? {} : { deadlineMs }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}/search` };
}
const payload = { query: 'all Sun ingresses from 2000-01-01 to 2000-01-02 clock tt',
  options: { stepMs: 3600000, maxEvaluations: 1000 } };
async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
test('HTTP searches return complete, budget and engine refusal envelopes', async t => {
  const { server, url } = await service(); t.after(() => server.close());
  const complete = await post(url, payload);
  assert.equal(complete.status, 200); assert.equal(complete.body.status, 'complete');
  assert.deepEqual(complete.body.events, []); assert.ok(complete.body.evaluations > 0);
  const budget = await post(url, { ...payload, options: { ...payload.options, maxEvaluations: 1 } });
  assert.equal(budget.status, 200); assert.equal(budget.body.reason, 'evaluation-budget'); assert.deepEqual(budget.body.events, []);
  const outside = await post(url, { ...payload, query: 'all Sun ingresses from 1700-01-01 to 1700-01-02 clock tt' });
  assert.equal(outside.body.reason, 'engine-refused');
});
test('HTTP dates use the independent JPL synthetic natal reference', async t => {
  const fixture = JSON.parse(readFileSync(new URL('../../references/horizons.json', import.meta.url), 'utf8'));
  const reference = fixture.events.find((e: any) => e.case.kind === 'fixed-aspect');
  const c = reference.case;
  const { server, url } = await service(); t.after(() => server.close());
  const r = await post(url, { query: `next ${c.body} square natal Sun from ${c.start} to ${c.end} clock tt`,
    options: { stepMs: 3600000, maxEvaluations: 10000, natalLongitudes: { Sun: c.natalLongitude } } });
  assert.equal(r.status, 200); assert.equal(r.body.status, 'complete');
  assert.ok(Math.abs(r.body.events[0].atMs-reference.atMs) <= c.toleranceMs);
});
test('HTTP station policy preserves the independently referenced paired-pass directions', async t => {
  const fixture = JSON.parse(readFileSync(new URL('../../references/loop-cases.json', import.meta.url), 'utf8')) as {
    cases: { body: string; start: string; end: string; targetDegrees: number;
      events: { direction: string }[] }[];
  };
  const { server, url } = await service(); t.after(() => server.close());
  for (const c of fixture.cases) {
    const query = `all ${c.body} conjunction natal Sun from ${c.start} to ${c.end} clock tt`;
    const options = { stepMs: 2*86400000, stationStepMs: 2*86400000,
      maxEvaluations: 10000, natalLongitudes: { Sun: c.targetDegrees } };
    const all = await post(url, { query, options });
    assert.equal(all.status, 200); assert.equal(all.body.status, 'complete');
    assert.deepEqual(all.body.events.map((e: { direction: string }) => e.direction), c.events.map(e => e.direction));
    // Discovery is checked here; the retained timing discrepancies are reported separately.
    const next = await post(url, { query: query.replace('all ', 'next '), options });
    assert.equal(next.status, 200); assert.deepEqual(next.body.events, all.body.events.slice(0, 1));
    const { stationStepMs: _stationStepMs, ...legacy } = options;
    const omitted = await post(url, { query, options: legacy });
    assert.equal(omitted.status, 200); assert.deepEqual(omitted.body.events, []);
    const budget = await post(url, { query, options: { ...options, maxEvaluations: 1 } });
    assert.equal(budget.status, 200); assert.equal(budget.body.reason, 'evaluation-budget');
    assert.deepEqual(budget.body.events, []);
  }
});
test('HTTP validates station steps and rejects that policy for eclipses', async t => {
  const { server, url } = await service(); t.after(() => server.close());
  for (const stationStepMs of [null, 0, -1, 0.5, payload.options.stepMs+1, Number.MAX_SAFE_INTEGER+1, '1000']) {
    const r = await post(url, { ...payload, options: { ...payload.options, stationStepMs } });
    assert.equal(r.status, 400); assert.deepEqual(r.body, { error: { code: 'invalid-request' } });
  }
  const eclipse = await post(url, { query: 'next lunar eclipses from 2000-01-01 to 2000-01-02 clock tt',
    options: { ...payload.options, stationStepMs: 1000,
      eclipse: { model: { sunRadiusAu: 2, moonRadiusAu: 0.2, earthRadiusAu: 1 }, derivativeStepMs: 1 } } });
  assert.equal(eclipse.status, 400); assert.deepEqual(eclipse.body, { error: { code: 'invalid-request' } });
});
test('HTTP rejects invalid transport, shapes and DSL without reflecting input', async t => {
  const { server, url } = await service(); t.after(() => server.close());
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url+'/other')).status, 404);
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 415);
  const broken = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(broken.status, 400);
  for (const value of [null, [], { ...payload, extra: true }, { ...payload, options: { ...payload.options, signal: {} } },
    { ...payload, options: { ...payload.options, maxEvaluations: HTTP_LIMITS.maxEvaluations+1 } },
    { ...payload, options: { ...payload.options, natalLongitudes: { private: 0 } } }]) {
    assert.equal((await post(url, value)).status, 400);
  }
  const syntax = await post(url, { ...payload, query: 'private-input' });
  assert.equal(syntax.status, 400); assert.equal(syntax.body.error.code, 'query-syntax');
  assert.ok(!JSON.stringify(syntax.body).includes('private-input'));
  const huge = await post(url, { ...payload, query: 'x'.repeat(HTTP_LIMITS.bodyBytes) });
  assert.equal(huge.status, 413);
});
test('admission covers incomplete uploads and deadline releases the slot', async t => {
  const { server, url } = await service(100); t.after(() => server.close());
  const slow = request(url, { method: 'POST', headers: { 'content-type': 'application/json' } });
  const response = new Promise<number>(resolve => slow.once('response', res => { res.resume(); resolve(res.statusCode!); }));
  slow.write('{');
  await new Promise(resolve => setTimeout(resolve, 20));
  const busy = await post(url, payload); assert.equal(busy.status, 503); assert.equal(busy.body.error.code, 'busy');
  assert.equal(await response, 408); slow.destroy();
  const invalid = await post(url, null); assert.equal(invalid.status, 400);
});
test('worker deadline interrupts a large synchronous search', async t => {
  const { server, url } = await service(50); t.after(() => server.close());
  const r = await post(url, { query: 'all Moon ingresses 1900-2100 clock tt',
    options: { stepMs: 1, maxEvaluations: HTTP_LIMITS.maxEvaluations } });
  assert.equal(r.status, 408); assert.deepEqual(r.body, { error: { code: 'deadline' } });
});
test('server limits and local worker configuration are validated', () => {
  for (const deadlineMs of [0, -1, NaN, HTTP_LIMITS.deadlineMs+1]) assert.throws(() => createEventServer({ deadlineMs }));
  assert.throws(() => createEventServer({ workerUrl: new URL('https://example.com/worker.js') }));
});

test('disconnecting an upload releases admission without a search result', async t => {
  const { server, url } = await service(); t.after(() => server.close());
  const slow = request(url, { method: 'POST', headers: { 'content-type': 'application/json' } });
  slow.on('error', () => {}); slow.write('{');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await post(url, null)).status, 503);
  slow.destroy();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await post(url, null)).status, 400);
});
test('oversized worker results and unexpected failures are structured and never partial', async t => {
  // Trusted local transport fixtures only, not astronomical expectations.
  const dir = await mkdtemp(fileURLToPath(new URL('./http-fixture-', import.meta.url)));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [source, status, code] of [
    [`import { parentPort } from 'node:worker_threads'; parentPort.postMessage({status:200,body:{events:['x'.repeat(${HTTP_LIMITS.responseBytes})]}});`, 413, 'response-limit'],
    ["throw new Error('private failure');", 500, 'internal-error']
  ] as const) {
    const file = `${dir}/worker.mjs`; await writeFile(file, source);
    const server = createEventServer({ workerUrl: pathToFileURL(file) });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const address = server.address(); assert.ok(address && typeof address !== 'string');
      const r = await post(`http://127.0.0.1:${address.port}/search`, payload);
      assert.equal(r.status, status); assert.deepEqual(r.body, { error: { code } });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  }
});
