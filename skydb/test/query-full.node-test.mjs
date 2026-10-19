import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createConfig } from '../src/config.mjs';
import { planPositionTiles, TIME_BOUNDARIES } from '../src/generate.mjs';
import { ENGINE_IDENTITY } from '../src/identity.mjs';
import { descriptorAt, openDatabase } from '../src/query.mjs';
import { generateDatabase } from '../src/store.mjs';
import { isStoredSample, SAMPLE_SEED } from '../benchmarks/interpolate-full.mjs';
import { latencyStatistics, measureQueries, QUERY_DEFAULTS, queryPlan } from '../benchmarks/query-full.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const generatedRoot = fileURLToPath(new URL('../generated/', import.meta.url));
const startMs = Date.parse('2001-01-01T00:00:00Z'), hour = 3_600_000, day = 24 * hour;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const planDigest = value => digest(JSON.stringify(value) + '\n');

async function temporary(t) {
  await mkdir(generatedRoot, { recursive: true });
  const directory = await mkdtemp(join(generatedRoot, 'query-full-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function snapshot(directory) {
  const files = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[relative(directory, path)] = await readFile(path);
    }
  }
  return files;
}

test('query workloads reproduce stratified interpolation positions and bounded event ranges across coverage', () => {
  const config = createConfig(), plan = queryPlan(config);
  assert.deepEqual(queryPlan(config), plan);
  assert.equal(plan.positions.length, QUERY_DEFAULTS.positionCount);
  assert.equal(new Set(plan.positions).size, plan.positions.length);
  const span = BigInt(config.endMs - config.startMs), count = BigInt(plan.positions.length);
  plan.positions.forEach((atMs, index) => {
    const left = config.startMs + Number(span * BigInt(index) / count);
    const right = config.startMs + Number(span * BigInt(index + 1) / count);
    assert.ok(Number.isSafeInteger(atMs) && atMs >= left && atMs < right);
    assert.equal(isStoredSample(config, atMs), false);
  });
  const changedSeed = queryPlan(config, { seed: SAMPLE_SEED + 1 });
  assert.notDeepEqual(changedSeed.positions, plan.positions);
  assert.deepEqual(changedSeed.events, plan.events);
  assert.deepEqual(plan.events.map(value => value.name),
    ['day', 'month', 'year', 'moonIngressMonth', 'mercuryStationYear', 'fullSpan']);
  const requested = [day, 30 * day, 365 * day, 30 * day, 365 * day];
  for (const [index, cohort] of plan.events.entries()) {
    assert.equal(cohort.requestedDurationMs, requested[index] ?? Number(span));
    assert.equal(cohort.durationMs, cohort.requestedDurationMs);
    assert.equal(cohort.ranges.length, cohort.name === 'fullSpan' ? 1 : QUERY_DEFAULTS.eventCount);
    for (const [rangeIndex, range] of cohort.ranges.entries()) {
      assert.ok(Number.isSafeInteger(range.startMs) && Number.isSafeInteger(range.endMs));
      assert.ok(range.startMs >= config.startMs && range.endMs <= config.endMs);
      assert.equal(range.endMs - range.startMs, cohort.durationMs);
      if (cohort.name !== 'fullSpan') {
        const width = span - BigInt(cohort.durationMs) + 1n;
        const offset = BigInt(range.startMs - config.startMs), denominator = 2n * BigInt(cohort.ranges.length);
        const numerator = width * BigInt(2 * rangeIndex + 1);
        assert.ok(offset * denominator <= numerator && (offset + 1n) * denominator > numerator);
      }
    }
  }
  assert.deepEqual(plan.events[3].filter, { kind: 'ingress', body: 'Moon' });
  assert.deepEqual(plan.events[4].filter, { kind: 'station', body: 'Mercury' });
  assert.deepEqual(plan.events.at(-1).ranges, [{ startMs: config.startMs, endMs: config.endMs }]);
});

