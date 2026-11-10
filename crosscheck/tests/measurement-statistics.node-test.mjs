import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { emptyStats, addResidual, mergeStats, summarize, validateStats } from '../lib/statistics.mjs';
import { runShard, mergeShards, campaignIdentity, validateCheckpoint } from '../lib/runner.mjs';
import { renderReport } from '../lib/report.mjs';
import { observation } from '../lib/campaign.mjs';

const collect = (values, quantiles = true) => values.reduce(addResidual, emptyStats(2, { quantiles }));
const root = fileURLToPath(new URL('../runtime/', import.meta.url));

test('versioned statistics retain exact moments and maxima alongside absolute quantile intervals', () => {
  const values = Array.from({ length: 2001 }, (_, i) => (i % 2 ? -1 : 1) * (i % 37) / 16);
  const modern = collect(values), old = collect(values, false);
  const { absoluteQuantiles, ...moments } = summarize(modern);
  assert.deepEqual(moments, summarize(old));
  assert(!Object.hasOwn(summarize(old), 'absoluteQuantiles'));
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  for (const [key, numerator, denominator] of [['median', 1, 2], ['p99', 99, 100], ['p999', 999, 1000]]) {
    const q = absoluteQuantiles[key];
    const rank = Math.ceil(values.length * numerator / denominator);
    assert.equal(q.rank, rank);
    assert(q.lower <= sorted[rank - 1] && sorted[rank - 1] <= q.upper);
  }
  const saved = JSON.parse(JSON.stringify(collect(values.slice(0, 1000))));
  assert.deepEqual(values.slice(1000).reduce(addResidual, saved), modern);
  const shards = Array.from({ length: 3 }, (_, s) => collect(values.filter((_, i) => i % 3 === s)));
  assert.deepEqual(shards.reduce(mergeStats, emptyStats(2, { quantiles: true })).absoluteHistogram, modern.absoluteHistogram);
  assert.deepEqual(shards.reverse().reduce(mergeStats, emptyStats(2, { quantiles: true })).absoluteHistogram, modern.absoluteHistogram);
  assert.throws(() => mergeStats(modern, old), /version mismatch/);
  assert.throws(() => validateStats({ ...modern, absoluteHistogram: { ...modern.absoluteHistogram, values: values.slice(0, 2) } }));
  assert.throws(() => validateStats({ ...modern, n: modern.n + 1 }));
  assert.throws(() => validateStats({ ...modern, maxAbs: modern.maxAbs * 2 }));
  const copy = mergeStats(emptyStats(2, { quantiles: true }), modern);
  copy.absoluteHistogram.bins[0][1]++;
  assert.notDeepEqual(copy.absoluteHistogram, modern.absoluteHistogram);
  for (const key of ['median', 'p99', 'p999']) assert.equal(summarize(emptyStats(2, { quantiles: true })).absoluteQuantiles[key], null);
});

test('quantile checkpoints resume exactly, bind versions and produce unit-labelled aggregate reports', async t => {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(root + 'measurement-statistics-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { seed: 'invented-quantile-runner', startMs: 0, endMs: 1000, total: 12, shards: 3,
    channels: { angle: 2, distance: 1, missing: 2, legacy: 2 }, quantiles: ['angle', 'distance', 'missing'],
    conventions: { reference: 'invented arithmetic; angle arcseconds; distance km' } };
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { arithmetic: 'invented, not physical evidence' } };
  const evaluate = async sample => ({ angle: observation(sample.index - 5, 2, { quantiles: true }),
    distance: sample.index % 3 === 0 ? { verdict: 'fallback' } : observation((sample.index - 4) / 4, 1, { quantiles: true }),
    missing: { verdict: 'unsupported' }, legacy: observation(0, 2) });
  const states = [];
  for (let shard = 0; shard < config.shards; shard++) {
    const args = { config, identities, directory, shard, evaluate };
    await runShard({ ...args, maxCases: 1 });
    const result = await runShard(args);
    const baseline = await runShard({ ...args, directory: directory + '/baseline' });
    assert.deepEqual(result.state, baseline.state);
    states.push(result.state);
  }
  const campaign = campaignIdentity(config, identities);
  const merged = mergeShards(campaign, states);
  assert.deepEqual(merged, mergeShards(campaign, [...states].reverse()));
  assert.equal(merged.channels.distance.stats.n, 8);
  assert.equal(merged.channels.distance.verdicts.fallback, 4);
  assert.equal(merged.channels.angle.stats.maxAbs, 6);
  assert.equal(merged.channels.distance.stats.maxAbs, 1.75);
  const bundle = { campaign, states, metadata: { title: 'Invented quantile report', command: ['node', 'invented'],
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    units: { angle: 'arcseconds', distance: 'km', missing: 'arcseconds', legacy: 'arcseconds' },
    exclusions: ['Arithmetic only; no physical comparisons'] } };
  const output = renderReport(bundle);
  const report = JSON.parse(output.json);
  assert.equal(report.schema, 'crosscheck-report/2');
  assert.equal(report.channels.distance.unit, 'km');
  assert.equal(report.channels.distance.statistics.absoluteQuantiles.p999.upper, 1.75);
  assert.equal(report.channels.missing.statistics.absoluteQuantiles.median, null);
  assert.equal(report.channels.missing.statistics.maxAbs, null);
  assert(!Object.hasOwn(report.channels.legacy.statistics, 'absoluteQuantiles'));
  assert.match(output.csv.split('\n')[0], /median_rank,median_lower,median_upper,p99_rank,p99_lower,p99_upper,p999_rank,p999_lower,p999_upper,quantile_method/);
  assert.match(output.markdown, /p99\.9 absolute interval/);
  assert.match(output.markdown, /no relative-width guarantee/);
  assert.match(output.markdown, /\| distance \| km \|/);
  assert.deepEqual(output, renderReport(JSON.parse(JSON.stringify(bundle))));
  for (const quantiles of [[], ['missing', 'angle'], ['angle', 'angle'], ['unknown'], 'angle']) {
    assert.throws(() => campaignIdentity({ ...config, quantiles }, identities), /quantile channels/);
  }
  const changed = structuredClone(states[0]);
  changed.channels.angle.stats = collect([-5, -2, 1, 4], false);
  assert.throws(() => validateCheckpoint(changed, campaign, 0), /aggregates/);
  const path = directory + '/shard-0.json';
  const original = await readFile(path, 'utf8');
  await writeFile(path, JSON.stringify(changed));
  await assert.rejects(runShard({ config, identities, directory, shard: 0, evaluate }), /aggregates/);
  await writeFile(path, original);
  await assert.rejects(runShard({ config: { ...config, quantiles: ['angle'] }, identities, directory, shard: 0, evaluate }), /mismatch/);
  await assert.rejects(runShard({ config, identities, directory: directory + '/wrong-version', shard: 0,
    evaluate: async sample => ({ ...await evaluate(sample), angle: observation(0, 2) }) }), /version mismatch/);
});
