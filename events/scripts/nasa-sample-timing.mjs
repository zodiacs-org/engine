// Compare full catalog-date searches only; this is not a full-year inventory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { EvaluationContext, searchEclipses } from '../build/src/index.js';

const project = new URL('../', import.meta.url);
const reference = 'references/nasa-sample.json';
const planPath = 'references/nasa-sample-plan.json';
execFileSync('python3', ['scripts/nasa_sample.py', '--verify', reference],
  { cwd: project, stdio: 'pipe' });
const bytes = readFileSync(new URL(reference, project));
const planBytes = readFileSync(new URL(planPath, project));
const fixture = JSON.parse(bytes);
const plan = JSON.parse(planBytes);
const model = { sunRadiusAu: plan.radiusKm.sun / plan.auKm,
  moonRadiusAu: plan.radiusKm.moon / plan.auKm, earthRadiusAu: plan.radiusKm.earth / plan.auKm };

const cases = fixture.events.map(expected => {
  const startMs = Date.parse(expected.date + 'T00:00:00Z');
  assert.equal(expected.atMs, Date.parse(expected.tdLabel + 'Z'));
  const context = new EvaluationContext({ startMs: startMs - plan.options.derivativeStepMs,
    endMs: startMs + 86400000 + plan.options.derivativeStepMs, clock: fixture.clock },
  { maxEvaluations: 10000 });
  const result = searchEclipses(context, expected.kind, model, plan.options);
  assert.equal(result.status, 'complete', expected.catalogNumber);
  // Count identities within the full date before comparing time or class.
  // A failed class must not disappear as a supposed missing eclipse.
  const matches = result.events.filter(event => event.kind === expected.kind &&
    event.atMs > startMs && event.atMs <= startMs + 86400000);
  for (const event of result.events) {
    assert.equal(event.clock, 'tt');
    assert.equal(event.definition, 'minimum-shadow-axis-distance');
    assert.ok(event.bracket[1] - event.bracket[0] <= 1);
  }
  const actual = matches.length === 1 ? matches[0] : null;
  const errorMs = actual === null ? null : Math.abs(actual.atMs - expected.atMs);
  return { kind: expected.kind, catalogNumber: expected.catalogNumber, date: expected.date,
    catalogType: expected.catalogType, expectedClassification: expected.classification,
    foundEventsOnDate: matches.length, actualClassification: actual?.classification ?? null,
    classificationMatches: actual !== null && actual.classification === expected.classification,
    timingWithinThreshold: errorMs !== null && errorMs <= plan.toleranceMs,
    maxAbsoluteTimingErrorSecondsRoundedUp: errorMs === null ? null : Math.ceil(errorMs / 1000) };
});

function summarize(selected) {
  const measured = selected.filter(c => c.foundEventsOnDate === 1);
  return { referenceCases: selected.length, matchedCases: measured.length,
    missingCases: selected.filter(c => c.foundEventsOnDate === 0).length,
    ambiguousCases: selected.filter(c => c.foundEventsOnDate > 1).length,
    classificationMatches: measured.filter(c => c.classificationMatches).length,
    classificationMismatches: measured.filter(c => !c.classificationMatches).length,
    timingWithinThreshold: measured.filter(c => c.timingWithinThreshold).length,
    timingOutsideThreshold: measured.filter(c => !c.timingWithinThreshold).length,
    maxAbsoluteTimingErrorSecondsRoundedUp: measured.length
      ? Math.max(...measured.map(c => c.maxAbsoluteTimingErrorSecondsRoundedUp)) : null };
}
const evidence = { reference, referenceSha256: createHash('sha256').update(bytes).digest('hex'),
  plan: planPath, planSha256: createHash('sha256').update(planBytes).digest('hex'),
  parentVersion: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version,
  clock: fixture.clock, years: plan.years, toleranceMs: plan.toleranceMs, options: plan.options,
  radiusKm: plan.radiusKm, auKm: plan.auKm,
  scope: 'Full TT catalog dates in the fixed year selection only. This does not measure events on other dates, full-year search completeness, contact times or local visibility.',
  rounding: 'Absolute timing errors rounded up to whole seconds; acceptance uses unrounded milliseconds.',
  summary: summarize(cases), byKind: Object.fromEntries(['solar', 'lunar'].map(kind =>
    [kind, summarize(cases.filter(c => c.kind === kind))])), cases };
const destination = new URL('../evidence/nasa-sample-timing.json', import.meta.url);
if (process.argv.length === 3 && process.argv[2] === '--write') {
  writeFileSync(destination, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write('NASA sample timing evidence written\n');
} else if (process.argv.length === 3 && process.argv[2] === '--check') {
  assert.deepEqual(evidence, JSON.parse(readFileSync(destination, 'utf8')));
  process.stdout.write('NASA sample timing evidence reproduces\n');
} else {
  throw new Error('Use --write to regenerate or --check to verify the committed evidence.');
}