test('short-store plans clip durations, honor clock splits and omit unavailable body filters', () => {
  const boundary = TIME_BOUNDARIES.find(at => new Date(at).getUTCFullYear() === 2017);
  const config = createConfig({ startMs: boundary - hour, endMs: boundary + hour,
    tileMs: hour, stepMs: hour, bodies: ['Sun'] });
  const plan = queryPlan(config, { positionCount: 8, eventCount: 3 });
  assert.deepEqual(plan.events.map(value => value.name), ['day', 'month', 'year', 'fullSpan']);
  assert.ok(plan.positions.some(at => at < boundary) && plan.positions.some(at => at > boundary));
  for (const at of plan.positions) assert.equal(isStoredSample(config, at), false);
  for (const cohort of plan.events) {
    assert.equal(cohort.durationMs, 2 * hour);
    for (const range of cohort.ranges) assert.deepEqual(range,
      { startMs: config.startMs, endMs: config.endMs });
  }
  for (const options of [null, [], { typo: 1 }, { positionCount: 0 }, { positionCount: 10_001 },
    { positionCount: 1.5 }, { eventCount: 65 }, { eventCount: NaN }, { warmRepeats: 0 },
    { warmRepeats: 65 }, { cacheTiles: 0 }, { cacheTiles: 65 }, { seed: 0 }, { seed: 2 ** 32 }]) {
    assert.throws(() => queryPlan(config, options), /Invalid/);
  }
});

test('latency summaries independently enforce total, middle-pair median and nearest-rank quantiles', () => {
  const values = Array.from({ length: 100 }, (_, index) => 99 - index);
  assert.deepEqual(latencyStatistics(values), { count: 100, totalMs: 4950, minimumMs: 0,
    medianMs: 49.5, p95Ms: 94, p99Ms: 98, maximumMs: 99 });
  assert.equal(values[0], 99);
  assert.deepEqual(latencyStatistics([9, 1, 4]), { count: 3, totalMs: 14, minimumMs: 1,
    medianMs: 4, p95Ms: 9, p99Ms: 9, maximumMs: 9 });
  assert.deepEqual(latencyStatistics([0]), { count: 1, totalMs: 0, minimumMs: 0,
    medianMs: 0, p95Ms: 0, p99Ms: 0, maximumMs: 0 });
  for (const values of [[], null, {}, [NaN], [Infinity], [-1], ['1']]) {
    assert.throws(() => latencyStatistics(values), /Invalid latency/);
  }
});

function checkLatency(statistics, count) {
  assert.equal(statistics.count, count);
  for (const field of ['totalMs', 'minimumMs', 'medianMs', 'p95Ms', 'p99Ms', 'maximumMs']) {
    assert.ok(Number.isFinite(statistics[field]) && statistics[field] >= 0, field);
  }
  assert.ok(statistics.minimumMs <= statistics.medianMs && statistics.medianMs <= statistics.p95Ms);
  assert.ok(statistics.p95Ms <= statistics.p99Ms && statistics.p99Ms <= statistics.maximumMs);
  assert.ok(statistics.totalMs >= statistics.maximumMs);
}

