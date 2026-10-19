import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { SwissChannel, openSwiss, verifyExternalPaths } from '../lib/swiss.mjs';
import { summarize, validateStats } from '../lib/statistics.mjs';

// Invented protocol peers only. No Swiss installation, output or expectations.
function peer(response, mode = '') {
  const script = `process.stdout.write('{"ready":true}\\n');
  process.stdin.on('data', () => { ${mode || `process.stdout.write(${JSON.stringify(JSON.stringify(response) + '\n')});`} });`;
  return new SwissChannel(spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'pipe'] }), 1000);
}
const args = { body: 'Mars', jdTT: 2451545, actual: { lon: 0, lat: 0 }, toleranceArcsec: 3600 };
const pairedArgs = { ...args, actual: { lon: 1, lat: -1 }, reference: { lon: 358, lat: -2 },
  toleranceArcsec: 7200, quantiles: true };

test('external paths and explicit installation required', async () => {
  await assert.rejects(verifyExternalPaths([new URL('../', import.meta.url).pathname]), /outside/);
  await assert.rejects(openSwiss(), /external/);
  await assert.rejects(openSwiss({ ephemerisPath: '/tmp', python: '/no-such-python' }), /raw diagnostics discarded/);
});

test('invented position responses retain only aggregate residuals and flags', async () => {
  const channel = peer({ id: 'position', output: { lon: 359, lat: 1 }, meta: { retflags: 2, unwanted: 'not retained' } });
  try {
    await channel.read();
    const r = await channel.comparePosition(args);
    assert.equal(r.verdict, 'pass'); assert.equal(r.stats.lon.mean, 3600); assert.equal(r.stats.lat.mean, -3600);
    assert.equal(r.stats.lon.version, 1); assert.equal(r.stats.lat.version, 1);
    assert.deepEqual(Object.keys(r).sort(), ['retflags', 'stats', 'verdict']);
    assert(!JSON.stringify(r).includes('output'));
    const fail = await channel.comparePosition({ ...args, toleranceArcsec: 0 });
    assert.equal(fail.verdict, 'fail');
  } finally { channel.close(); }
});

test('one invented response supplies signed engine/Swiss and Swiss/JPL quantile aggregates', async () => {
  const channel = peer({ id: 'position', output: { lon: 359, lat: 2, unretained: 'private position marker' },
    meta: { retflags: 258, unretained: 'private metadata marker' } });
  const requests = [], write = channel.child.stdin.write.bind(channel.child.stdin);
  channel.child.stdin.write = (...values) => { requests.push(JSON.parse(values[0])); return write(...values); };
  try {
    await channel.read();
    const result = await channel.comparePositionPair(pairedArgs);
    assert.deepEqual(requests, [{ id: 'position', kind: 'position.apparent.ecliptic-true-of-date',
      input: { body: pairedArgs.body, jd_tt: pairedArgs.jdTT } }]);
    assert.equal(result.verdict, 'fail'); assert.equal(result.retflags, 258);
    assert.deepEqual(Object.keys(result).sort(), ['retflags', 'stats', 'verdict']);
    assert.deepEqual(Object.keys(result.stats).sort(), ['engineSwiss', 'swissJpl']);
    for (const [name, expected] of [['engineSwiss', { lon: 7200, lat: -10800 }],
      ['swissJpl', { lon: 3600, lat: 14400 }]]) {
      assert.deepEqual(Object.keys(result.stats[name]).sort(), ['lat', 'lon']);
      for (const axis of ['lon', 'lat']) {
        const stats = validateStats(result.stats[name][axis]);
        assert.equal(stats.n, 1); assert.equal(stats.version, 2); assert.equal(stats.mean, expected[axis]);
        assert.equal(stats.maxAbs, Math.abs(expected[axis]));
        assert.equal(stats.passed, Number(Math.abs(expected[axis]) <= pairedArgs.toleranceArcsec));
        for (const percentile of ['median', 'p99', 'p999']) {
          const interval = summarize(stats).absoluteQuantiles[percentile];
          assert.equal(interval.rank, 1);
          assert.ok(interval.lower <= Math.abs(expected[axis]) && interval.upper >= Math.abs(expected[axis]));
        }
      }
    }
    assert(!JSON.stringify(result).includes('private')); assert(!JSON.stringify(result).includes('output'));
  } finally { channel.close(); }
});

test('paired longitude residuals wrap in both directions and quantiles stay optional', async () => {
  const channel = peer({ id: 'position', output: { lon: 1, lat: 0 }, meta: { retflags: 2 } });
  try {
    await channel.read();
    const result = await channel.comparePositionPair({ ...pairedArgs, actual: { lon: 359, lat: 0 },
      reference: { lon: 2, lat: 0 }, quantiles: false });
    assert.equal(result.verdict, 'pass');
    assert.equal(result.stats.engineSwiss.lon.mean, -7200); assert.equal(result.stats.swissJpl.lon.mean, -3600);
    assert.equal(result.stats.engineSwiss.lon.version, 1); assert.equal(result.stats.swissJpl.lon.version, 1);
    const legacy = await channel.comparePosition({ ...args, quantiles: true });
    assert.equal(legacy.stats.lon.version, 2); validateStats(legacy.stats.lon);
    validateStats(legacy.stats.lat);
  } finally { channel.close(); }
});

