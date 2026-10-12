import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { executeCampaign, validateSpec, readRuntimeJson, withSwiss, swissChannels } from '../tools/campaign.mjs';
import { observation, TARGETS } from '../lib/campaign.mjs';
import { renderReport } from '../lib/report.mjs';
import { MAX_FILE_BYTES } from '../tools/check.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { invented: 'arithmetic' } };
const spec = { name: 'operations-test', kernel: 'de440s', seed: 'invented', total: 37, shards: 4 };
const config = { seed: spec.seed, total: spec.total, shards: spec.shards, startMs: 0, endMs: 10000,
  channels: { arithmetic: 2 }, conventions: { invented: 'no astronomical data' } };
async function fixture(t) {
  await mkdir(project + 'runtime', { recursive: true });
  const directory = await mkdtemp(project + 'runtime/operations-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('operational interrupted distributed run matches fresh report bytes and exact coverage', async t => {
  const directory = await fixture(t), seen = [];
  const evaluate = async chart => { seen.push(chart.index); return { arithmetic: observation(chart.index % 5 - 2, 2) }; };
  const args = { spec, config, identities, directory, evaluate };
  assert.equal((await executeCampaign({ ...args, maxCases: 1 })).complete, false);
  const controller = new AbortController(); controller.abort();
  await executeCampaign({ ...args, signal: controller.signal });
  for (let shard = 3; shard >= 0; shard--) await executeCampaign({ ...args, shard });
  const done = await executeCampaign(args);
  assert.equal(done.complete, true);
  assert.deepEqual(seen.sort((a,b) => a-b), Array.from({ length: spec.total }, (_, i) => i));
  const fresh = await executeCampaign({ ...args, directory: directory + '/fresh' });
  const states = async dir => Promise.all(Array.from({ length: spec.shards }, (_, i) => readRuntimeJson(`${dir}/shard-${i}.json`)));
  const metadata = { title: 'Invented operational validation', command: ['node', 'invented'],
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    units: { arithmetic: 'invented units' }, exclusions: ['No astronomical reference used'] };
  const actual = renderReport({ campaign: done.campaign, states: await states(directory), metadata });
  assert.deepEqual(actual, renderReport({ campaign: fresh.campaign, states: await states(directory + '/fresh'), metadata }));
  assert.equal(JSON.parse(actual.json).completed, spec.total);
  await assert.rejects(executeCampaign({ ...args, identities: { ...identities, tooling: 'c'.repeat(64) } }), /mismatch/);
  await assert.rejects(executeCampaign({ ...args, shard: 4 }), /shard/);
});
test('million-case driver stops at per-shard budget without enumerating campaign', async t => {
  const directory = await fixture(t);
  const large = { ...spec, total: 2000000 };
  const seen = [];
  const result = await executeCampaign({ spec: large, config: { ...config, total: large.total }, identities,
    directory, shard: 3, maxCases: 2, evaluate: async chart => {
      seen.push(chart.index); return { arithmetic: observation(0, 2) };
    } });
  assert.equal(result.complete, false); assert.deepEqual(seen, [3, 7]);
  assert.ok((await readFile(directory + '/shard-3.json')).length < MAX_FILE_BYTES);
});
test('Swiss operational wrapper retains axis aggregates and excluded verdicts only', async () => {
  const natalChart = () => ({ bodies: Object.keys(TARGETS).map(body => ({ body, lon: 0, lat: 0 })) });
  const swiss = { comparePosition: async ({ body, jdTT }) => {
    assert.equal(jdTT, 2451545);
    if (body === 'Moon') return { verdict: 'fallback', retflags: 4 };
    return { verdict: 'fail', retflags: 2, stats: { lon: observation(-61, 60).stats, lat: observation(1, 60).stats } };
  } };
  const result = await withSwiss(async () => ({}), natalChart, swiss)({ utc: '2000-01-01T12:00:00Z' });
  assert.deepEqual(Object.keys(result).sort(), Object.keys(swissChannels()).sort());
  assert.equal(result['Swiss.Sun.lon'].verdict, 'fail'); assert.equal(result['Swiss.Sun.lat'].verdict, 'pass');
  assert.deepEqual(result['Swiss.Moon.lon'], { verdict: 'fallback', retflags: 4 });
  assert(!JSON.stringify(result).includes('actual'));
});
test('specification rejects unknown fields, unsafe names, excessive shards and invalid counts', () => {
  assert.deepEqual(validateSpec(spec), spec);
  for (const change of [{ name: '../escape' }, { name: null }, { total: Infinity }, { shards: 65 }, { seed: 'personal data' },
    { kernel: 'arbitrary-url' }, { raw: 123 }]) assert.throws(() => validateSpec({ ...spec, ...change }));
});
test('runtime input rejects malformed JSON, oversized files, symlinks and outside paths', async t => {
  const directory = await fixture(t), path = directory + '/spec.json';
  await writeFile(path, JSON.stringify(spec));
  assert.deepEqual(await readRuntimeJson(path), spec);
  await symlink(path, directory + '/link.json');
  await assert.rejects(readRuntimeJson(directory + '/link.json'), /symlink/);
  await assert.rejects(readRuntimeJson(project + 'PLAN.md'), /below/);
  await writeFile(path, 'RAW INVALID JSON');
  await assert.rejects(readRuntimeJson(path), error => /discarded/.test(error.message) && !error.message.includes('RAW INVALID'));
  await writeFile(path, Buffer.alloc(MAX_FILE_BYTES));
  await assert.rejects(readRuntimeJson(path), /size/);
});
