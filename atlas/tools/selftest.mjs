/*
 * Tests of the atlas tools on an invented jurisdiction (fixture/), so
 * that the resolver and the checks are exercised independently of the
 * historical data.
 *
 *   node --test atlas/tools/selftest.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkAtlas, tzdbProblems } from './check.mjs';
import { assignExplanations } from './compare-tzdb.mjs';
import { buildTimeline, formatOffset, loadAtlas, offsetMs, parseLocal, parseUtc, resolve, resolveUtc, resolveWall, wallAt } from './lib.mjs';
import { validate } from './schema.mjs';
import { readJson, SCHEMA_PATH } from './lib.mjs';

const TOOLS = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE = join(TOOLS, 'fixture');
const load = () => loadAtlas(FIXTURE);
const utc = (text) => Date.parse(text);

/** Runs resolve.mjs on the fixture; returns the exit status, the parsed output and stderr. */
function cli(args, env = {}) {
  try {
    const stdout = execFileSync('node', [join(TOOLS, 'resolve.mjs'), '--data', FIXTURE, ...args], {
      encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: JSON.parse(stdout) };
  } catch (error) {
    return { code: error.status, out: error.stdout ? JSON.parse(error.stdout) : null, err: error.stderr };
  }
}

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
  const adHoc = resolve(atlas, { jurisdiction: 'test-land', longitude: 7.5, department: '01' }, '1875-01-01T12:00:00');
  assert.equal(adHoc.instants[0].utc, '1875-01-01T11:30:00Z');
  assert.equal(adHoc.instants[0].uncertainty.flag, 'inferred');
});