for (const [name, response, expected] of [
  ['fallback', { output: { lon: 123, lat: 4 }, meta: { retflags: 4 } }, { verdict: 'fallback', retflags: 4 }],
  ['error', { error: 'private raw position marker 123.456' }, { verdict: 'error' }],
  ['unsupported', { unsupported: 'private diagnostic marker' }, { verdict: 'unsupported' }]
]) test(`discards ${name} values and messages`, async () => {
  const channel = peer({ id: 'position', ...response });
  try {
    await channel.read(); assert.deepEqual(await channel.comparePosition(args), expected);
    assert.deepEqual(await channel.comparePositionPair(pairedArgs), expected);
  }
  finally { channel.close(); }
});

test('invalid response poisons transport without leaking diagnostics', async () => {
  const channel = peer({ id: 'wrong', output: { lon: 123.456 } });
  try { await channel.read(); await assert.rejects(channel.comparePosition(args), /raw diagnostics discarded/); }
  finally { channel.close(); }
});

for (const mode of [
  'process.stdout.write("raw secret diagnostic\\n");',
  'process.stdout.write("x".repeat(70000));',
  'process.exit(1);',
  '/* silence */'
]) test('malformed, oversized, exited or stalled peer fails closed', async () => {
  const channel = peer(null, mode);
  try { await channel.read(); await assert.rejects(channel.comparePosition(args), /raw diagnostics discarded/); }
  finally { channel.close(); }
});

test('rejects concurrent requests and invalid caller inputs', async () => {
  const channel = peer(null, 'setTimeout(() => process.stdout.write(JSON.stringify({id:"position", error:"discard"}) + "\\n"), 50);');
  try {
    await channel.read();
    await assert.rejects(channel.comparePosition({ ...args, body: 'unsupported' }), /Invalid/);
    await assert.rejects(channel.comparePosition({ ...args, toleranceArcsec: -1 }), /tolerance/);
    const first = channel.comparePosition(args);
    await assert.rejects(channel.comparePosition(args), /one request/);
    assert.deepEqual(await first, { verdict: 'error' });
  } finally { channel.close(); }
});

test('paired comparison rejects invalid inputs before requesting or retaining instrument values', async () => {
  const channel = peer({ id: 'position', output: { lon: 359, lat: 2 }, meta: { retflags: 2 } });
  const requests = [], write = channel.child.stdin.write.bind(channel.child.stdin);
  channel.child.stdin.write = (...values) => { requests.push(values[0]); return write(...values); };
  try {
    await channel.read();
    for (const change of [{ reference: undefined }, { reference: { lon: 360, lat: 0 } },
      { reference: { lon: 0, lat: -91 } }, { reference: { lon: NaN, lat: 0 } },
      { actual: { lon: -1, lat: 0 } }, { actual: { lon: 0, lat: Infinity } },
      { jdTT: Infinity }, { body: 'unretained marker' }, { toleranceArcsec: -1 }, { quantiles: 'yes' }]) {
      await assert.rejects(channel.comparePositionPair({ ...pairedArgs, ...change }), error =>
        error instanceof RangeError && !error.message.includes('unretained marker'));
    }
    assert.deepEqual(requests, []);
    assert.equal((await channel.comparePositionPair(pairedArgs)).verdict, 'fail');
    assert.equal(requests.length, 1);
  } finally { channel.close(); }
});

test('paired and legacy comparisons share the single-request guard', async () => {
  const channel = peer(null, 'setTimeout(() => process.stdout.write(JSON.stringify({id:"position", error:"discard"}) + "\\n"), 50);');
  try {
    await channel.read();
    const first = channel.comparePositionPair(pairedArgs);
    await assert.rejects(channel.comparePositionPair(pairedArgs), /one request/);
    await assert.rejects(channel.comparePosition(args), /one request/);
    assert.deepEqual(await first, { verdict: 'error' });
  } finally { channel.close(); }
});

for (const response of [
  { id: 'position', output: { lon: 360, lat: 0 }, meta: { retflags: 2 } },
  { id: 'position', output: { lon: 0, lat: -91 }, meta: { retflags: 2 } },
  { id: 'position', output: { lon: 0, lat: 0 }, meta: { retflags: 'private marker' } },
  { id: 'wrong', output: { lon: 12.345, lat: 0 }, meta: { retflags: 2 } }
]) test('invalid paired response fails closed without leaking raw values', async () => {
  const channel = peer(response);
  try {
    await channel.read();
    await assert.rejects(channel.comparePositionPair(pairedArgs), error =>
      error.message === 'Swiss instrument unavailable or invalid; raw diagnostics discarded.');
    await assert.rejects(channel.comparePosition(args), /raw diagnostics discarded/);
  } finally { channel.close(); }
});
