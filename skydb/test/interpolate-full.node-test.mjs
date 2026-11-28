import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig } from '../src/config.mjs';
import { TIME_BOUNDARIES } from '../src/generate.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { loadEngine } from '../src/engine.mjs';
import { openDatabase } from '../src/query.mjs';
import { generateDatabase } from '../src/store.mjs';
import { boundaryInstants, errorStatistics, isStoredSample, measureInterpolation,
  rowErrors, SAMPLE_COUNT, SAMPLE_SEED, stratifiedInstants } from '../benchmarks/interpolate-full.mjs';

const root = fileURLToPath(new URL('../generated/', import.meta.url));
const startMs = Date.parse('2001-01-01T00:00:00Z');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const planDigest = instants => digest(JSON.stringify(instants) + '\n');

async function temporary(t) {
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'interpolate-full-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('stratified sampling is reproducible, covers every stratum and excludes support samples', () => {
  const config = createConfig(), instants = stratifiedInstants(config);
  assert.equal(instants.length, SAMPLE_COUNT);
  assert.ok(instants.length >= 2_000);
  assert.deepEqual(stratifiedInstants(config), instants);
  assert.notDeepEqual(stratifiedInstants(config, SAMPLE_COUNT, SAMPLE_SEED + 1), instants);
  assert.equal(new Set(instants).size, instants.length);
  const span = BigInt(config.endMs - config.startMs), count = BigInt(instants.length);
  instants.forEach((atMs, index) => {
    assert.ok(Number.isSafeInteger(atMs));
    const left = config.startMs + Number(span * BigInt(index) / count);
    const right = config.startMs + Number(span * BigInt(index + 1) / count);
    assert.ok(atMs >= left && atMs < right);
    assert.equal(isStoredSample(config, atMs), false);
  });
  for (const count of [0, -1, 1.5, NaN, 100_001]) assert.throws(() => stratifiedInstants(config, count));
  for (const seed of [0, -1, 1.5, NaN, 2 ** 32]) assert.throws(() => stratifiedInstants(config, 10, seed));
  assert.throws(() => stratifiedInstants({ startMs, endMs: startMs + 3 }, 2), /short/);
  assert.throws(() => stratifiedInstants({ startMs, endMs: startMs + 10, stepMs: 1, tileMs: 10 }, 1), /no sampled interpolation/);
});

test('separate boundary probes respect half-open coverage, tile seams and clock splits', () => {
  const config = createConfig(), instants = boundaryInstants(config);
  assert.deepEqual(instants, [...new Set(instants)].sort((a, b) => a - b));
  assert.equal(instants[0], config.startMs);
  assert.equal(instants.at(-1), config.endMs - 1);
  for (const boundary of [config.startMs + config.tileMs, ...TIME_BOUNDARIES]) {
    for (const offset of [-1, 0, 1]) assert.ok(instants.includes(boundary + offset));
  }
  assert.ok(instants.every(at => at >= config.startMs && at < config.endMs));
  for (const boundary of TIME_BOUNDARIES) {
    assert.equal(isStoredSample(config, boundary - 1), true);
    assert.equal(isStoredSample(config, boundary), true);
    assert.equal(isStoredSample(config, boundary + 1), false);
  }
  const tiny = createConfig({ startMs, endMs: startMs + 1 });
  assert.deepEqual(boundaryInstants(tiny), [startMs]);
});

