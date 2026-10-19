// Reproduce fixed-query evidence without downloading data or changing the engine.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { EvaluationContext, EngineRefused, searchSignIngresses, searchStations,
  searchLongitudeCrossings, searchExactAspects, searchEclipses } from '../build/src/index.js';
import { calendarWindow, compare, owns, summarize } from './completeness-match.mjs';

assert.ok(process.argv.length === 3 && ['--write', '--check'].includes(process.argv[2]),
  'Use --write to regenerate or --check to verify the committed evidence.');
const project = new URL('../', import.meta.url);
const bytes = path => readFileSync(new URL(path, project));
const json = path => JSON.parse(bytes(path));
const digest = data => createHash('sha256').update(data).digest('hex');
const planPath = 'references/completeness-plan.json';
const plan = json(planPath);
assert.equal(plan.schema, 1);
assert.equal(plan.clock, 'tt');
const hp = json(plan.horizonsSamplePlan), np = json(plan.nasaSamplePlan);
// Verify source reductions before measuring engine output. No live requests.
for (const [script, path] of [['horizons_sample.py', 'references/horizons-sample.json'],
  ['nasa_sample.py', 'references/nasa-sample.json'], ['horizons.py', 'references/horizons.json']]) {
  execFileSync('python3', [`scripts/${script}`, '--verify', path], { cwd: project, stdio: 'pipe' });
}
const original = json('references/horizons.json');
const loops = JSON.parse(execFileSync('python3', ['scripts/loops.py', '--json'],
  { cwd: project, encoding: 'utf8' }));
const horizons = json('references/horizons-sample.json'), nasa = json('references/nasa-sample.json');
assert.equal(horizons.clock, plan.clock);
assert.equal(nasa.clock, plan.clock);
assert.deepEqual(nasa.configuration, np);
const epoch = date => Date.parse(`${date}T00:00:00Z`);
const yearWindow = year => calendarWindow(epoch(`${year}-01-01`), epoch(`${year + 1}-01-01`));
const sourceWindow = c => ({ startMs: epoch(c.start), endMs: epoch(c.end) });
const directionKey = e => `${e.body}:${e.direction}`;
const ingressKey = e => `${directionKey(e)}:${e.longitude}`;
const aspectKey = e => `${directionKey(e)}:${e.relativeLongitude}`;
const queries = [];
function run(id, source, policy, coverage, window, expected, search, key, paddingMs = 0) {
  const ctx = new EvaluationContext({ startMs: window.startMs - paddingMs,
    endMs: window.endMs + paddingMs, clock: plan.clock },
  { maxEvaluations: plan.maxEvaluationsPerQuery });
  let result;
  try { result = search(ctx); }
  catch (error) {
    if (!(error instanceof EngineRefused)) throw error;
    result = { status: 'refused', reason: 'engine-refused', events: [], evaluations: ctx.evaluations };
  }
  const actual = result.events.filter(e => owns(window, e.atMs)).map(e => {
    assert.equal(e.clock, plan.clock);
    return { atMs: e.atMs, key: key(e), classification: e.classification };
  });
  const comparison = compare(expected, actual, coverage, result.status);
  queries.push({ id, source, policy, coverage, window: { ...window, clock: plan.clock }, paddingMs,
    status: result.status, ...(result.status === 'refused' ? { reason: result.reason } : {}),
    evaluations: result.evaluations, referenceIds: expected.map(e => e.id),
    ...comparison });
}
for (const policy of plan.policies) {
  for (const survey of hp.surveys) {
    for (const kind of ['station', 'ingress']) {
      const entries = horizons.events.filter(e => e.case.body === survey.body && e.case.kind === kind &&
        e.case.start.startsWith(String(survey.year)));
      const expected = entries.map(({ case: c, reference: r }) => ({ id: c.id, ...sourceWindow(c),
        atMs: r.atMs, toleranceMs: c.toleranceMs,
        key: kind === 'station' ? directionKey(c) : ingressKey({ ...c, longitude: c.targetDegrees }) }));
      const search = ctx => kind === 'station' ? searchStations(ctx, survey.body, policy.options)
        : searchSignIngresses(ctx, survey.body, policy.options);
      run(`${survey.body}-${survey.year}-${kind}`, 'horizons-sample', policy.id, 'sparse',
        yearWindow(survey.year), expected, search, kind === 'station' ? directionKey : ingressKey);
    }
  }
  for (const { case: c, atMs } of original.events) {
    const kind = c.kind;
    const key = kind === 'station' ? directionKey : kind === 'ingress' ? ingressKey : aspectKey;
    const expected = [{ id: c.id, ...sourceWindow(c), atMs, toleranceMs: c.toleranceMs,
      key: key({ ...c, longitude: c.targetDegrees, relativeLongitude: c.targetDegrees }) }];
    const search = ctx => kind === 'station' ? searchStations(ctx, c.body, policy.options)
      : kind === 'ingress' ? searchSignIngresses(ctx, c.body, policy.options)
      : searchExactAspects(ctx, c.body, kind === 'fixed-aspect'
        ? { kind: 'fixed', longitude: c.natalLongitude } : { kind: 'moving', body: c.otherBody },
      { aspects: [{ id: 'reference', angleDegrees: c.targetDegrees }] }, policy.options);
    run(c.id, 'horizons-original', policy.id, 'sparse', yearWindow(Number(c.start.slice(0, 4))),
      expected, search, key);
  }
}
for (const policy of plan.loopPolicies) {
  for (const c of loops.cases) {
    const window = sourceWindow(c);
    const expected = c.events.map((e, i) => ({ id: `${c.id}-${i}`, ...window,
      atMs: e.atMs, key: `${c.body}:${e.direction}`, toleranceMs: loops.toleranceMs }));
    for (const kind of ['longitude', 'fixed-aspect']) {
      const search = ctx => kind === 'longitude'
        ? searchLongitudeCrossings(ctx, c.body, c.targetDegrees, policy.options)
        : searchExactAspects(ctx, c.body, { kind: 'fixed', longitude: c.targetDegrees },
          { aspects: [{ id: 'conjunction', angleDegrees: 0 }] }, policy.options);
      run(`${c.id}-${kind}`, 'horizons-loops', policy.id, 'sparse', window, expected, search, directionKey);
    }
  }
}
const model = { sunRadiusAu: np.radiusKm.sun / np.auKm, moonRadiusAu: np.radiusKm.moon / np.auKm,
  earthRadiusAu: np.radiusKm.earth / np.auKm };
