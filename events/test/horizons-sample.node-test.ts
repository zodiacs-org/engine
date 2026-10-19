import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EvaluationContext, searchSignIngresses, searchStations, SIGNS } from '../src/index.js';
import type { CrossingDirection, EventBody, SignIngress, Station } from '../src/index.js';

const project = new URL('../../', import.meta.url);
const HOUR = 3600000;
const DAY = 24 * HOUR;
const thresholds = { ingress: 600000, station: 1200000 } as const;
const expectedSurveys = [
  { body: 'Mercury', command: '199', year: 1900 },
  { body: 'Venus', command: '299', year: 1950 },
  { body: 'Jupiter', command: '599', year: 2000 },
  { body: 'Mars', command: '499', year: 2001 },
  { body: 'Saturn', command: '699', year: 2050 },
  { body: 'Neptune', command: '899', year: 2100 }
] as const;

interface Survey {
  readonly body: EventBody;
  readonly command: string;
  readonly year: number;
}
interface Selection {
  readonly kind: 'station' | 'ingress';
  readonly direction: CrossingDirection;
}
interface ReferenceCase extends Selection {
  readonly id: string;
  readonly body: EventBody;
  readonly command: string;
  readonly start: string;
  readonly end: string;
  readonly toleranceMs: number;
  readonly targetDegrees?: number;
}
interface SampleEntry {
  readonly case: ReferenceCase;
  readonly reference: {
    readonly atMs: number;
    readonly direction: CrossingDirection;
    readonly bracketMs: readonly [number, number];
    readonly targetDegrees?: number;
  };
}
const plan = JSON.parse(readFileSync(new URL('references/horizons-sample-plan.json', project), 'utf8')) as {
  readonly surveys: readonly Survey[];
  readonly toleranceMs: typeof thresholds;
};
const fixture = JSON.parse(readFileSync(new URL('references/horizons-sample.json', project), 'utf8')) as {
  readonly clock: 'tt';
  readonly surveys: readonly {
    readonly survey: Survey;
    readonly absentFromDailySelection: readonly Selection[];
  }[];
  readonly events: readonly SampleEntry[];
};
const timingEvidence = JSON.parse(readFileSync(new URL('evidence/horizons-sample-timing.json', project), 'utf8')) as {
  readonly reference: string;
  readonly clock: 'tt';
  readonly toleranceMs: typeof thresholds;
  readonly scans: readonly {
    readonly id: string;
    readonly options: { readonly stepMs: number; readonly stationStepMs?: number };
    readonly cases: readonly {
      readonly id: string;
      readonly matchedIdentities: number;
      readonly timingWithinThreshold: boolean;
      readonly maxAbsoluteTimingErrorSecondsRoundedUp: number | null;
    }[];
  }[];
};

function epoch(date: string): number {
  const value = Date.parse(`${date}T00:00:00Z`);
  assert.ok(Number.isSafeInteger(value), `Invalid date label: ${date}`);
  return value;
}
function selectionKey(selection: Selection): string {
  return `${selection.kind}:${selection.direction}`;
}

test('broader Horizons sample reproduces offline from requests, digests and independent row reductions', () => {
  const output = execFileSync('python3',
    ['scripts/horizons_sample.py', '--verify', 'references/horizons-sample.json'],
    { cwd: project, encoding: 'utf8' });
  assert.match(output, /verified/);
  execFileSync('python3', ['scripts/horizons_sample_test.py'],
    { cwd: project, encoding: 'utf8', stdio: 'pipe' });
});

test('sample retains the declared body-years, thresholds and explicitly sparse selection', () => {
  assert.equal(fixture.clock, 'tt');
  assert.deepEqual(plan.surveys, expectedSurveys);
  assert.deepEqual(plan.toleranceMs, thresholds);
  assert.deepEqual(fixture.surveys.map(entry => entry.survey), expectedSurveys);
  assert.equal(fixture.events.length, 17);
  assert.equal(fixture.events.filter(entry => entry.case.kind === 'station').length, 11);
  assert.equal(fixture.events.filter(entry => entry.case.kind === 'ingress').length, 6);
  assert.equal(new Set(fixture.events.map(entry => entry.case.id)).size, fixture.events.length);
  const slots = ['ingress:direct', 'ingress:retrograde', 'station:direct', 'station:retrograde'];
  const covered = new Set<SampleEntry>();
  for (const { survey, absentFromDailySelection } of fixture.surveys) {
    const start = epoch(`${survey.year}-01-01`), end = epoch(`${survey.year + 1}-01-01`);
    const entries = fixture.events.filter(entry => entry.case.body === survey.body &&
      epoch(entry.case.start) >= start && epoch(entry.case.end) <= end);
    // Each body-year supplies at most the first observed event in each slot.
    // An absent daily-table slot is not evidence that the year has no event.
    assert.ok(entries.length > 0 && entries.length <= slots.length, survey.body);
    assert.deepEqual([...entries.map(entry => selectionKey(entry.case)),
      ...absentFromDailySelection.map(selectionKey)].sort(), slots, `${survey.body} ${survey.year}`);
    for (const entry of entries) {
      covered.add(entry);
      const { case: c, reference } = entry;
      assert.equal(c.command, survey.command);
      assert.equal(c.id, `${survey.body.toLowerCase()}-${survey.year}-${c.kind}-${c.direction}`);
      assert.equal(c.toleranceMs, thresholds[c.kind]);
      assert.equal(reference.direction, c.direction);
      assert.ok(epoch(c.start) < reference.atMs && reference.atMs <= epoch(c.end), c.id);
      assert.ok(Number.isSafeInteger(reference.atMs), c.id);
      assert.ok(reference.bracketMs.every(Number.isSafeInteger), c.id);
      assert.ok(reference.bracketMs[0] <= reference.atMs &&
        reference.atMs <= reference.bracketMs[1], c.id);
      if (c.kind === 'ingress') {
        assert.ok(c.targetDegrees !== undefined && c.targetDegrees >= 0 &&
          c.targetDegrees < 360 && c.targetDegrees % 30 === 0, c.id);
        assert.equal(reference.targetDegrees, c.targetDegrees);
      } else {
        assert.equal(c.targetDegrees, undefined);
        assert.equal(reference.targetDegrees, undefined);
      }
    }
  }
  assert.equal(covered.size, fixture.events.length);
  for (const kind of ['station', 'ingress']) for (const direction of ['direct', 'retrograde']) {
    assert.ok(fixture.events.some(entry => entry.case.kind === kind &&
      entry.case.direction === direction), `${kind} ${direction}`);
  }
});