test('error reduction uses circular longitude, aligned finite rows and explicit numeric quantiles', () => {
  const row = (lon, lat = 0, speed = 0) => [{ body: 'Moon', lon, lat, speed }];
  assert.deepEqual(rowErrors(row(359.75, -2, -3), row(0.25, 1, 2), ['Moon']),
    [{ lon: 0.5, lat: 3, speed: 5 }]);
  assert.equal(rowErrors(row(0), row(180), ['Moon'])[0].lon, 180);
  assert.equal(rowErrors(row(180.25), row(0), ['Moon'])[0].lon, 179.75);
  assert.deepEqual(rowErrors(row(12), row(12), ['Moon']), [{ lon: 0, lat: 0, speed: 0 }]);
  assert.throws(() => rowErrors(row(1), row(2), ['Sun']), /body order/);
  assert.throws(() => rowErrors([], row(2), ['Moon']), /number/);
  for (const values of [row(NaN), row(360), row(-1), row(1, 91), row(1, 0, Infinity)]) {
    assert.throws(() => rowErrors(values, row(0), ['Moon']));
    assert.throws(() => rowErrors(row(0), values, ['Moon']));
  }
  const observations = values => values.map((error, atMs) => ({ error, atMs }));
  assert.deepEqual(errorStatistics(observations([1, 10, 2])),
    { count: 3, maximum: { error: 10, atMs: 1 }, p99: 10, median: 2 });
  assert.deepEqual(errorStatistics(observations([9, 1, 8, 3])),
    { count: 4, maximum: { error: 9, atMs: 0 }, p99: 9, median: 5.5 });
  assert.deepEqual(errorStatistics(observations([7])),
    { count: 1, maximum: { error: 7, atMs: 0 }, p99: 7, median: 7 });
  assert.equal(errorStatistics(observations(Array.from({ length: 100 }, (_, i) => 99 - i))).p99, 98);
  assert.equal(errorStatistics(observations([9, 1, 9])).maximum.atMs, 0);
  assert.throws(() => errorStatistics([]));
  for (const error of [NaN, Infinity, -1]) assert.throws(() => errorStatistics([{ error, atMs: 0 }]));
  assert.throws(() => errorStatistics([{ error: 0, atMs: 0.5 }]));
});

function checkReport(report) {
  assert.equal(report.version, 1);
  assert.equal(report.command, 'node skydb/benchmarks/interpolate-full.mjs');
  assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
  assert.match(report.runtime.node, /^v22\./);
  assert.ok(report.runtime.osRelease.length > 0 && report.runtime.memoryBytes > 0);
  assert.ok(Number.isFinite(Date.parse(report.startedAt)));
  assert.ok(Date.parse(report.finishedAt) >= Date.parse(report.startedAt));
  assert.ok(Number.isFinite(report.elapsedMs) && report.elapsedMs > 0);
  assert.match(report.measurement, /no independent astronomical accuracy or full-span bound/);
  assert.deepEqual(report.units, { lon: 'degrees, shortest circular difference', lat: 'degrees', speed: 'degrees/day' });
  const config = createConfig(report.manifest.value.config);
  const random = stratifiedInstants(config, report.sampling.count, report.sampling.seed);
  const boundaries = boundaryInstants(config);
  assert.equal(report.sampling.version, 1);
  assert.equal(report.sampling.randomSha256, planDigest(random));
  assert.equal(report.sampling.boundarySha256, planDigest(boundaries));
  assert.equal(report.sampling.firstRandomAtMs, random[0]);
  assert.equal(report.sampling.lastRandomAtMs, random.at(-1));
  assert.equal(report.sampling.boundaryCount, boundaries.length);
  assert.equal(report.results.random.exactSamples, 0);
  for (const [key, instants] of [['random', random], ['boundaries', boundaries]]) {
    const result = report.results[key];
    assert.equal(result.instants, instants.length);
    assert.equal(result.exactSamples, instants.filter(at => isStoredSample(config, at)).length);
    assert.equal(result.interpolatedInstants, instants.length - result.exactSamples);
    assert.deepEqual(Object.keys(result.errors), config.bodies);
    for (const fields of Object.values(result.errors)) for (const field of ['lon', 'lat', 'speed']) {
      const stats = fields[field];
      assert.equal(stats.count, instants.length);
      for (const value of [stats.maximum.error, stats.p99, stats.median]) {
        assert.ok(Number.isFinite(value) && value >= 0 && value <= stats.maximum.error);
      }
      assert.ok(stats.median <= stats.p99);
      assert.ok(instants.includes(stats.maximum.atMs));
    }
  }
}