for (const year of np.years) {
  for (const kind of ['solar', 'lunar']) {
    const expected = nasa.events.filter(e => e.kind === kind && e.date.startsWith(String(year))).map(e =>
      ({ id: `${kind}:${e.catalogNumber}`, ...calendarWindow(epoch(e.date), epoch(e.date) + 86400000),
        atMs: e.atMs, key: kind, classification: e.classification, toleranceMs: np.toleranceMs }));
    run(`${kind}-${year}`, 'nasa-sample', 'catalog-hourly', 'catalog-year', yearWindow(year), expected,
      ctx => searchEclipses(ctx, kind, model, np.options), e => e.kind, np.options.derivativeStepMs);
  }
}
const group = selected => ({ queries: selected.length,
  completedQueries: selected.filter(q => q.status === 'complete').length,
  refusedQueries: selected.filter(q => q.status === 'refused').length,
  ...summarize(selected) });
// Bind all TypeScript source used by local bundles. Relative names and ordered
// bytes make this independent of checkout path and modification timestamps.
function sources(directory) {
  return readdirSync(new URL(directory, project), { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sources(path) : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
      ? [path] : [];
  });
}
const inputPaths = [planPath, plan.horizonsSamplePlan, plan.nasaSamplePlan,
  'references/horizons-sample.json', 'references/nasa-sample.json', 'references/horizons.json',
  'references/cases.json', 'references/loop-cases.json', 'scripts/completeness.mjs',
  'scripts/completeness-match.mjs', 'scripts/horizons.py', 'scripts/horizons_sample.py',
  'scripts/nasa_sample.py', 'scripts/nasa.py', 'scripts/loops.py', 'scripts/build.mjs', 'package-lock.json'];
const sourcePaths = [...sources('../src'), ...sources('src')];
const evidence = {
  schema: 1, clock: plan.clock, scope: plan.scope,
  inputs: Object.fromEntries(inputPaths.map(path => [path, digest(bytes(path))])),
  sourceSha256: digest(Buffer.concat(sourcePaths.flatMap(path => [Buffer.from(`${path}\0`), bytes(path), Buffer.from('\0')]))),
  parentVersion: json('../package.json').version,
  ephemerisVersion: json('package.json').dependencies['astronomy-engine'],
  matching: plan.matching,
  rounding: 'Raw millisecond errors decide timing acceptance. Absolute and mean errors round up to seconds; signed extrema round outward. Empty measurements are null.',
  counting: 'Totals count query-reference comparisons, including repeated comparisons across policies and equivalent longitude/aspect queries, not distinct sky events. Unmatched ambiguous candidates remain in unmatchedResults.',
  summary: group(queries),
  bySourceAndPolicy: [...new Set(queries.map(q => `${q.source}/${q.policy}`))].map(key => ({
    sourceAndPolicy: key, ...group(queries.filter(q => `${q.source}/${q.policy}` === key)) })),
  queries: queries.map(q => {
    const { errors: _errors, summary: _summary, ...metadata } = q;
    return { ...metadata, ...summarize([q]) };
  })
};
const destination = new URL('evidence/completeness.json', project);
const encoded = JSON.stringify(evidence, null, 2) + '\n';
assert.ok(Buffer.byteLength(encoded) < 2000000, 'Evidence exceeds the file size cap.');
if (process.argv[2] === '--write') {
  writeFileSync(destination, encoded);
  process.stdout.write('Fixed-query completeness evidence written\n');
} else {
  assert.ok(isDeepStrictEqual(evidence, JSON.parse(readFileSync(destination, 'utf8'))),
    'Completeness evidence differs. Rebuild, regenerate with --write, and review the changes.');
  process.stdout.write('Fixed-query completeness evidence reproduces\n');
}
