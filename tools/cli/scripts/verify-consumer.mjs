import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const cwd = resolve(process.argv[2]);
const packageRoot = resolve(cwd, 'node_modules/@zodiacs/cli');
const cli = resolve(packageRoot, 'bin/zodiacs.mjs');
const guard = resolve(process.argv[3]);
const baseline = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const sourceAdapter = resolve(process.argv[5]);
const { readSuite, judge } = await import(pathToFileURL(resolve(process.argv[6])));
const vectors = readSuite().flatMap((level) => level.file.vectors);
const { calc, chart, events } = await import(pathToFileURL(resolve(cwd, 'node_modules/@zodiacs/engine/dist/calc.js')));
const normalized = (value) => JSON.parse(JSON.stringify(value));
const tests = [];
function check(name, fn) { fn(); tests.push({ name, passed: true }); }
function run(command, input, format = 'json', args = []) {
  const child = spawnSync(process.execPath, [cli, command, '--format', format, ...args], {
    cwd, encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input),
    timeout: 180_000,
    env: { ...process.env, NODE_OPTIONS: '--import=' + pathToFileURL(guard).href },
    maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  assert.ifError(child.error);
  return child;
}
const syntheticChart = {
  time: '2000-01-01T12:00:00Z',
  place: { latitude: 40, longitude: -75 }, houseSystem: 'whole',
};
const positionRequests = [
  { body: 'Sun', time: '2000-01-01T12:00:00Z' },
  { body: 'Moon', time: { jd: 2451545, scale: 'tt' }, flags: { units: 'radians' } },
];
const crossing = {
  kind: 'longitude-crossing', body: 'Sun', longitude: 0,
  from: '2000-03-01T00:00:00Z', to: '2000-04-01T00:00:00Z', maxSamples: 20_000,
};
for (const [command, request, expected] of [
  ['chart', syntheticChart, normalized(chart(syntheticChart))],
  ['positions', positionRequests, normalized(positionRequests.map(calc))],
  ['events', crossing, normalized(events(crossing))],
]) {
  const output = run(command, request);
  const record = JSON.parse(output.stdout);
  check(command + ' uses installed engine with no network', () => {
    assert.equal(output.status, 0);
    assert.equal(output.stderr, '');
    assert.deepEqual(record.result, expected);
    assert.equal(record.engineVersion, '1.0.0-rc.2');
  });
  check(command + ' receipt replays', () => {
    const verified = run('verify', record);
    assert.equal(verified.status, 0);
    assert.equal(JSON.parse(verified.stdout).result.status, 'verified');
    assert.equal(verified.stderr, '');
  });
  const tampered = structuredClone(record);
  if (command === 'chart') tampered.result.chart.bodies[0].lon += 0.001;
  else if (command === 'positions') tampered.result[0].lon += 0.001;
  else tampered.result.events[0].at = '2000-03-01T00:00:00.000Z';
  check(command + ' changed number refuses verification', () => {
    const result = run('verify', tampered);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'zodiacs: verification-mismatch\n');
  });
  check(command + ' text keeps receipt', () => {
    const result = run(command, request, 'text');
    assert.equal(result.status, 0); assert.match(result.stdout, /Receipt: /);
  });
  check(command + ' SVG contains full escaped receipt', () => {
    const result = run(command, request, 'svg');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^<svg /);
    assert.match(result.stdout, /<metadata>/);
    assert.match(result.stdout, /zodiacs.calc-receipt.v1/);
    assert.doesNotMatch(result.stdout, /<script/i);
  });
}
check('required offline guard blocks a deliberate network call', () => {
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href,
    '--input-type=module', '-e',
    "try { await fetch('https://example.invalid/'); process.exit(1); } catch { process.exit(0); }"],
    { encoding: 'utf8', cwd, timeout: 10_000 });
  assert.ifError(result.error); assert.equal(result.status, 0);
});
check('file input with spaces works', () => {
  const path = resolve(cwd, 'synthetic request.json');
  writeFileSync(path, JSON.stringify(syntheticChart));
  const result = run('chart', undefined, 'json', ['--input', path]);
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout).result, normalized(chart(syntheticChart)));
});
check('invalid input never leaks input in stderr', () => {
  const result = run('chart', { time: 'PRIVATE_SENTINEL_7b3d', place: { latitude: 40, longitude: -75 } });
  assert.equal(result.status, 2); assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'zodiacs: calculation-failed\n');
});
check('oversize input is refused', () => {
  const result = run('chart', { time: 'x'.repeat(1_048_577) });
  assert.equal(result.status, 2); assert.equal(result.stderr, 'zodiacs: input-size-limit\n');
});
check('unsupported physics is a typed nonzero result', () => {
  const result = run('positions', { body: 'Sun', time: '2000-01-01T12:00:00Z', flags: { deflection: true } });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).result[0].status, 'refused');
});
check('unknown option is refused without echo', () => {
  const result = run('chart', syntheticChart, 'json', ['--PRIVATE_SENTINEL_7b3d', 'x']);
  assert.equal(result.status, 2); assert.equal(result.stderr, 'zodiacs: invalid-options\n');
});
check('position request count is bounded', () => {
  const result = run('positions', Array.from({ length: 129 }, () => positionRequests[0]));
  assert.equal(result.status, 2); assert.equal(result.stderr, 'zodiacs: invalid-input\n');
});
check('event budget is bounded', () => {
  const result = run('events', { ...crossing, maxSamples: 20_001 });
  assert.equal(result.status, 2); assert.equal(result.stderr, 'zodiacs: invalid-input\n');
});
check('unknown record version is refused', () => {
  const record = JSON.parse(run('chart', syntheticChart).stdout);
  record.engineVersion = '999.0.0';
  assert.equal(run('verify', record).status, 2);
});
const full = run('conformance', undefined);
const conformance = JSON.parse(full.stdout).result;
check('conformance computes every original vector offline', () => {
  assert.equal(full.status, 1); assert.equal(full.stderr, '');
  assert.equal(conformance.summary.total.count, baseline.results.length);
  assert.deepEqual(conformance.vectors, baseline.vectors);
  assert.equal(conformance.results.length, baseline.results.length);
  const original = spawnSync(process.execPath, [sourceAdapter], {
    cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
    input: vectors.map(({ id, kind, input }) => JSON.stringify({ id, kind, input })).join('\n') + '\n',
    env: { ...process.env, ZODIACS_ENGINE_DIST: resolve(cwd, 'node_modules/@zodiacs/engine/dist'),
      NODE_OPTIONS: '--import=' + pathToFileURL(guard).href },
  });
  assert.ifError(original.error); assert.equal(original.status, 0);
  assert.equal(original.stderr, '');
  const replies = original.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(replies.length, vectors.length + 1);
  assert.equal(replies[0].adapter.engineVersion, '1.0.0-rc.2');
  for (let i = 0; i < baseline.results.length; i++) {
    assert.equal(conformance.results[i].id, baseline.results[i].id);
    assert.equal(conformance.results[i].verdict, judge(vectors[i], replies[i + 1]).verdict);
    if (process.versions.node === '22.22.2') {
      assert.equal(conformance.results[i].verdict, baseline.results[i].verdict);
    }
  }
  assert.equal(conformance.summary.total.error, 0);
  assert.ok(conformance.summary.total.fail > 0);
  assert.ok(conformance.summary.total.unsupported > 0);
});
check('tampered installed suite fails without a value leak', () => {
  const path = resolve(packageRoot, 'conformance/vectors/L1-positions.json');
  const original = readFileSync(path);
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from(' ')]));
    const result = run('conformance', undefined);
    assert.equal(result.status, 2); assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'zodiacs: calculation-failed\n');
  } finally { writeFileSync(path, original); }
});
const report = {
  schema: 'zodiacs.offline-cli-consumer.v1',
  producer: { source: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID, node: process.version,
    os: process.platform, architecture: process.arch },
  privatePackage: true, publication: 'not-performed',
  checks: tests, conformance: {
    summary: conformance.summary, vectors: conformance.vectors,
    baselineRuntime: '22.22.2',
    differencesFromPinnedBaseline: conformance.results.filter((row, i) => row.verdict !== baseline.results[i].verdict).map(({ id, verdict }) => ({ id, verdict })),
    comparison: 'All runtimes match the original adapter on this installed archive; Node 22.22.2 also matches the committed baseline.',
    verdictsSha256: createHash('sha256').update(JSON.stringify(conformance.results.map(({ id, verdict }) => ({ id, verdict })))).digest('hex'),
  },
  limitations: ['Source/packed regression and interoperability checks, not a new accuracy claim',
    'Failed and unsupported independent conformance tolerances remain unchanged',
    'SVG is a text receipt, not a natal wheel; no registry publication or private clearance'],
};
writeFileSync(resolve(cwd, 'cli-consumer-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log('CLI consumer: ' + tests.length + ' checks passed; conformance ' + JSON.stringify(conformance.summary.total));
console.log('PROGRAMME_FILE ' + JSON.stringify({
  path: 'docs/evidence/offline-cli-20261009/' + process.platform + '-node' + process.versions.node.split('.')[0] + '.json',
  size: Buffer.byteLength(JSON.stringify(report, null, 2) + '\n'),
  sha256: createHash('sha256').update(JSON.stringify(report, null, 2) + '\n').digest('hex'),
  base64: Buffer.from(JSON.stringify(report, null, 2) + '\n').toString('base64'),
}));
