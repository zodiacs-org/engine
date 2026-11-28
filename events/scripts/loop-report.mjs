// Report discovery separately from timing agreement with independent dates.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { EvaluationContext, searchLongitudeCrossings } from '../build/src/index.js';

const project = new URL('../', import.meta.url);
const fixture = JSON.parse(execFileSync('python3', ['scripts/loops.py', '--json'],
  { cwd: project, encoding: 'utf8' }));
const cases = fixture.cases.map(c => {
  const ctx = () => new EvaluationContext({ startMs: Date.parse(c.start + 'T00:00:00Z'),
    endMs: Date.parse(c.end + 'T00:00:00Z'), clock: fixture.clock }, { maxEvaluations: 10000 });
  const options = { stepMs: 2 * 86400000, stationStepMs: 2 * 86400000 };
  const found = searchLongitudeCrossings(ctx(), c.body, c.targetDegrees, options);
  const legacy = searchLongitudeCrossings(ctx(), c.body, c.targetDegrees, { stepMs: options.stepMs });
  assert.equal(found.status, 'complete');
  assert.equal(legacy.status, 'complete');
  // Each independent date has a distinct direction within its source window.
  // Match by direction so timing disagreement cannot be mislabeled as absence.
  const matched = c.events.map(expected => {
    const candidates = found.events.filter(actual => actual.direction === expected.direction);
    return candidates.length === 1 ? candidates[0].atMs - expected.atMs : null;
  });
  const errors = matched.filter(error => error !== null);
  const failures = errors.filter(error => Math.abs(error) > fixture.toleranceMs).length;
  return { id: c.id, start: c.start, end: c.end, expectedPasses: c.events.length,
    legacyFound: legacy.events.length, stationAwareFound: found.events.length,
    missingOrAmbiguousDirections: matched.filter(error => error === null).length,
    unmatchedPasses: found.events.filter(actual => !c.events.some(e => e.direction === actual.direction)).length,
    timingOutsideThreshold: failures,
    allDatesWithinThreshold: errors.length === c.events.length && failures === 0,
    maxAbsoluteTimingErrorSecondsRoundedUp: errors.length ? Math.ceil(Math.max(...errors.map(Math.abs)) / 1000) : null };
});
const evidence = { source: fixture.source, sourceFixtureSha256: fixture.sourceFixtureSha256,
  reference: 'references/loop-cases.json', clock: fixture.clock, toleranceMs: fixture.toleranceMs,
  rounding: 'Maximum absolute timing error rounded up to whole seconds; match by window and unique direction.',
  scope: 'Only the declared Venus source windows and invented fixed longitudes; no full-span completeness or timing bound.',
  parentVersion: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
  cases };
const destination = new URL('../evidence/station-loops.json', import.meta.url);
if (process.argv.length === 3 && process.argv[2] === '--write') {
  writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write('Loop discovery and timing evidence written\n');
} else if (process.argv.length === 3 && process.argv[2] === '--check') {
  assert.deepEqual(evidence, JSON.parse(readFileSync(destination, 'utf8')));
  process.stdout.write('Loop discovery and timing evidence reproduces\n');
} else {
  throw new Error('Use --write to regenerate or --check to verify the committed evidence.');
}
