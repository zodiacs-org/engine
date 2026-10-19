// Measure selected source windows. This is not a full-span inventory report.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { EvaluationContext, searchSignIngresses, searchStations } from '../build/src/index.js';

const project = new URL('../', import.meta.url);
const reference = 'references/horizons-sample.json';
execFileSync('python3', ['scripts/horizons_sample.py', '--verify', reference],
  { cwd: project, stdio: 'pipe' });
const bytes = readFileSync(new URL(reference, project));
const fixture = JSON.parse(bytes);
const plan = JSON.parse(readFileSync(new URL(fixture.samplePlan, project), 'utf8'));
const policies = [
  { id: 'hourly', options: { stepMs: 3600000 } },
  { id: 'station-aware', options: { stepMs: 86400000, stationStepMs: 21600000 } }
];
const scans = policies.map(policy => {
  const cases = fixture.events.map(({ case: c, reference: expected }) => {
    const ctx = new EvaluationContext({ startMs: Date.parse(c.start + 'T00:00:00Z'),
      endMs: Date.parse(c.end + 'T00:00:00Z'), clock: fixture.clock }, { maxEvaluations: 10000 });
    const result = c.kind === 'station' ? searchStations(ctx, c.body, policy.options)
      : searchSignIngresses(ctx, c.body, { ...policy.options, direction: c.direction });
    assert.equal(result.status, 'complete', c.id);
    // Match identity before assessing timing. A date cutoff must not hide a
    // discovered event whose timing fails the declared acceptance threshold.
    const matches = result.events.filter(e => e.body === c.body && e.direction === c.direction &&
      e.kind === (c.kind === 'station' ? 'station' : 'sign-ingress') &&
      (c.kind === 'station' || e.longitude === c.targetDegrees));
    const error = matches.length === 1 ? Math.abs(matches[0].atMs - expected.atMs) : null;
    return { id: c.id, matchedIdentities: matches.length,
      timingWithinThreshold: error !== null && error <= c.toleranceMs,
      maxAbsoluteTimingErrorSecondsRoundedUp: error === null ? null : Math.ceil(error / 1000) };
  });
  return { ...policy, cases, summary: {
    referenceCases: cases.length,
    matchedCases: cases.filter(c => c.matchedIdentities === 1).length,
    missingCases: cases.filter(c => c.matchedIdentities === 0).length,
    ambiguousCases: cases.filter(c => c.matchedIdentities > 1).length,
    timingWithinThreshold: cases.filter(c => c.timingWithinThreshold).length,
    timingOutsideThreshold: cases.filter(c => c.matchedIdentities === 1 && !c.timingWithinThreshold).length
  } };
});
const evidence = { reference,
  referenceSha256: createHash('sha256').update(bytes).digest('hex'),
  planSha256: fixture.samplePlanSha256, clock: fixture.clock, toleranceMs: plan.toleranceMs,
  parentVersion: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
  rounding: 'Absolute timing errors rounded up to whole seconds; acceptance uses unrounded milliseconds.',
  scope: 'Only selected hourly source windows and identities; daily selection and these comparisons do not prove a full inventory or physical timing bounds.',
  scans };
const destination = new URL('../evidence/horizons-sample-timing.json', import.meta.url);
if (process.argv.length === 3 && process.argv[2] === '--write') {
  writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write('Horizons sample timing evidence written\n');
} else if (process.argv.length === 3 && process.argv[2] === '--check') {
  assert.deepEqual(evidence, JSON.parse(readFileSync(destination, 'utf8')));
  process.stdout.write('Horizons sample timing evidence reproduces\n');
} else {
  throw new Error('Use --write to regenerate or --check to verify the committed evidence.');
}