test('a place read by longitude must lie in a covered département and inside its area', () => {
  const atlas = load();
  const at = (longitude, department) => resolve(atlas, { jurisdiction: 'test-land', longitude, department }, '1875-01-01T12:00:00');
  assert.equal(at(9, '2A').instants[0].utc, '1875-01-01T11:24:00Z');
  assert.throws(() => at(7.5, undefined), /give the place's département/);
  assert.throws(() => at(7.5, '03'), /not covered by test-land: an invented exclusion/);
  assert.throws(() => at(7.5, '04'), /département 04 is not covered/);
  assert.throws(() => at(-74, '01'), /outside the test mainland/);
  assert.throws(() => at(8.2, '01'), /outside the test mainland/);
  assert.throws(() => at(7.5, '2A'), /outside the test island/);
  // A jurisdiction without readByLongitude covers only its listed places.
  delete atlas.jurisdictions.get('test-land').readByLongitude;
  assert.throws(() => at(7.5, '01'), /covers only its listed places \(test-east, test-west\)/);
});

test('--utc is always UTC, with or without Z, whatever the host time zone', () => {
  const saved = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    assert.equal(parseUtc('1883-11-18T17:00:00'), Date.UTC(1883, 10, 18, 17));
    assert.equal(parseUtc('1883-11-18T17:00:00Z'), Date.UTC(1883, 10, 18, 17));
    assert.equal(parseUtc('1883-11-18T17:00'), Date.UTC(1883, 10, 18, 17));
    assert.throws(() => parseUtc('1883-11-18T17:00:00+01:00'), /not a UTC time/);
    assert.throws(() => parseUtc('1883-11-31T17:00:00Z'), /no such date/);
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
  const inNewYork = cli(['--place', 'test-east', '--utc', '1885-01-01T11:00:00'], { TZ: 'America/New_York' });
  const withZ = cli(['--place', 'test-east', '--utc', '1885-01-01T11:00:00Z'], { TZ: 'Asia/Tokyo' });
  assert.equal(inNewYork.code, 0);
  assert.equal(inNewYork.out.local, '1885-01-01T12:00:00');
  assert.deepEqual(withZ.out, inNewYork.out);
  // One reading at a time: --local and --utc together are refused, not one silently preferred.
  const both = cli(['--place', 'test-east', '--local', '1885-01-01T12:00', '--utc', '1885-01-01T11:00Z']);
  assert.equal(both.code, 1);
  assert.match(both.err, /give --local or --utc, not both/);
});

test('--utc reports the same instant fields as --local, uncertainty included', () => {
  const atlas = load();
  // 26 October 1890, 10:00 UTC lies inside the window of the end of summer time.
  const fromUtc = resolveUtc(atlas, 'test-east', '1890-10-26T10:00:00Z');
  assert.equal(fromUtc.status, 'ok');
  assert.equal(fromUtc.local, '1890-10-26T11:00:00');
  const [instant] = fromUtc.instants;
  assert.equal(instant.offset, '+1:00:00');
  assert.equal(instant.rule, 'test-standard-2');
  assert.equal(instant.ruleVersion, 1);
  assert.deepEqual(instant.citations, ['fixture-source']);
  assert.equal(instant.uncertainty.flag, 'uncertain');
  const fromLocal = resolve(atlas, 'test-east', fromUtc.local);
  assert.deepEqual(fromLocal.instants[0], instant);
  // A reading that occurred twice is said to.
  assert.equal(resolveUtc(atlas, 'test-east', '1890-10-26T00:30:00Z').localReading, 'occurred more than once');
  assert.equal(resolveUtc(atlas, 'test-east', '1869-12-31T12:00:00Z').status, 'out-of-coverage');
});

test('the resolver refuses out-of-range times, a malformed longitude and an unknown clock', () => {
  // Fields out of range are refused, not carried into the next hour or day.
  assert.throws(() => parseLocal('1905-06-01T12:75:00'), /no such time/);
  assert.throws(() => parseLocal('1905-06-01T24:00:00'), /no such time/);
  assert.throws(() => parseLocal('1905-06-01T12:30:60'), /no such time/);
  assert.throws(() => parseUtc('1905-06-01T12:75Z'), /no such time/);
  for (const args of [['--local', '1905-06-01T12:75'], ['--utc', '1905-06-01T24:00Z']]) {
    const result = cli(['--place', 'test-east', ...args]);
    assert.equal(result.code, 1, args.join(' '));
    assert.match(result.err, /no such time/);
  }
  // Number() would read "0x5" as 5 and "1e1" as 10, and "" as 0.
  for (const longitude of ['0x5', '1e1', '7,5', 'east']) {
    const result = cli(['--jurisdiction', 'test-land', '--department', '01', '--longitude', longitude, '--local', '1875-01-01T12:00']);
    assert.equal(result.code, 1, `--longitude "${longitude}"`);
    assert.match(result.err, /--longitude must be decimal degrees east/);
  }
  const empty = cli(['--jurisdiction', 'test-land', '--department', '01', '--longitude', '', '--local', '1875-01-01T12:00']);
  assert.equal(empty.code, 1);
  assert.match(empty.err, /--longitude needs a value/);
  assert.equal(cli(['--jurisdiction', 'test-land', '--department', '01', '--longitude', '-4.5', '--local', '1875-01-01T12:00']).code, 0);
  // An unknown clock is an input error (exit 1), not a clock the place lacks (exit 4).
  const unknown = cli(['--place', 'test-east', '--local', '1885-01-01T12:00', '--clock', 'solar']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /unknown clock solar: give civil or railway/);
  assert.throws(() => resolve(load(), 'test-east', '1885-01-01T12:00:00', 'solar'), /unknown clock/);
  assert.throws(() => resolveUtc(load(), 'test-east', '1885-01-01T11:00:00Z', 'Railway'), /unknown clock/);
});

test('the resolver refuses unknown, valueless, repeated and conflicting options', () => {
  const at = ['--place', 'test-east', '--local', '1885-01-01T12:00'];
  const refused = (args, pattern) => {
    const result = cli(args);
    assert.equal(result.code, 1, args.join(' '));
    assert.equal(result.out, null, args.join(' '));
    assert.match(result.err, pattern, args.join(' '));
  };
  // The same question asked properly is answered.
  assert.equal(cli([...at, '--clock', 'railway']).code, 0);
  // An unknown option, or a word that is not an option, is not skipped.
  refused([...at, '--clok', 'railway'], /unknown option --clok; the options are --place, /);
  refused([...at, 'railway'], /unexpected "railway": each value follows its option/);
  // An option without its value is not taken as its default.
  refused([...at, '--clock'], /--clock needs a value/);
  refused(['--place', 'test-east', '--clock', '--local', '1885-01-01T12:00'], /--clock needs a value/);
  refused(['--place', 'test-east', '--local', ''], /--local needs a value/);
  // An option given twice is not settled by taking one of the two.
  refused([...at, '--local', '1885-06-01T12:00'], /--local is given more than once/);
  refused([...at, '--place', 'test-west'], /--place is given more than once/);
  // --place with a place by longitude is refused, not resolved on --place alone.
  refused([...at, '--jurisdiction', 'test-land', '--department', '03', '--longitude', '7.5'],
    /give --place, or --jurisdiction with --department and --longitude, not both \(--place was given with --jurisdiction, --department, --longitude\)/);
  for (const extra of [['--jurisdiction', 'test-land'], ['--department', '01'], ['--longitude', '7.5']]) {
    refused([...at, ...extra], new RegExp(`not both \\(--place was given with ${extra[0]}\\)`));
  }
  refused(['--department', '01', '--longitude', '7.5', '--local', '1875-01-01T12:00'], /give --place, or --jurisdiction with --department and --longitude/);
});

test('a clock the jurisdiction does not keep is reported as such, not as out of coverage', () => {
  const atlas = load();
  delete atlas.jurisdictions.get('test-land').timeline.railway;
  for (const result of [resolve(atlas, 'test-east', '1885-01-01T12:00:00', 'railway'), resolveUtc(atlas, 'test-east', '1885-01-01T12:00:00Z', 'railway')]) {
    assert.equal(result.status, 'no-such-clock');
    assert.match(result.reason, /keeps no railway clock \(it keeps: civil\)/);
    assert.deepEqual(result.instants, []);
  }
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

test('a local reading inside the span of an imprecise change, read on either clock, is uncertain', () => {
  const atlas = load();
  // As in Chicago in 1883: the old time nine minutes ahead of the new, set
  // back at noon, and whether noon by the old clock or the new is not known.
  // The change is placed at noon on the new clock (11:00 UTC); the window runs
  // from noon on the old clock (10:51 UTC).
  const window = { earliest: '1880-06-01T11:51:00', latest: '1880-06-01T12:00:00' };
  const old = atlas.rules.get('test-lmt');
  old.offset = { type: 'fixed', seconds: 4140 };
  old.end = { ...old.end, window, note: 'Invented note.' };
  const next = atlas.rules.get('test-standard-1');
  next.start = { ...next.start, window, note: 'Invented note.' };
  // 11:55 falls on the old clock (10:46 UTC) if the change came at noon new
  // time, and on the new clock (10:55 UTC) if it came at noon old time.
  const inside = resolve(atlas, 'test-east', '1880-06-01T11:55:00');
  assert.equal(inside.status, 'ok');
  assert.equal(inside.instants[0].utc, '1880-06-01T10:46:00Z');
  assert.equal(inside.instants[0].uncertainty.flag, 'uncertain');
  // The change is described at the end of one rule and the start of the next
  // in the same words; the reason is given once.
  assert.equal(inside.instants[0].uncertainty.reasons.filter((text) => /uncertain limits/.test(text)).length, 1);
  assert.equal(resolve(atlas, 'test-east', '1880-06-01T11:45:00').instants[0].uncertainty.flag, 'inferred');
  // From UTC, 10:46 is before the earliest the change can have come: the old clock was in force.
  assert.equal(resolveUtc(atlas, 'test-east', '1880-06-01T10:46:00Z').instants[0].uncertainty.flag, 'inferred');
  assert.equal(resolveUtc(atlas, 'test-east', '1880-06-01T10:55:00Z').instants[0].uncertainty.flag, 'uncertain');
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

test('each tzdb difference must match exactly one explanation, on its values', () => {
  const difference = (extra = {}) => ({
    place: 'test-east', zone: 'Europe/Paris', from: '1880-01-01T00:00:00Z', to: '1880-02-01T00:00:00Z',
    atlasRule: 'test-lmt', atlasOffset: '+0:30:00', atlasOffsetSeconds: 1800, tzdbOffset: '+0:09:21', tzdbOffsetSeconds: 561,
    differenceSeconds: 1239, explanation: null, ...extra,
  });
  const explanation = (id, match = {}) => ({
    id, match: { places: ['test-east'], zones: ['Europe/Paris'], rules: ['test-lmt'], atlasOffsets: [1800], tzdbOffsets: [561], ...match },
  });
  const one = [difference()];
  assert.deepEqual(assignExplanations(one, [explanation('a')]), []);
  assert.equal(one[0].explanation, 'a');
  // Two matching explanations are an error, not a choice.
  const two = assignExplanations([difference()], [explanation('a'), explanation('b')]);
  assert.ok(two.some((text) => /matches 2 explanations \(a, b\)/.test(text)), two.join('\n'));
  // A changed value on either side leaves the difference unexplained.
  assert.ok(assignExplanations([difference({ tzdbOffsetSeconds: 0 })], [explanation('a')]).some((text) => /with no explanation/.test(text)));
  assert.ok(assignExplanations([difference({ atlasOffsetSeconds: 1800.5 })], [explanation('a')]).some((text) => /with no explanation/.test(text)));
  // Values an explanation lists but none of its differences has are reported.
  const loose = assignExplanations([difference()], [explanation('a', { places: ['test-east', 'test-west'], tzdbOffsets: [561, 0] })]);
  assert.ok(loose.some((text) => /lists place test-west/.test(text)), loose.join('\n'));
  assert.ok(loose.some((text) => /lists tzdb offset 0 s/.test(text)), loose.join('\n'));
  assert.ok(assignExplanations([], [explanation('a')]).some((text) => /matches no difference/.test(text)));
});

test('a missing tzdb extract fails the check instead of skipping it', async () => {
  const problems = await tzdbProblems(load(), join(FIXTURE, 'no-such-extract.json'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /is missing, so the comparison with tzdb cannot run/);
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

test('the checks hold excerpts to 40 words and want a record of how each was checked', () => {
  const atlas = load();
  const citation = atlas.citations.get('fixture-source');
  citation.excerpt = Array.from({ length: 41 }, (_, index) => `w${index}`).join(' ');
  citation.checks = [{ method: 'ocr', date: '2026-09-27', result: 'partial' }];
  const { problems } = checkAtlas(atlas, { today: '2026-09-28' });
  assert.ok(problems.some((text) => /excerpt has 41 words \(at most 40\)/.test(text)), problems.join('\n'));
  assert.ok(problems.some((text) => /checked \(2026-09-27\) before it was retrieved/.test(text)), problems.join('\n'));
  assert.ok(problems.some((text) => /a partial ocr check needs a note/.test(text)), problems.join('\n'));
});

test('the checks catch a département listed twice for reading by longitude', () => {
  const atlas = load();
  atlas.jurisdictions.get('test-land').readByLongitude.excluded[0].departments.push('01');
  const { problems } = checkAtlas(atlas, { today: '2026-09-28' });
  assert.ok(problems.some((text) => /département 01 is listed in area the test mainland and in exclusion 1/.test(text)), problems.join('\n'));
});

test('the citations an exclusion names must exist, and count as cited', () => {
  const atlas = load();
  const exclusion = atlas.jurisdictions.get('test-land').readByLongitude.excluded[0];
  exclusion.citations = ['no-such-source'];
  let { problems } = checkAtlas(atlas, { today: '2026-09-28' });
  assert.ok(problems.some((text) => /jurisdiction test-land exclusion 1: cites unknown citation no-such-source/.test(text)), problems.join('\n'));

  // A citation named only by an exclusion is cited; once the exclusion drops it, it is cited by nothing.
  const source = { ...structuredClone(atlas.citations.get('fixture-source')), id: 'fixture-exclusion-source' };
  atlas.citations.set(source.id, source);
  atlas.files.get('citations.json').citations.push(source);
  exclusion.citations = [source.id];
  ({ problems } = checkAtlas(atlas, { today: '2026-09-28' }));
  assert.deepEqual(problems, []);
  delete exclusion.citations;
  ({ problems } = checkAtlas(atlas, { today: '2026-09-28' }));
  assert.ok(problems.some((text) => /citation fixture-exclusion-source is cited by nothing/.test(text)), problems.join('\n'));
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
