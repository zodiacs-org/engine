/*
 * Tests of the atlas tools on an invented jurisdiction (fixture/), so
 * that the resolver and the checks are exercised independently of the
 * historical data.
 *
 *   node --test atlas/tools/selftest.mjs
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkAtlas } from './check.mjs';
import { buildTimeline, formatOffset, loadAtlas, offsetMs, parseLocal, resolve, resolveWall, wallAt } from './lib.mjs';
import { validate } from './schema.mjs';
import { readJson, SCHEMA_PATH } from './lib.mjs';

const FIXTURE = join(fileURLToPath(new URL('.', import.meta.url)), 'fixture');
const load = () => loadAtlas(FIXTURE);
const utc = (text) => Date.parse(text);

test('local mean time is 240 s per degree east, to the millisecond', () => {
  assert.equal(offsetMs({ type: 'local-mean-time' }, { longitude: 7.5 }), 1_800_000);
  assert.equal(offsetMs({ type: 'local-mean-time' }, { longitude: -74.00597 }), -17_761_433);
  assert.equal(formatOffset(-17_761_433), '-4:56:01.433');
  assert.equal(offsetMs({ type: 'fixed', seconds: 561 }, {}), 561_000);
  assert.throws(() => offsetMs({ type: 'local-mean-time' }, {}), /longitude/);
});

test('boundaries resolve on the clock their reckoning names', () => {
  const atlas = load();
  const [lmt, standard, summer, after] = buildTimeline(atlas, atlas.places.get('test-east'));
  // 12:00 on the new clock (+1:00) is 11:00 UTC.
  assert.equal(lmt.endMs, utc('1880-06-01T11:00:00Z'));
  assert.equal(standard.startMs, lmt.endMs);
  // 02:00 on the clock before (+1:00) is 01:00 UTC.
  assert.equal(summer.startMs, utc('1890-03-30T01:00:00Z'));
  // 03:00 on the summer clock (+2:00) is 01:00 UTC.
  assert.equal(summer.endMs, utc('1890-10-26T01:00:00Z'));
  assert.equal(after.startMs, summer.endMs);
  // The coverage edges read 1870-01-01T00:00 and 1920-01-01T00:00 locally.
  assert.equal(lmt.startMs + lmt.offsetMs, parseLocal('1870-01-01T00:00:00'));
  assert.equal(after.endMs + after.offsetMs, parseLocal('1920-01-01T00:00:00'));
  const railway = buildTimeline(atlas, atlas.places.get('test-east'), 'railway');
  assert.equal(railway[0].endMs, utc('1880-06-01T11:00:00Z'));
});

test('an ordinary reading resolves to one instant', () => {
  const atlas = load();
  const result = resolve(atlas, 'test-east', '1885-01-01T12:00:00');
  assert.equal(result.status, 'ok');
  assert.equal(result.instants.length, 1);
  assert.equal(result.instants[0].utc, '1885-01-01T11:00:00Z');
  assert.equal(result.instants[0].rule, 'test-standard-1');
  assert.equal(result.instants[0].uncertainty.flag, 'documented');
});

test('local mean time differs by place', () => {
  const atlas = load();
  assert.equal(resolve(atlas, 'test-east', '1875-01-01T12:00:00').instants[0].utc, '1875-01-01T11:30:00Z');
  assert.equal(resolve(atlas, 'test-west', '1875-01-01T12:00:00').instants[0].utc, '1875-01-01T12:18:00Z');
  const adHoc = resolve(atlas, { jurisdiction: 'test-land', longitude: 15 }, '1875-01-01T12:00:00');
  assert.equal(adHoc.instants[0].utc, '1875-01-01T11:00:00Z');
  assert.equal(adHoc.instants[0].uncertainty.flag, 'inferred');
});

test('a skipped reading is nonexistent and taken on the earlier clock', () => {
  const atlas = load();
  // East: local mean time +0:30 until 11:00 UTC, then +1:00; 11:30-12:00 never happened.
  const east = resolve(atlas, 'test-east', '1880-06-01T11:45:00');
  assert.equal(east.status, 'nonexistent');
  assert.deepEqual(east.skipped, { from: '1880-06-01T11:30:00', to: '1880-06-01T12:00:00' });
  assert.equal(east.instants[0].utc, '1880-06-01T11:15:00Z');
  // West (-0:18): 10:42-12:00 never happened.
  const west = resolve(atlas, 'test-west', '1880-06-01T11:00:00');
  assert.equal(west.status, 'nonexistent');
  assert.deepEqual(west.skipped, { from: '1880-06-01T10:42:00', to: '1880-06-01T12:00:00' });
  assert.equal(resolve(atlas, 'test-west', '1880-06-01T10:41:59').status, 'ok');
  assert.equal(resolve(atlas, 'test-west', '1880-06-01T12:00:00').status, 'ok');
  // Spring forward.
  const spring = resolve(atlas, 'test-east', '1890-03-30T02:30:00');
  assert.equal(spring.status, 'nonexistent');
  assert.equal(spring.instants[0].utc, '1890-03-30T01:30:00Z');
});

test('a repeated reading is ambiguous, earliest first', () => {
  const atlas = load();
  const result = resolve(atlas, 'test-east', '1890-10-26T02:30:00');
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.instants.map((instant) => instant.utc), ['1890-10-26T00:30:00Z', '1890-10-26T01:30:00Z']);
  assert.deepEqual(result.instants.map((instant) => instant.isDst), [true, false]);
});

test('readings outside the window are out of coverage', () => {
  const atlas = load();
  assert.equal(resolve(atlas, 'test-east', '1869-12-31T23:59:59').status, 'out-of-coverage');
  assert.equal(resolve(atlas, 'test-east', '1870-01-01T00:00:00').status, 'ok');
  assert.equal(resolve(atlas, 'test-east', '1919-12-31T23:59:59').status, 'ok');
  assert.equal(resolve(atlas, 'test-east', '1920-01-01T00:00:00').status, 'out-of-coverage');
});

test('readings near a boundary the sources do not fix exactly are flagged uncertain', () => {
  const atlas = load();
  // The end of summer time has a window from 25 to 27 October.
  const near = resolve(atlas, 'test-east', '1890-10-26T12:00:00');
  assert.equal(near.instants[0].uncertainty.flag, 'uncertain');
  assert.match(near.instants[0].uncertainty.reasons.join(' '), /uncertain limits/);
  const far = resolve(atlas, 'test-east', '1890-11-20T12:00:00');
  assert.equal(far.instants[0].uncertainty.flag, 'documented');
  // The railway rule's end is fixed to the day: readings within a day of it are uncertain.
  const railway = resolve(atlas, 'test-east', '1880-06-01T20:00:00', 'railway');
  assert.equal(railway.instants[0].uncertainty.flag, 'uncertain');
  // A change of legal basis that leaves the offset as it was makes nothing
  // uncertain, however loosely it is dated.
  atlas.rules.get('test-railway').offset = { type: 'fixed', seconds: 3600 };
  const same = resolve(atlas, 'test-east', '1880-06-01T20:00:00', 'railway');
  assert.equal(same.instants[0].uncertainty.flag, 'documented');
});

test('UTC -> local -> UTC round trips at every millisecond near a change', () => {
  const atlas = load();
  const timeline = buildTimeline(atlas, atlas.places.get('test-west'));
  const change = timeline[1].startMs;
  for (let instant = change - 5; instant <= change + 5; instant += 1) {
    const { wallMs } = wallAt(timeline, instant);
    const back = resolveWall(timeline, wallMs).instants.map((item) => item.utcMs);
    assert.ok(back.includes(instant));
  }
});

test('the checks pass on the fixture and count their round trips', () => {
  const { problems, stats } = checkAtlas(load(), { today: '2026-09-28' });
  assert.deepEqual(problems, []);
  assert.equal(stats.boundaries, 12);
  assert.ok(stats.roundTrips > 50);
});

test('the checks catch a gap between rules', () => {
  const atlas = load();
  atlas.rules.get('test-summer').start = { ...atlas.rules.get('test-summer').start, local: '1890-03-30T02:30:00' };
  const { problems } = checkAtlas(atlas, { today: '2026-09-28' });
  assert.ok(problems.some((text) => /gap of 1800 s between test-standard-1/.test(text)), problems.join('\n'));
});

test('the checks catch a missing citation, excerpt or retrieval date', () => {
  const atlas = load();
  atlas.rules.get('test-lmt').citations = ['no-such-source'];
  const citation = atlas.citations.get('fixture-source');
  delete citation.excerpt;
  delete citation.retrieved;
  atlas.files.get('citations.json').citations[0] = citation;
  const { problems } = checkAtlas(atlas, { today: '2026-09-28' });
  assert.ok(problems.some((text) => /missing excerpt/.test(text)), problems.join('\n'));
  assert.ok(problems.some((text) => /missing retrieved/.test(text)), problems.join('\n'));
});

test('the checks catch a rule without citations and an unused citation', () => {
  const atlas = load();
  atlas.files.get('rules.json').rules.find((rule) => rule.id === 'test-lmt').citations = [];
  const { problems } = checkAtlas(atlas, { today: '2026-09-28' });
  assert.ok(problems.some((text) => /citations: fewer than 1 items/.test(text)), problems.join('\n'));
});

test('the schema validator reports types, patterns and unknown properties', () => {
  const schema = readJson(SCHEMA_PATH);
  const good = readJson(join(FIXTURE, 'citations.json'));
  assert.deepEqual(validate(good, schema), []);
  const bad = structuredClone(good);
  bad.citations[0].url = 'http://example.org/insecure';
  bad.citations[0].extra = true;
  bad.citations[0].retrieved = '2026-13-01';
  const problems = validate(bad, schema).join('\n');
  assert.match(problems, /url.*does not match/);
  assert.match(problems, /unexpected property extra/);
  assert.match(problems, /retrieved.*does not match/);
});
