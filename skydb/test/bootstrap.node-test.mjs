import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createConfig, COVERAGE, BODIES } from '../src/config.mjs';
import { verifyEngineArchive, verifyArchiveBytes, requireNode22 } from '../src/identity.mjs';
import { loadEngine } from '../src/engine.mjs';

test('archive pin matches carried bytes and rejects corruption', async () => {
  const identity = await verifyEngineArchive();
  const bytes = await readFile(new URL(`../../artifacts/${identity.archive}`, import.meta.url));
  bytes[bytes.length - 1] ^= 1;
  assert.throws(() => verifyArchiveBytes(bytes), /identity mismatch/);
  assert.throws(() => verifyArchiveBytes(bytes.subarray(1)), /identity mismatch/);
});

test('Node runtime gate excludes unsupported series and early Node 22', () => {
  for (const version of ['20.19.2', '22.6.0', '24.0.0']) assert.throws(() => requireNode22(version));
  requireNode22('22.7.0');
  requireNode22();
});

test('defaults and custom configuration have immutable copied body lists', () => {
  const config = createConfig();
  assert.equal(config.startMs, Date.parse('1800-01-01T00:00:00Z'));
  assert.equal(config.endMs, Date.parse('2200-01-01T00:00:00Z'));
  assert.equal(config.stepMs, 3_600_000);
  assert.equal(config.tileMs, 86_400_000);
  assert.equal(config.timeScale, 'utc');
  assert.deepEqual(config.bodies, BODIES);
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.bodies));
  const bodies = ['Moon', 'Sun'];
  const custom = createConfig({ bodies, startMs: 0, endMs: 86_400_000 });
  bodies[0] = 'Mars';
  assert.deepEqual(custom.bodies, ['Moon', 'Sun']);
});

test('configuration rejects malformed values and unsupported conventions', () => {
  for (const input of [null, [], { extra: 1 }, { toString: 1 }, { startMs: NaN },
    { endMs: COVERAGE.endMs + 1 }, { startMs: COVERAGE.startMs - 1 },
    { startMs: 1, endMs: 1 }, { stepMs: 0 }, { stepMs: 0.5 }, { tileMs: -1 },
    { stepMs: 7 }, { timeScale: 'tt' }, { bodies: [] }, { bodies: null },
    { bodies: ['Sun', 'Sun'] }, { bodies: ['North Node'] }, { bodies: new Array(1) },
    { endMs: undefined }, { bodies: 'Sun' }]) assert.throws(() => createConfig(input), RangeError);
});

test('isolated consumer samples agree exactly with direct engine calls', async () => {
  const consumer = await loadEngine();
  const direct = await import('../node_modules/@zodiacs/engine/dist/index.js');
  for (const at of [COVERAGE.startMs, 0, Date.parse('2001-06-15T12:34:56Z'), COVERAGE.endMs - 1]) {
    const expected = direct.positions(new Date(at)).filter(row => BODIES.includes(row.body))
      .map(({ body, lon, lat, speed }) => ({ body, lon, lat, speed }));
    assert.deepEqual(consumer.sample(at), expected);
  }
  assert.deepEqual(consumer.sample(0, { bodies: ['Pluto', 'Sun'] }).map(row => row.body), ['Pluto', 'Sun']);
  for (const at of [NaN, 0.5, COVERAGE.startMs - 1, COVERAGE.endMs]) assert.throws(() => consumer.sample(at), RangeError);
  assert.throws(() => consumer.sample(0, { startMs: 1, endMs: 2 }), RangeError);
});
