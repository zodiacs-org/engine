/* Replay the source-bound rc.2 synthetic fixtures and every receipt request. Regression evidence, not an independent accuracy comparison. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ENGINE_VERSION } from '@zodiacs/engine';
import * as calcEntry from '@zodiacs/engine/calc';

const FIXTURE_SHA256 = 'eee06adaa62e42320774cc4e7d0484f53aa47b3cfa696889425073f64f54ee81';
const bytes = readFileSync(process.argv[2]);
const digest = createHash('sha256').update(bytes).digest('hex');
if (digest !== FIXTURE_SHA256) throw new Error(`fixture SHA-256 ${digest}, expected ${FIXTURE_SHA256}`);
const { cases } = JSON.parse(bytes.toString('utf8'));
const run = { calc: calcEntry.calc, houses: calcEntry.houses, events: calcEntry.events, chart: calcEntry.chart };

if (ENGINE_VERSION !== '1.0.0-rc.2' || cases.length !== 38) throw new Error('Unexpected candidate or fixture count');
let worst = 0;
const mismatches = [];
function compare(actual, expected, path) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const difference = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
    worst = Math.max(worst, difference);
    if (difference > 1e-12) mismatches.push(path);
    return;
  }
  if (expected !== null && typeof expected === 'object' && actual !== null && typeof actual === 'object') {
    if (Object.keys(actual).sort().join() !== Object.keys(expected).sort().join()) mismatches.push(`${path} keys`);
    for (const [key, value] of Object.entries(expected)) compare(actual[key], value, `${path}.${key}`);
    return;
  }
  if (actual !== expected) mismatches.push(path);
}

const byFunction = {};
const zodiacs = {};
const refusals = {};
const frames = new Set();
const centers = new Set();
const corrections = new Set();
let receiptReplays = 0;
for (const [index, fixture] of cases.entries()) {
  byFunction[fixture.function] = (byFunction[fixture.function] ?? 0) + 1;
  // tropical, a built-in ayanamsa's name, or "caller's" for a caller's own definition
  const sidereal = fixture.request.zodiac?.sidereal;
  const zodiac = sidereal === undefined ? 'tropical' : typeof sidereal === 'string' ? `sidereal ${sidereal}` : "sidereal, caller's";
  zodiacs[zodiac] = (zodiacs[zodiac] ?? 0) + 1;
  compare(JSON.parse(JSON.stringify(run[fixture.function](fixture.request))), fixture.result, `case ${index}`);
  if (fixture.result.receipt) {
    receiptReplays += 1;
    const replayed = run[fixture.function](JSON.parse(JSON.stringify(fixture.result.receipt.request)));
    compare(JSON.parse(JSON.stringify(replayed)), fixture.result, `case ${index} receipt`);
  }
  if (fixture.result.status === 'refused') refusals[fixture.result.reason] = (refusals[fixture.result.reason] ?? 0) + 1;
  if (fixture.function === 'calc' && fixture.result.status === 'ok') {
    const request = fixture.result.receipt.request;
    frames.add(request.frame);
    centers.add(typeof request.center === 'string' ? request.center : 'topocentric');
    corrections.add(request.flags.correction);
  }
}

const record = {
  schema: 'zodiacs.calc-roundtrip-replay.v1',
  fixture: { path: 'src/fixtures/calc-roundtrip.json', sha256: FIXTURE_SHA256, engineCommits: ['7fa964d2a77d09dbb819b5733b36e303fc7fc513'] },
  engine: ENGINE_VERSION,
  cases: cases.length,
  byFunction,
  zodiacs,
  receiptReplays,
  refusals,
  frames: [...frames].sort(),
  centers: [...centers].sort(),
  corrections: [...corrections].sort(),
  tolerance: 'the same keys, and each number within 1e-12 of the fixture\'s, relative above 1 and absolute below',
  worstRelativeDifference: worst,
  mismatches: mismatches.length,
};
process.stdout.write(`${JSON.stringify(record, null, 1)}\n`);
if (mismatches.length > 0 || receiptReplays !== 27) process.exitCode = 1;
