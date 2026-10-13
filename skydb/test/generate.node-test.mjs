import assert from 'node:assert/strict';
import test from 'node:test';
import { COVERAGE } from '../src/config.mjs';
import { planPositionTiles, generatePositionTiles, TIME_BOUNDARIES } from '../src/generate.mjs';
import { decodePositionTile } from '../src/tile.mjs';

const direct = await import('../node_modules/@zodiacs/engine/dist/index.js');
const start = Date.parse('2001-06-15T00:00:00Z');

test('planner is lazy, contiguous, clips partial tiles and rejects oversized sampling', () => {
  const config = { startMs: start, endMs: start + 25, stepMs: 2, tileMs: 10 };
  assert.deepEqual([...planPositionTiles(config)].map(d => [d.index,d.startMs-start,d.endMs-start,d.lastSampleMs-start]),
    [[0,0,10,10],[1,10,20,20],[2,20,25,25]]);
  assert.equal(planPositionTiles().next().value.startMs, COVERAGE.startMs);
  assert.throws(() => planPositionTiles({ stepMs: 1 }).next(), /capacity/);
  assert.throws(() => planPositionTiles({ bodies: ['node'] }).next(), RangeError);
});

test('boundary list matches clock regime changes in the pinned engine', () => {
  for (const at of TIME_BOUNDARIES) {
    const before = direct.natalChart({ utc: new Date(at - 1) });
    const after = direct.natalChart({ utc: new Date(at) });
    const piece = c => [c.deltaT.model, c.deltaT.segment, c.timeScale.leapSeconds?.taiMinusUtc];
    if (at === TIME_BOUNDARIES[0]) {
      assert.ok(before.deltaT.seconds - after.deltaT.seconds > 0.01);
      const moon = c => c.bodies.find(row => row.body === 'Moon').lon;
      assert.ok(moon(after) < moon(before));
    } else assert.notDeepEqual(piece(before), piece(after), new Date(at).toISOString());
  }
  assert.equal(TIME_BOUNDARIES.at(-1), Date.parse('2027-10-02T00:00:00Z') + 1);
});

test('all generated and decoded rows agree exactly with direct positions', async () => {
  const ranges = [COVERAGE.startMs, start, COVERAGE.endMs - 20,
    ...TIME_BOUNDARIES.map(at => at - 10)];
  for (const startMs of ranges) {
    const config = { startMs, endMs: startMs + 20, stepMs: 4, tileMs: 12, bodies: ['Moon', 'Pluto', 'Sun'] };
    let previousEnd = startMs;
    for await (const generated of generatePositionTiles(config)) {
      const tile = decodePositionTile(generated.bytes);
      assert.equal(tile.metadata.startMs, previousEnd);
      previousEnd = tile.metadata.endMs;
      assert.equal(tile.samples[0].atMs, generated.startMs);
      assert.equal(tile.samples.at(-1).atMs, generated.lastSampleMs);
      assert.ok(!TIME_BOUNDARIES.some(at => at > generated.startMs && at <= generated.lastSampleMs));
      for (const sample of tile.samples) {
        const expected = direct.positions(new Date(sample.atMs));
        assert.deepEqual(sample.rows, config.bodies.map(body => {
          const { lon, lat, speed } = expected.find(row => row.body === body);
          return { body, lon, lat, speed };
        }));
      }
    }
    assert.equal(previousEnd, config.endMs);
  }
});

test('seams at tile edges and one-millisecond tiles keep the correct side', async () => {
  for (const at of [start, TIME_BOUNDARIES[0], TIME_BOUNDARIES.at(-1), COVERAGE.endMs]) {
    for await (const generated of generatePositionTiles({ startMs: at - 2, endMs: at,
      stepMs: 1, tileMs: 1, bodies: ['Sun'] })) {
      const tile = decodePositionTile(generated.bytes);
      assert.equal(tile.samples[0].atMs, generated.startMs);
      assert.equal(tile.samples.at(-1).atMs, generated.lastSampleMs);
      assert.ok(tile.samples.length >= 1);
    }
  }
});

test('default body set and cadence produce shared smooth endpoints and a clipped final sample', async () => {
  const config = { startMs: start, endMs: start + 90_000_001 };
  const tiles = [];
  for await (const generated of generatePositionTiles(config)) tiles.push(decodePositionTile(generated.bytes));
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].samples.length, 25);
  assert.equal(tiles[1].samples.length, 3);
  assert.deepEqual(tiles[0].samples.at(-1), tiles[1].samples[0]);
  for (const tile of tiles) for (const sample of tile.samples) {
    const expected = direct.positions(new Date(sample.atMs));
    assert.deepEqual(sample.rows, expected.filter(row => tile.metadata.bodies.includes(row.body))
      .map(({ body, lon, lat, speed }) => ({ body, lon, lat, speed })));
  }
});