function checkReport(report) {
  assert.equal(report.version, 1);
  assert.equal(report.command, 'node skydb/benchmarks/query-full.mjs');
  assert.deepEqual(report.runtime.engine, ENGINE_IDENTITY);
  assert.match(report.runtime.node, /^v22\./);
  assert.ok(report.runtime.osRelease.length > 0 && report.runtime.memoryBytes > 0);
  assert.ok(Number.isSafeInteger(report.runtime.availableParallelism) && report.runtime.availableParallelism > 0);
  assert.ok(Number.isFinite(Date.parse(report.startedAt)));
  assert.ok(Date.parse(report.finishedAt) >= Date.parse(report.startedAt));
  assert.ok(Number.isFinite(report.elapsedMs) && report.elapsedMs > 0);
  for (const value of Object.values(report.cpu)) assert.ok(Number.isFinite(value) && value >= 0);
  assert.match(report.measurement, /filesystem cache, host load and garbage collection uncontrolled/);
  assert.match(report.method.positions, /cold is one empty application-cache lookup/);
  assert.match(report.method.memory, /process-lifetime/);
  const policy = Object.fromEntries(Object.keys(QUERY_DEFAULTS).map(key => [key, report.workload[key]]));
  const config = createConfig(report.manifest.value.config), plan = queryPlan(config, policy);
  assert.equal(report.manifest.sha256, digest(JSON.stringify(report.manifest.value) + '\n'));
  assert.equal(report.manifest.bytes, Buffer.byteLength(JSON.stringify(report.manifest.value) + '\n'));
  assert.equal(report.checkpoint.manifestSha256, report.manifest.sha256);
  assert.equal(report.checkpoint.complete, true);
  assert.equal(report.workload.planSha256, planDigest(plan));
  assert.equal(report.workload.positionSha256, planDigest(plan.positions));
  assert.equal(report.workload.firstPositionAtMs, plan.positions[0]);
  assert.equal(report.workload.lastPositionAtMs, plan.positions.at(-1));
  assert.deepEqual(report.workload.eventPlan, plan.events);
  checkLatency(report.positionQueries.opening, policy.positionCount);
  checkLatency(report.positionQueries.cold, policy.positionCount);
  checkLatency(report.positionQueries.warm, policy.positionCount * policy.warmRepeats);
  assert.equal(report.positionQueries.maximumCacheSize, 1);
  assert.equal(report.positionQueries.resultSha256.cold, report.positionQueries.resultSha256.warm);
  assert.match(report.positionQueries.resultSha256.cold, /^[a-f0-9]{64}$/);
  assert.equal(report.eventQueries.length, plan.events.length);
  for (const [index, cohort] of plan.events.entries()) {
    const result = report.eventQueries[index];
    for (const key of ['name', 'requestedDurationMs', 'durationMs', 'filter']) {
      assert.deepEqual(result[key], cohort[key]);
    }
    assert.equal(result.ranges, cohort.ranges.length);
    checkLatency(result.opening, cohort.ranges.length);
    checkLatency(result.latency, cohort.ranges.length);
    for (const key of ['events', 'minimumEvents', 'maximumEvents', 'scannedTiles', 'maximumCacheSize']) {
      assert.ok(Number.isSafeInteger(result[key]) && result[key] >= 0);
    }
    assert.ok(result.minimumEvents <= result.maximumEvents && result.maximumEvents <= result.events);
    assert.equal(Object.values(result.countsByKind).reduce((a, b) => a + b, 0), result.events);
    const scans = cohort.ranges.map(({ startMs, endMs }) =>
      descriptorAt(config, endMs - 1).index - descriptorAt(config, startMs).index + 1);
    assert.equal(result.scannedTiles, scans.reduce((a, b) => a + b, 0));
    assert.equal(result.maximumCacheSize, Math.min(Math.max(...scans), policy.cacheTiles));
    assert.match(result.resultSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(report.memory.unit, 'bytes');
  for (const field of ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers']) {
    for (const snapshot of ['baseline', 'final', 'sampledMaximum']) {
      assert.ok(Number.isSafeInteger(report.memory[snapshot][field]) && report.memory[snapshot][field] >= 0);
    }
    assert.ok(report.memory.sampledMaximum[field] >= report.memory.baseline[field]);
    assert.ok(report.memory.sampledMaximum[field] >= report.memory.final[field]);
  }
  assert.ok(Number.isSafeInteger(report.memory.processLifetimeMaxRssBytes) && report.memory.processLifetimeMaxRssBytes > 0);
  const ranges = plan.events.reduce((sum, cohort) => sum + cohort.ranges.length, 0);
  assert.ok(report.memory.observations >= 2 + policy.positionCount * (2 + policy.warmRepeats) + 2 * ranges);
  return plan;
}

test('query measurement fully consumes stored events, binds results and leaves short sharded stores unchanged', async t => {
  const directory = await temporary(t);
  const config = createConfig({ startMs, endMs: startMs + 3 * day, stepMs: hour, tileMs: day,
    bodies: ['Sun', 'Moon', 'Mercury'] });
  await generateDatabase(directory, config, { layout: 'sharded' });
  const before = await snapshot(directory);
  const report = await measureQueries(directory, { positionCount: 8, warmRepeats: 2, eventCount: 2 });
  const plan = checkReport(report);
  assert.equal(report.directory, relative(repoRoot, directory));
  assert.deepEqual(report.manifest.value.config, config);
  assert.equal(report.manifest.sha256, digest(before['manifest.json']));
  assert.deepEqual(report.checkpoint, JSON.parse(before['checkpoint.json']));
  const storedEvents = Object.entries(before).filter(([name]) => name.endsWith('/events.json.gz'))
    .flatMap(([, bytes]) => JSON.parse(gunzipSync(bytes)).events)
    .sort((a, b) => a.atMs - b.atMs);
  assert.ok(storedEvents.length > 0);
  for (const [index, cohort] of plan.events.entries()) {
    const hash = createHash('sha256'), counts = [], countsByKind = {};
    for (const { startMs, endMs } of cohort.ranges) {
      hash.update(JSON.stringify({ startMs, endMs, filter: cohort.filter }) + '\n');
      const selected = storedEvents.filter(event => event.atMs >= startMs && event.atMs < endMs &&
        (!cohort.filter.kind || event.kind === cohort.filter.kind) &&
        (!cohort.filter.body || event.bodies.includes(cohort.filter.body)));
      counts.push(selected.length);
      for (const event of selected) {
        hash.update(JSON.stringify(event) + '\n');
        countsByKind[event.kind] = (countsByKind[event.kind] ?? 0) + 1;
      }
    }
    const result = report.eventQueries[index];
    assert.equal(result.events, counts.reduce((a, b) => a + b, 0));
    assert.equal(result.minimumEvents, Math.min(...counts));
    assert.equal(result.maximumEvents, Math.max(...counts));
    assert.deepEqual(result.countsByKind, countsByKind);
    assert.equal(result.resultSha256, hash.digest('hex'));
    const overlapping = cohort.ranges.reduce((sum, range) => sum + [...planPositionTiles(config)]
      .filter(tile => tile.startMs < range.endMs && tile.endMs > range.startMs).length, 0);
    assert.equal(result.scannedTiles, overlapping);
  }
  const database = await openDatabase(directory, { cacheTiles: 1 }), hash = createHash('sha256');
  for (const atMs of plan.positions) hash.update(JSON.stringify(await database.positions(atMs)) + '\n');
  assert.equal(report.positionQueries.resultSha256.cold, hash.digest('hex'));
  assert.equal(report.eventQueries.at(-1).events, storedEvents.length);
  assert.deepEqual(await snapshot(directory), before);
});

test('query measurement rejects invalid options and incomplete, locked or corrupt accessed stores', async t => {
  for (const options of [null, { unexpected: true }, { positionCount: 0 }, { warmRepeats: -1 },
    { eventCount: Infinity }, { cacheTiles: 65 }]) {
    await assert.rejects(measureQueries(join(generatedRoot, 'does-not-exist'), options), /Invalid/);
  }
  for (const failure of ['incomplete', 'locked', 'corrupt']) {
    const directory = await temporary(t);
    const config = createConfig({ startMs, endMs: startMs + hour, tileMs: hour, stepMs: hour, bodies: ['Sun'] });
    await generateDatabase(directory, config, { layout: 'sharded' });
    if (failure === 'incomplete') {
      const path = join(directory, 'checkpoint.json'), checkpoint = JSON.parse(await readFile(path));
      await writeFile(path, JSON.stringify({ ...checkpoint, complete: false }) + '\n');
    } else if (failure === 'locked') await writeFile(join(directory, '.lock'), 'existing writer');
    else {
      const files = await snapshot(directory), path = Object.keys(files).find(name => name.endsWith('/positions.sky'));
      await writeFile(join(directory, path), 'corrupt');
    }
    const before = await snapshot(directory);
    await assert.rejects(measureQueries(directory, { positionCount: 8, warmRepeats: 2, eventCount: 2 }),
      /incomplete|checkpoint|writer|lock|checksum/i);
    assert.deepEqual(await snapshot(directory), before);
  }
});

test('committed query benchmark binds full coverage, workload and event totals to verification evidence', async () => {
  const report = JSON.parse(await readFile(new URL('../benchmarks/query-full-output.json', import.meta.url)));
  const verified = JSON.parse(await readFile(new URL('../benchmarks/verify-full-output.json', import.meta.url)));
  checkReport(report);
  assert.equal(report.directory, 'skydb/generated/full');
  assert.deepEqual(report.manifest.value.config, createConfig());
  assert.deepEqual(report.manifest, verified.manifest);
  assert.deepEqual(report.checkpoint, verified.checkpoint);
  for (const [key, value] of Object.entries(QUERY_DEFAULTS)) assert.equal(report.workload[key], value);
  const full = report.eventQueries.find(value => value.name === 'fullSpan');
  assert.equal(full.events, verified.verification.summary.events);
  assert.equal(full.scannedTiles, verified.verification.summary.tiles);
  assert.equal(full.ranges, 1);
  assert.ok(Date.parse(report.startedAt) >= Date.parse(verified.finishedAt));
});
