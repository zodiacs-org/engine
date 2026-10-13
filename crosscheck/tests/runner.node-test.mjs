import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runShard, campaignIdentity } from '../lib/runner.mjs';
import { emptyStats, addResidual, mergeStats } from '../lib/statistics.mjs';
const config = { seed: 'invented-runner-test', startMs: 0, endMs: 100000, total: 31, shards: 3,
  channels: { test: 2 }, conventions: { test: 'invented arithmetic only' } };
const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { invented: 'v1' } };
const root = fileURLToPath(new URL('../runtime/', import.meta.url));
async function fixture(t) {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(root + 'runner-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const outcome = index => index % 5 === 0 ? { test: { verdict: 'unsupported' } } :
  { test: { verdict: index % 4 <= 2 ? 'pass' : 'fail', stats: addResidual(emptyStats(2), index % 4), retflags: 2 } };
const evaluate = async chart => outcome(chart.index);
test('interrupted shards resume exactly and cover each index once', async t => {
  const directory = await fixture(t);
  const seen = [];
  let merged = emptyStats(2);
  for (let shard = 0; shard < 3; shard++) {
    const args = { config, identities, directory, shard, evaluate: async c => { seen.push(c.index); return evaluate(c); } };
    const first = await runShard({ ...args, maxCases: 2, checkpointEvery: 1 });
    assert.equal(first.complete, false);
    const resumed = await runShard(args);
    const baseline = await runShard({ ...args, directory: directory + '/baseline', evaluate });
    assert.deepEqual(resumed.state, baseline.state);
    const again = await runShard(args);
    assert.deepEqual(again.state, resumed.state);
    merged = mergeStats(merged, resumed.state.channels.test.stats);
  }
  assert.deepEqual(seen.sort((a,b) => a-b), Array.from({ length: 31 }, (_, i) => i));
  assert.equal(merged.n, 24);
  assert.equal(merged.absSum, Array.from({ length: 31 }, (_, i) => i % 5 ? i % 4 : 0).reduce((a,b) => a+b));
});
test('exception rolls back unsaved cases and discards raw error', async t => {
  const directory = await fixture(t);
  const args = { config, identities, directory, shard: 0, checkpointEvery: 2 };
  await assert.rejects(runShard({ ...args, evaluate: async c => {
    if (c.index === 9) throw new Error('SECRET RAW POSITION'); return evaluate(c);
  } }), error => !error.message.includes('SECRET') && /discarded/.test(error.message));
  const saved = JSON.parse(await readFile(directory + '/shard-0.json'));
  assert.equal(saved.completed, 2);
  const seen = [];
  await runShard({ ...args, evaluate: async c => { seen.push(c.index); return evaluate(c); } });
  assert.equal(seen[0], 6);
});
test('configuration, build, tooling and reference changes refuse resume', async t => {
  const directory = await fixture(t);
  const args = { config, identities, directory, shard: 0, evaluate, maxCases: 1 };
  await runShard(args);
  for (const change of [{ config: { ...config, seed: 'changed' } },
    { identities: { ...identities, build: 'c'.repeat(64) } },
    { identities: { ...identities, tooling: 'c'.repeat(64) } },
    { identities: { ...identities, references: { invented: 'v2' } } }]) {
    await assert.rejects(runShard({ ...args, ...change }), /mismatch/);
  }
  assert.equal(campaignIdentity(config, identities).sha256,
    campaignIdentity({ ...config, channels: { test: 2 } }, identities).sha256);
});
test('reject raw payloads and corrupt progress; lock prevents simultaneous writers', async t => {
  const directory = await fixture(t);
  const args = { config, identities, directory, shard: 0, evaluate, maxCases: 1 };
  await assert.rejects(runShard({ ...args, evaluate: async () => ({ test: { verdict: 'error', output: 123 } }) }), /outcome/);
  await runShard(args);
  const path = directory + '/shard-0.json';
  const state = JSON.parse(await readFile(path)); state.completed++;
  await writeFile(path, JSON.stringify(state));
  await assert.rejects(runShard(args), /aggregates/);
  await mkdir(path + '.lock');
  await assert.rejects(runShard(args), { code: 'EEXIST' });
  await rm(path + '.lock', { recursive: true });
  await symlink(directory, directory + '/link');
  await assert.rejects(runShard({ ...args, directory: directory + '/link/child' }), /symlinks/);
});
test('large campaign processes only budget; abort and empty shards checkpoint cleanly', async t => {
  const directory = await fixture(t);
  const args = { config: { ...config, total: 5000000 }, identities, directory, shard: 0, evaluate, maxCases: 3 };
  const result = await runShard(args);
  assert.equal(result.state.completed, 3); assert.equal(result.complete, false);
  assert.ok((await readFile(directory + '/shard-0.json')).length < 2000);
  const controller = new AbortController(); controller.abort();
  assert.equal((await runShard({ ...args, signal: controller.signal })).state.completed, 3);
  const empty = await runShard({ ...args, config: { ...config, total: 0 }, directory: directory + '/empty' });
  assert.equal(empty.complete, true); assert.equal(empty.state.completed, 0);
});
test('merge fixes shard order and refuses duplicate, missing or incomplete shards', async t => {
  const { mergeShards, runnerToolingIdentity } = await import('../lib/runner.mjs');
  const directory = await fixture(t);
  const states = [];
  for (let shard = 0; shard < config.shards; shard++) {
    states.push((await runShard({ config, identities, directory, shard, evaluate })).state);
  }
  const campaign = campaignIdentity(config, identities);
  assert.deepEqual(mergeShards(campaign, states), mergeShards(campaign, [...states].reverse()));
  assert.equal(mergeShards(campaign, states).completed, config.total);
  assert.throws(() => mergeShards(campaign, states.slice(1)), /Missing/);
  assert.throws(() => mergeShards(campaign, [states[0], states[0], states[2]]), /mismatch/);
  const partial = await runShard({ config, identities, directory: directory + '/partial', shard: 0, evaluate, maxCases: 1 });
  assert.throws(() => mergeShards(campaign, [partial.state, ...states.slice(1)]), /Incomplete/);
  assert.match(await runnerToolingIdentity(), /^[a-f0-9]{64}$/);
});
