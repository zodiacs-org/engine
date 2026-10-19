import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const project = new URL('../../', import.meta.url);
const json = (path: string) => JSON.parse(readFileSync(new URL(path, project), 'utf8'));

test('completeness matching checks analytic ambiguity, ownership, refusal and timing independently', () => {
  execFileSync(process.execPath, ['scripts/completeness_test.mjs'],
    { cwd: project, stdio: 'pipe' });
});

test('fixed whole-year and loop query completeness evidence reproduces offline', () => {
  execFileSync(process.execPath, ['scripts/completeness.mjs', '--check'],
    { cwd: project, stdio: 'pipe' });
  const report = json('evidence/completeness.json');
  const plan = json('references/completeness-plan.json');
  assert.equal(plan.clock, 'tt');
  assert.equal(plan.maxEvaluationsPerQuery, 200000);
  assert.deepEqual(plan.policies, [
    { id: 'original', options: { stepMs: 86400000 } },
    { id: 'station-aware', options: { stepMs: 86400000, stationStepMs: 21600000 } }
  ]);
  assert.deepEqual(plan.loopPolicies, [
    { id: 'original', options: { stepMs: 172800000 } },
    { id: 'station-aware', options: { stepMs: 172800000, stationStepMs: 172800000 } }
  ]);
  assert.equal(report.queries.length, 60);
  assert.equal(new Set(report.queries.map((q: { source: string; policy: string; id: string }) =>
    `${q.source}/${q.policy}/${q.id}`)).size, report.queries.length);
  assert.equal(report.summary.refusedQueries, 0);
  assert.equal(report.summary.ambiguousReferences, 0);
  assert.equal(report.summary.unassessedReferences, 0);
  assert.equal(report.summary.referenceComparisons, 99);
  assert.equal(report.summary.foundResults, 181);
  assert.equal(report.summary.matchedReferences, 91);
  assert.equal(report.summary.missingReferences, 8);
  assert.equal(report.summary.unreferencedResults, 90);
  assert.equal(report.summary.catalogUnmatchedResults, 0);
  assert.equal(report.summary.timingOutsideThreshold, 10);
  assert.equal(report.summary.classificationMismatches, 1);
  for (const query of report.queries) {
    assert.equal(query.window.clock, 'tt');
    assert.equal(query.status, 'complete');
    assert.ok(query.evaluations > 0 && query.evaluations <= plan.maxEvaluationsPerQuery);
    assert.equal(query.referenceComparisons,
      query.matchedReferences + query.missingReferences + query.ambiguousReferences);
    assert.equal(query.foundResults, query.matchedReferences + query.unmatchedResults);
    assert.equal(query.unmatchedResults, query.unreferencedResults + query.catalogUnmatchedResults);
    assert.equal(query.matchedReferences, query.timingWithinThreshold + query.timingOutsideThreshold);
    if (query.source !== 'horizons-loops') {
      const first = new Date(query.window.startMs + 1);
      const next = new Date(query.window.endMs + 1);
      assert.equal(first.toISOString().slice(4), '-01-01T00:00:00.000Z');
      assert.equal(next.toISOString().slice(4), '-01-01T00:00:00.000Z');
      assert.equal(next.getUTCFullYear(), first.getUTCFullYear() + 1);
    }
    if (query.source === 'nasa-sample') {
      assert.equal(query.paddingMs, json(plan.nasaSamplePlan).options.derivativeStepMs);
      assert.equal(query.coverage, 'catalog-year');
      assert.equal(query.missingReferences, 0);
      assert.equal(query.timingOutsideThreshold, 0);
      assert.equal(query.classificationMismatches, query.id === 'solar-1950' ? 1 : 0);
    } else {
      assert.equal(query.coverage, 'sparse');
      if (query.source === 'horizons-loops') {
        assert.equal(query.referenceComparisons, 2);
        assert.equal(query.missingReferences, query.policy === 'original' ? 2 : 0);
        assert.equal(query.timingOutsideThreshold, query.policy === 'original' ? 0 : 2);
      } else {
        assert.equal(query.missingReferences, 0);
        assert.equal(query.timingOutsideThreshold, query.id === 'Saturn-2050-ingress' ? 1 : 0);
      }
    }
  }
  assert.deepEqual(report.queries.filter((q: { source: string }) => q.source === 'nasa-sample')
    .map((q: { id: string }) => q.id), json(plan.nasaSamplePlan).years
    .flatMap((year: number) => [`solar-${year}`, `lunar-${year}`]));
});