const scans = [
  { id: 'hourly', name: 'original hourly', options: { stepMs: HOUR } },
  { id: 'station-aware', name: 'station-aware daily with six-hour speed cells',
    options: { stepMs: DAY, stationStepMs: 6 * HOUR } }
] as const;

test('timing evidence reproduces with the declared thresholds and retains the measured discrepancy', () => {
  execFileSync(process.execPath, ['scripts/sample-timing.mjs', '--check'],
    { cwd: project, encoding: 'utf8', stdio: 'pipe' });
  assert.equal(timingEvidence.reference, 'references/horizons-sample.json');
  assert.equal(timingEvidence.clock, fixture.clock);
  assert.deepEqual(timingEvidence.toleranceMs, thresholds);
  assert.deepEqual(timingEvidence.scans.map(scan => scan.id), scans.map(scan => scan.id));
  for (const scan of scans) {
    const evidence = timingEvidence.scans.find(candidate => candidate.id === scan.id)!;
    assert.deepEqual(evidence.options, scan.options);
    assert.deepEqual(evidence.cases.map(entry => entry.id), fixture.events.map(entry => entry.case.id));
    assert.ok(evidence.cases.every(entry => entry.matchedIdentities === 1));
    assert.deepEqual(evidence.cases.filter(entry => !entry.timingWithinThreshold).map(entry => entry.id),
      ['saturn-2050-ingress-direct']);
  }
});

for (const entry of fixture.events) for (const scan of scans) {
  const { case: c, reference } = entry;
  test(`broader independent TT ${c.id}: ${scan.name}`, () => {
    const context = new EvaluationContext({ startMs: epoch(c.start), endMs: epoch(c.end),
      clock: fixture.clock }, { maxEvaluations: 10000 });
    const result = c.kind === 'station'
      ? searchStations(context, c.body, scan.options)
      : searchSignIngresses(context, c.body, { ...scan.options, direction: c.direction });
    assert.equal(result.status, 'complete', c.id);
    for (const actual of result.events) {
      assert.equal(actual.kind, c.kind === 'station' ? 'station' : 'sign-ingress', c.id);
      assert.equal(actual.body, c.body, c.id);
      assert.equal(actual.clock, fixture.clock, c.id);
    }
    // The reference selects one identity, not every event in the padded window.
    const matches: readonly (Station | SignIngress)[] = result.events.filter(actual =>
      actual.direction === c.direction &&
      (actual.kind === 'station' || actual.longitude === c.targetDegrees));
    assert.equal(matches.length, 1, `${c.id}: expected one event with the reference identity`);
    const actual = matches[0]!;
    assert.equal(actual.direction, reference.direction, c.id);
    if (actual.kind === 'sign-ingress') {
      const above = c.targetDegrees! / 30, below = (above + SIGNS.length - 1) % SIGNS.length;
      assert.equal(actual.longitude, c.targetDegrees, c.id);
      assert.equal(actual.fromSign, SIGNS[c.direction === 'direct' ? below : above], c.id);
      assert.equal(actual.toSign, SIGNS[c.direction === 'direct' ? above : below], c.id);
    }
    const differenceMs = actual.atMs - reference.atMs;
    const withinThreshold = Math.abs(differenceMs) <= c.toleranceMs;
    const evidence = timingEvidence.scans.find(candidate => candidate.id === scan.id)!
      .cases.find(candidate => candidate.id === c.id)!;
    assert.equal(evidence.matchedIdentities, matches.length, c.id);
    assert.equal(evidence.timingWithinThreshold, withinThreshold, c.id);
    assert.equal(evidence.maxAbsoluteTimingErrorSecondsRoundedUp,
      Math.ceil(Math.abs(differenceMs) / 1000), c.id);
    // Keep the declared threshold and expose the measured failure explicitly.
    assert.equal(withinThreshold, c.id !== 'saturn-2050-ingress-direct',
      `${c.id}: ${scan.name} differs by ${differenceMs} ms against declared ${c.toleranceMs} ms`);
  });
}
