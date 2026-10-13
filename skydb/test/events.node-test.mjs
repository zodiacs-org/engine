import assert from 'node:assert/strict';
import test from 'node:test';
import { refineRoot, scanEvents, generateEventTiles, signedAngle } from '../src/events.mjs';
import { TIME_BOUNDARIES } from '../src/generate.mjs';
const direct = await import('../node_modules/@zodiacs/engine/dist/index.js');
const startMs = Date.parse('2001-01-01T00:00:00Z');
const wrap = v => (v % 360 + 360) % 360;

test('root refinement bounds, endpoint roots and bad inputs', () => {
  assert.deepEqual(refineRoot(t => t - 3.25, 0, 10), { atMs: 3, bracket: [3,4], residual: -0.25 });
  assert.equal(refineRoot(t => t - 10, 0, 10).atMs, 10);
  assert.throws(() => refineRoot(() => 1, 0, 10), /bracketed/);
  assert.throws(() => refineRoot(() => NaN, 0, 10), /Nonfinite/);
  assert.throws(() => refineRoot(t => t, 0.5, 10), /Invalid/);
});

test('synthetic wraparound, all major aspects, stations and lunations', () => {
  const config = { startMs, endMs: startMs + 1000, stepMs: 100, tileMs: 1000, bodies: ['Moon','Sun'] };
  const events = scanEvents({ ...config, lastSampleMs: config.endMs }, config, at => {
    const t = at - startMs;
    return [{ body: 'Sun', lon: wrap(359 + t / 100), speed: 1 },
      { body: 'Moon', lon: wrap(359 + t / 100 + (t - 10) * 0.36), speed: t - 500 }];
  });
  assert.deepEqual([...new Set(events.filter(e => e.kind === 'aspect').map(e => e.angle))].sort((a,b) => a-b), [0,60,90,120,180]);
  assert.deepEqual(events.filter(e => e.kind === 'lunation').map(e => e.phase), ['new','full']);
  assert.equal(events.find(e => e.kind === 'station').atMs, startMs + 500);
  assert.ok(events.some(e => e.kind === 'ingress' && e.bodies[0] === 'Sun' && e.target === 0 && e.atMs === startMs + 100));
  assert.equal(new Set(events.map(e => JSON.stringify(e))).size, events.length);
});

test('half-open ownership, branch cut and input validation', () => {
  const config = { startMs, endMs: startMs + 100, stepMs: 100, tileMs: 100, bodies: ['Sun'] };
  const descriptor = { ...config, lastSampleMs: config.endMs };
  const events = scanEvents(descriptor, config, at => [{ body: 'Sun', lon: 29 + (at-startMs)/100, speed: 1 }]);
  assert.equal(events.length, 0);
  assert.throws(() => scanEvents(descriptor, config, () => []), /Invalid event sample/);
  assert.throws(() => scanEvents(descriptor, { ...config, stepMs: 7200000, tileMs: 7200000 }, () => []), /one hour/);
  assert.throws(() => scanEvents({ ...descriptor, lastSampleMs: startMs-1 }, config, () => []), /descriptor/);
});

test('direct engine residuals for a synthetic calendar window include every event kind', async () => {
  const config = { startMs, endMs: startMs + 40 * 86400000, bodies: ['Sun','Moon','Mercury'] };
  const kinds = new Set();
  for await (const tile of generateEventTiles(config)) for (const event of tile.events) {
    kinds.add(event.kind);
    assert.ok(event.atMs >= tile.startMs && event.atMs < tile.endMs);
    assert.ok(event.bracket[1] - event.bracket[0] <= 1);
    const rows = direct.positions(new Date(event.atMs));
    const a = rows.find(r => r.body === event.bodies[0]);
    const residual = event.kind === 'station' ? a.speed : event.kind === 'ingress' ? signedAngle(a.lon-event.target)
      : signedAngle(rows.find(r => r.body === event.bodies[1]).lon-a.lon-event.target);
    assert.equal(event.residual, residual);
    assert.ok(Math.abs(residual) < (event.kind === 'station' ? 1e-6 : 1e-5));
  }
  assert.deepEqual([...kinds].sort(), ['aspect','ingress','lunation','station']);
});

test('clock jumps are never root brackets', async () => {
  for (const at of TIME_BOUNDARIES) {
    const config = { startMs: at-2, endMs: at+2, stepMs: 1, tileMs: 4, bodies: ['Sun','Moon'] };
    for await (const tile of generateEventTiles(config)) for (const event of tile.events) {
      assert.ok(!(event.bracket[0] < at && event.bracket[1] >= at));
    }
  }
});

test('retrograde repeats, sampled touches and exact tile-start roots', () => {
  const config = { startMs, endMs: startMs+400, stepMs: 100, tileMs: 400, bodies: ['Mercury'] };
  const descriptor = { ...config, lastSampleMs: config.endMs };
  const repeated = scanEvents(descriptor, config, at => {
    const t = at-startMs;
    return [{ body: 'Mercury', lon: 30+(t-50)*(t-250)/10000, speed: (t-150)/100 }];
  }).filter(e => e.kind === 'ingress' && e.target === 30);
  assert.deepEqual(repeated.map(e => e.atMs-startMs), [50,250]);
  assert.deepEqual(repeated.map(e => e.direction), ['decreasing','increasing']);
  const touch = scanEvents(descriptor, config, at => [{ body: 'Mercury',
    lon: 30+(at-startMs-200)**2/10000, speed: 1 }]).filter(e => e.kind === 'ingress');
  assert.equal(touch.length, 1);
  assert.equal(touch[0].atMs, startMs+200);
  const initial = scanEvents(descriptor, config, at => [{ body: 'Mercury', lon: 30+(at-startMs)/100, speed: 1 }]);
  assert.equal(initial[0].atMs, startMs);
  assert.equal(scanEvents(descriptor, config, () => [{ body: 'Mercury', lon: 30, speed: 0 }]).length, 0);
  const seam = TIME_BOUNDARIES[0];
  assert.throws(() => scanEvents({ startMs: seam-1, endMs: seam+1, lastSampleMs: seam },
    { ...config, startMs: seam-1, endMs: seam+1 }, () => []), /descriptor/);
});