test('full measurement matches independent error reduction on a short store and leaves files unchanged', async t => {
  const directory = await temporary(t);
  const boundary = TIME_BOUNDARIES.find(at => new Date(at).getUTCFullYear() === 2017);
  const config = createConfig({ startMs: boundary - 7_200_000, endMs: boundary + 7_200_001,
    stepMs: 3_600_000, tileMs: 3_600_000, bodies: ['Moon', 'Sun'] });
  await generateDatabase(directory, config, { layout: 'sharded' });
  const snapshot = async () => {
    const files = {};
    for (const name of await readdir(directory, { recursive: true, withFileTypes: true })) {
      if (name.isFile()) {
        const path = join(name.parentPath, name.name);
        files[path] = await readFile(path);
      }
    }
    return files;
  };
  const before = await snapshot();
  const report = await measureInterpolation(directory, { count: 32, seed: 12345 });
  checkReport(report);
  assert.deepEqual(report.manifest.value.config, config);
  assert.equal(report.manifest.sha256, digest(before[join(directory, 'manifest.json')]));
  assert.equal(report.manifest.bytes, before[join(directory, 'manifest.json')].length);
  assert.deepEqual(report.checkpoint, JSON.parse(before[join(directory, 'checkpoint.json')]));
  const database = await openDatabase(directory), engine = await loadEngine();
  for (const [key, instants] of [['random', stratifiedInstants(config, 32, 12345)], ['boundaries', boundaryInstants(config)]]) {
    const measured = [];
    for (const at of instants) measured.push({ at, rows: (await database.positions(at)).rows, direct: engine.sample(at, config) });
    for (const [index, body] of config.bodies.entries()) for (const field of ['lon', 'lat', 'speed']) {
      const entries = measured.map(({ at, rows, direct }) => {
        let error = Math.abs(rows[index][field] - direct[index][field]);
        if (field === 'lon' && error > 180) error = 360 - error;
        return { error, atMs: at };
      });
      const sorted = entries.map(value => value.error).sort((a, b) => a - b), n = entries.length;
      const stats = report.results[key].errors[body][field];
      assert.equal(stats.median, n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2);
      assert.equal(stats.p99, sorted[Math.ceil(n * 0.99) - 1]);
      assert.deepEqual(stats.maximum, entries.reduce((a, b) => b.error > a.error ? b : a));
    }
  }
  assert.deepEqual(await snapshot(), before);
});

test('interpolation measurement rejects incomplete, locked and corrupt stores', async t => {
  for (const failure of ['incomplete', 'locked', 'corrupt']) {
    const directory = await temporary(t);
    await generateDatabase(directory, createConfig({ startMs, endMs: startMs + 3_600_000,
      stepMs: 3_600_000, tileMs: 3_600_000, bodies: ['Sun'] }));
    if (failure === 'incomplete') {
      const path = join(directory, 'checkpoint.json'), checkpoint = JSON.parse(await readFile(path));
      await writeFile(path, JSON.stringify({ ...checkpoint, complete: false }));
    } else if (failure === 'locked') await writeFile(join(directory, '.lock'), 'existing writer');
    else await writeFile(join(directory, 'tile-00000000/positions.sky'), 'corrupt');
    await assert.rejects(measureInterpolation(directory, { count: 8 }), /incomplete|lock|checksum/);
  }
});

test('committed full interpolation report binds sampling, configuration and completed verification evidence', async () => {
  const report = JSON.parse(await readFile(new URL('../benchmarks/interpolate-full-output.json', import.meta.url)));
  const verified = JSON.parse(await readFile(new URL('../benchmarks/verify-full-output.json', import.meta.url)));
  checkReport(report);
  assert.equal(report.directory, 'skydb/generated/full');
  assert.deepEqual(report.manifest.value.config, createConfig());
  assert.deepEqual(report.manifest, verified.manifest);
  assert.deepEqual(report.checkpoint, verified.checkpoint);
  assert.equal(report.checkpoint.complete, true);
  assert.equal(report.sampling.count, SAMPLE_COUNT);
  assert.equal(report.sampling.seed, SAMPLE_SEED);
  assert.ok(report.results.random.interpolatedInstants >= 2_000);
  assert.ok(Date.parse(report.startedAt) >= Date.parse(verified.finishedAt));
  assert.equal(report.manifest.sha256, digest(JSON.stringify(report.manifest.value) + '\n'));
});
