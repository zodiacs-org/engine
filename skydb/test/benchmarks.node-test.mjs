import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { maximum } from '../benchmarks/common.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { BODIES, createConfig } from '../src/config.mjs';
import { TIME_BOUNDARIES } from '../src/generate.mjs';
test('measurement maxima retain the actual worst instant and reject invalid errors', () => {
  const first = maximum(undefined, 2, 10);
  assert.deepEqual(maximum(first, 3, 20), { error: 3, atMs: 20 });
  assert.equal(maximum(first, 1, 20), first);
  for (const value of [NaN, Infinity, -1]) assert.throws(() => maximum(first, value, 20));
});
test('committed benchmark evidence pins runtime, scope, finite measurements and engine identity', async () => {
  const read = async name => JSON.parse(await readFile(new URL(`../benchmarks/${name}-output.json`, import.meta.url), 'utf8'));
  const agreement = await read('agreement'), performance = await read('performance');
  for (const report of [agreement, performance]) {
    assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
    assert.match(report.runtime.node, /^v22\./);
  }
  assert.equal(agreement.windows.length, 6 + TIME_BOUNDARIES.length);
  for (const window of agreement.windows) {
    assert.deepEqual(window.config, createConfig(window.config));
    assert.ok(window.exactSamples > 0 && window.interpolatedInstants > 0);
    assert.deepEqual(Object.keys(window.errors), BODIES);
    for (const errors of Object.values(window.errors)) for (const field of ['lon', 'lat', 'speed']) {
      assert.ok(Number.isFinite(errors[field].error) && errors[field].error >= 0);
      assert.ok(errors[field].atMs >= window.config.startMs && errors[field].atMs < window.config.endMs);
    }
  }
  assert.deepEqual(performance.config, createConfig(performance.config));
  for (const field of ['generationMs', 'verifiedResumeMs', 'openMs']) assert.ok(performance.results[field] > 0);
  assert.ok(performance.results.storage.bytes > 0);
  assert.equal(performance.results.cache.size, 2);
  assert.equal(performance.results.verification.tiles, 2);
});
