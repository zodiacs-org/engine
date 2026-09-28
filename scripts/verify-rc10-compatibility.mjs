#!/usr/bin/env node
/**
 * Finite backward-compatibility check against an explicitly supplied rc.10 tree.
 * No network/install, no engine edits, no inference of numerical superiority.
 *
 * node scripts/verify-rc10-compatibility.mjs \
 *   --candidate /absolute/candidate.tgz \
 *   --baseline /absolute/frozen-package/dist/index.js \
 *   --output /absolute/compatibility.json
 *
 * Each side runs in a separate child process and separately copied module tree.
 * Both sides use identical, exact pinned dependency versions from the supplied
 * baseline. The report identifies precisely that dependency-controlled scope.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, relative, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const SCRIPT = fileURLToPath(import.meta.url);
const RC10 = '0.1.1-rc.10';
const HOUSES = ['whole', 'placidus', 'porphyry', 'equal', 'equal-mc', 'vehlow', 'koch',
  'regiomontanus', 'campanus', 'topocentric', 'alcabitius', 'morinus', 'meridian'];
const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const json = value => JSON.stringify(value, null, 2) + '\n';

// Preserve API-visible Dates, undefined, nonfinite numbers and negative zero
// through child-process JSON. No comparison tolerance or numeric rounding.
function capture(value) {
  if (value === undefined) return {$type: 'undefined'};
  if (value instanceof Date) return {$type: 'Date', value: value.toISOString()};
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
    return {$type: 'number', value: Object.is(value, -0) ? '-0' : String(value)};
  }
  if (Array.isArray(value)) return Array.from({length: value.length}, (_, i) =>
    i in value ? capture(value[i]) : {$type: 'array-hole'});
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, capture(value[key])]));
  }
  assert(['string', 'boolean', 'number'].includes(typeof value) || value === null,
    `Unsupported observed output type: ${typeof value}`);
  return value;
}
function differences(a, b, path = '$', output = {count: 0, examples: []}) {
  function add(why, first, second) {
    output.count++;
    if (output.examples.length < 20) output.examples.push({path, why, baseline: first, candidate: second});
  }
  if (Object.is(a, b)) return output;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    add('value-or-type', a, b); return output;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { add('array-versus-object', a, b); return output; }
  if (Array.isArray(a)) {
    if (a.length !== b.length) add('array-length', a.length, b.length);
    for (let i = 0; i < Math.min(a.length, b.length); i++) differences(a[i], b[i], `${path}[${i}]`, output);
    return output;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) {
      output.count++;
      if (output.examples.length < 20) output.examples.push({path: `${path}.${key}`, why: 'missing-or-extra-property',
        baselinePresent: Object.hasOwn(a, key), candidatePresent: Object.hasOwn(b, key)});
    } else differences(a[key], b[key], `${path}.${key}`, output);
  }
  return output;
}
function fixtures() {
  const charts = [];
  const places = [
    ['equator', '2000-01-01T12:00:00Z', 0, 0],
    ['north-temperate', '1990-07-15T03:45:30Z', 51.5074, -0.1278],
    ['south-temperate', '1985-11-20T18:10:00Z', -33.8688, 151.2093],
    ['north-polar', '2001-12-21T09:00:00Z', 78.2232, 15.6267],
    ['south-polar', '2001-06-21T00:00:00Z', -77.8419, 166.6863],
  ];
  for (const [place, utc, latitude, longitude] of places) for (const houseSystem of HOUSES) {
    charts.push({id: `${place}-${houseSystem}`, input: {utc, latitude, longitude, houseSystem}});
  }
  for (const [id, utc] of [
    ['historical-1600', '1600-06-15T03:00:00Z'],
    ['reference-before', '1799-12-31T23:59:59.999Z'],
    ['reference-start', '1800-01-01T00:00:00.000Z'],
    ['historical-1900', '1900-01-01T00:00:00Z'],
    ['leap-date', '2000-02-29T12:34:56.789Z'],
    ['modern-eclipse-date', '2024-04-08T18:21:00Z'],
    ['reference-last', '2199-12-31T23:59:59.999Z'],
    ['reference-end', '2200-01-01T00:00:00.000Z'],
    ['future-2300', '2300-06-15T03:00:00Z'],
  ]) charts.push({id, input: {utc, latitude: 13.7563, longitude: 100.5018, houseSystem: 'placidus'}});
  charts.push(
    {id: 'unknown-with-coordinates', input: {utc: '2000-02-29T08:30:00Z', latitude: 13.7563, longitude: 100.5018, timeKnown: false, houseSystem: 'koch'}},
    {id: 'unknown-no-location', input: {utc: '2000-02-29T08:30:00Z', timeKnown: false}},
    {id: 'known-no-location', input: {utc: '2000-02-29T08:30:00Z'}},
    {id: 'unknown-no-time-echo', input: {utc: '2000-02-29T08:30:00Z', timeKnown: false, flags: ['no-time', 'lmt', 'no-time', 'lmt']}},
    {id: 'polar-fallback-echo', input: {utc: '2001-12-21T09:00:00Z', latitude: 78.2232, longitude: 15.6267, houseSystem: 'placidus', flags: ['polar-fallback', 'polar-fallback']}},
    {id: 'asserted-gap', input: {utc: '2024-03-10T07:30:00Z', latitude: 40.7128, longitude: -74.006, flags: ['dst-gap', 'dst-gap']}},
    {id: 'asserted-fold', input: {utc: '2024-11-03T05:30:00Z', latitude: 40.7128, longitude: -74.006, flags: ['dst-fold']}},
    {id: 'asserted-lmt', input: {utc: '1880-01-01T05:17:21Z', latitude: 40.7128, longitude: -74.006, flags: ['lmt']}},
    {id: 'offset-spelling', input: {utc: '2000-01-01T19:00:00+07:00', latitude: 13.7563, longitude: 100.5018}},
    {id: 'date-only', input: {utc: '2000-02-29', timeKnown: false}},
    {id: 'numeric-instant', input: {utc: 0, latitude: 0, longitude: 180}},
    {id: 'date-object', utcKind: 'Date', input: {utc: '2000-02-29T12:00:00Z', latitude: 0, longitude: -180}},
  );
  for (const [id, utc, deltaT] of [
    ['pinned-zero', '2000-01-01T12:00:00Z', 0],
    ['pinned-modern', '2024-04-08T18:21:00Z', 64.7],
    ['pinned-historical', '1600-06-15T03:00:00Z', 120],
    ['pinned-negative', '1900-01-01T00:00:00Z', -2],
    ['pinned-unknown', '2000-02-29T08:30:00Z', 80],
  ]) charts.push({id, input: {utc, latitude: 13.7563, longitude: 100.5018, houseSystem: 'equal-mc',
    deltaT, ...(id === 'pinned-unknown' ? {timeKnown: false} : {})}});
  const invalid = [
    {id: 'invalid-leap-day', input: {utc: '2023-02-29T12:00:00Z'}},
    {id: 'missing-offset', input: {utc: '2000-01-01T12:00:00'}},
    {id: 'unsupported-house', input: {utc: '2000-01-01', houseSystem: 'unsupported'}},
    {id: 'null-house', input: {utc: '2000-01-01', houseSystem: null}},
    {id: 'null-time-known', input: {utc: '2000-01-01', timeKnown: null}},
    {id: 'latitude-out-of-range', input: {utc: '2000-01-01', latitude: 91, longitude: 0}},
    {id: 'partial-location', input: {utc: '2000-01-01', latitude: 0}},
    {id: 'contradictory-dst-flags', input: {utc: '2000-01-01', flags: ['dst-gap', 'dst-fold']}},
    {id: 'false-no-time-echo', input: {utc: '2000-01-01', flags: ['no-time']}},
    {id: 'false-polar-echo', input: {utc: '2000-01-01', latitude: 0, longitude: 0, flags: ['polar-fallback']}},
    {id: 'delta-t-too-large', input: {utc: '2000-01-01', deltaT: 1e11}},
  ];
  const edges = [{id: 'exact-geographic-pole', input: {utc: '2000-01-01', latitude: 90, longitude: 0}}];
  return {schema: 'zodiacs.rc10-compatibility-fixtures.v1', charts, invalid, edges};
}
function materialize(test) {
  const input = structuredClone(test.input);
  if (test.utcKind === 'Date') input.utc = new Date(input.utc);
  return input;
}
function errorRecord(error) {
  return capture({name: error?.name, message: error?.message, code: error?.code});
}
async function worker(packageRoot, fixtureFile, outputFile, baselineOutput) {
  // The two workers never coexist in one JS process, even if a module were to
  // mutate Astronomy Engine's global DeltaT callback or other singleton state.
  globalThis.fetch = () => { throw new Error('Network is forbidden in compatibility worker'); };
  const api = await import(pathToFileURL(join(packageRoot, 'dist/index.js')).href);
  const codec = await import(pathToFileURL(join(packageRoot, 'dist/receipt.js')).href);
  const manifest = readJson(join(packageRoot, 'package.json'));
  assert.equal(api.ENGINE_VERSION, manifest.version, 'Runtime/package engine version mismatch');
  const suite = readJson(fixtureFile);
  const observations = [];
  const operationTrace = [];
  const call = (label, fn) => { operationTrace.push(label); return fn(); };
  for (const test of suite.charts) {
    const observation = {id: test.id, input: test.input};
    try {
      const chart = call(`${test.id}:natalChart`, () => api.natalChart(materialize(test)));
      const envelope = call(`${test.id}:createNatalEnvelope`, () => codec.createNatalEnvelope(chart));
      const encoded = call(`${test.id}:serializeNatalEnvelope`, () => codec.serializeNatalEnvelope(envelope));
      const decoded = call(`${test.id}:parseNatalEnvelope`, () => codec.parseNatalEnvelope(encoded));
      assert.equal(decoded.ok, true, `${test.id}: own receipt parse failed`);
      const replayInput = call(`${test.id}:natalReplayInput`, () => codec.natalReplayInput(decoded.envelope));
      const replayed = call(`${test.id}:natalChart-self-replay`, () => api.natalChart(replayInput));
      const row = {chart, points: call(`${test.id}:chartPoints`, () => api.chartPoints(chart)), envelope, decoded, replayInput, replayed,
        diagnostic: call(`${test.id}:redactNatalEnvelope`, () => codec.redactNatalEnvelope(decoded.envelope))};
      // Pinning must not contaminate later calls that use the default clock.
      row.defaultPositionsAfter = call(`${test.id}:positions-after`, () => api.positions('2000-01-01T12:00:00Z'));
      observations.push({...observation, status: 'ok', observed: capture(row), receiptText: encoded});
    } catch (error) { observations.push({...observation, status: 'error', error: errorRecord(error)}); }
  }
  const invalid = suite.invalid.map(test => {
    try { return {id: test.id, status: 'unexpected-success', observed: capture(call(`${test.id}:natalChart-invalid`, () => api.natalChart(materialize(test))))}; }
    catch (error) { return {id: test.id, status: 'error', error: errorRecord(error)}; }
  });
  const extras = [];
  for (const utc of ['1600-06-15T03:00:00Z', '2000-02-29T12:00:00Z', '2024-04-08T18:21:00Z', '2200-01-01T00:00:00Z']) {
    extras.push({id: `positions-phase-${utc}`, observed: capture({positions: call(`extras:${utc}:positions`, () => api.positions(utc)), moonPhase: call(`extras:${utc}:moonPhase`, () => api.moonPhase(utc)), outsideReferenceSpan: call(`extras:${utc}:outsideReferenceSpan`, () => api.outsideReferenceSpan(new Date(utc)))})});
  }
  const first = call('extras:first-chart', () => api.natalChart({utc: '1990-07-15T03:45:30Z', latitude: 51.5074, longitude: -0.1278, houseSystem: 'placidus'}));
  const second = call('extras:second-chart', () => api.natalChart({utc: '1985-11-20T18:10:00Z', timeKnown: false}));
  extras.push({id: 'transits', observed: capture(call('extras:transits', () => api.transits(first, '2024-04-08T18:21:00Z')))});
  extras.push({id: 'synastry', observed: capture(call('extras:synastry', () => api.synastry(first, second)))});
  for (const edge of suite.edges) {
    const chart = call(`${edge.id}:natalChart-edge`, () => api.natalChart(materialize(edge)));
    let receipt;
    try { receipt = {status: 'ok', envelope: call(`${edge.id}:createNatalEnvelope-edge`, () => codec.createNatalEnvelope(chart))}; }
    catch (error) { receipt = {status: 'error', error: errorRecord(error)}; }
    extras.push({id: edge.id, observed: capture({chart, receipt})});
  }
  const malformedReceipts = ['{', '{}', JSON.stringify({schema: 'future-unsupported'})]
    .map((text, i) => ({text, result: capture(call(`malformed-receipt:${i}`, () => codec.parseNatalEnvelope(text)))}));
  const crossReplay = [];
  // Match late-replay operation order in both workers. Comparing a late run to
  // an earlier run could instead measure the dependency's cache/call history.
  const replaySources = baselineOutput ? readJson(baselineOutput).observations : observations;
  for (const base of replaySources) {
    if (base.status !== 'ok') continue;
    try {
      const parsed = call(`${base.id}:late-parse-rc10`, () => codec.parseNatalEnvelope(base.receiptText));
      assert.equal(parsed.ok, true, `${base.id}: candidate refused baseline rc.10 receipt`);
      const input = call(`${base.id}:late-replay-input-rc10`, () => codec.natalReplayInput(parsed.envelope));
      crossReplay.push({id: base.id, status: 'ok', decoded: capture(parsed), replayInput: capture(input),
        chart: capture(call(`${base.id}:late-chart-rc10`, () => api.natalChart(input)))});
    } catch (error) { crossReplay.push({id: base.id, status: 'error', error: errorRecord(error)}); }
  }
  writeFileSync(outputFile, json({engineVersion: api.ENGINE_VERSION, ephemeris: api.EPHEMERIS,
    exportedNames: Object.keys(api).sort(), receiptExportedNames: Object.keys(codec).sort(),
    houseSystems: api.HOUSE_SYSTEMS, observations, invalid, extras, malformedReceipts, crossReplay, operationTrace}));
}
function normalizedObserved(value, kind) {
  const out = structuredClone(value);
  const chartVersion = chart => { if (chart && Object.hasOwn(chart, 'engineVersion')) chart.engineVersion = '<engine-version-metadata>'; };
  const envelopeVersion = envelope => {
    if (envelope?.receipt?.engine && Object.hasOwn(envelope.receipt.engine, 'version')) envelope.receipt.engine.version = '<engine-version-metadata>';
  };
  if (kind === 'row') {
    chartVersion(out.chart); chartVersion(out.replayed); envelopeVersion(out.envelope); envelopeVersion(out.decoded?.envelope);
  } else if (kind === 'transits') chartVersion(out.natal);
  else if (kind === 'synastry') { chartVersion(out.a); chartVersion(out.b); }
  else if (kind === 'chart') chartVersion(out);
  else if (kind === 'exact-geographic-pole') chartVersion(out.chart);
  return out;
}
function filesUnder(root) {
  const files = [];
  function visit(path) {
    for (const entry of readdirSync(path, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = join(path, entry.name);
      assert(!entry.isSymbolicLink(), `Unexpected symlink in copied module tree: ${next}`);
      if (entry.isDirectory()) visit(next);
      else if (entry.isFile()) files.push({path: relative(root, next).split(sep).join('/'), sha256: hash(readFileSync(next))});
    }
  }
  visit(root);
  return files;
}
function baselineRoot(path) {
  const real = realpathSync(path);
  const root = statSync(real).isDirectory() ? real : dirname(dirname(real));
  assert(existsSync(join(root, 'dist/index.js')) && existsSync(join(root, 'package.json')), 'Baseline must be package directory or its dist/index.js');
  if (!statSync(real).isDirectory()) assert.equal(real, realpathSync(join(root, 'dist/index.js')), 'Baseline file must be dist/index.js');
  return root;
}
function stage(candidatePath, baselinePath, directory) {
  const root = baselineRoot(baselinePath);
  const oldManifest = readJson(join(root, 'package.json'));
  assert.equal(oldManifest.name, '@zodiacs/engine'); assert.equal(oldManifest.version, RC10);
  assert(existsSync(join(root, 'node_modules')), 'Frozen baseline must include its installed dependencies');
  const baseline = join(directory, 'baseline-package');
  cpSync(root, baseline, {recursive: true, dereference: true});
  const extraction = join(directory, 'candidate-extraction'); mkdirSync(extraction);
  const artifact = realpathSync(candidatePath);
  assert(statSync(artifact).isFile() && /\.tgz$/.test(artifact), 'Candidate must be an npm-packed .tgz file');
  const listing = execFileSync('tar', ['-tzf', artifact], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}).trim().split('\n');
  for (const name of listing) assert(name.startsWith('package/') && !name.split('/').includes('..') && !name.includes('\\'), 'Unsafe tar member path');
  const detailed = execFileSync('tar', ['-tvzf', artifact], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}).trim().split('\n');
  assert(detailed.every(line => line.startsWith('-') || line.startsWith('d')), 'Symlinks and special tar entries are not accepted');
  execFileSync('tar', ['-xzf', artifact, '--no-same-owner', '--no-same-permissions', '-C', extraction]);
  const candidate = join(extraction, 'package');
  const newManifest = readJson(join(candidate, 'package.json'));
  assert.equal(newManifest.name, '@zodiacs/engine');
  assert.deepEqual(newManifest.dependencies, oldManifest.dependencies,
    'Dependency-controlled comparison requires exactly the same dependency declarations');
  assert(!existsSync(join(candidate, 'node_modules')), 'Candidate tarball must not bundle a separate dependency tree');
  cpSync(join(baseline, 'node_modules'), join(candidate, 'node_modules'), {recursive: true, dereference: true});
  for (const [name, version] of Object.entries(oldManifest.dependencies ?? {})) {
    assert(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version), `Dependency must be exactly pinned: ${name}`);
    assert.equal(readJson(join(baseline, 'node_modules', name, 'package.json')).version, version, `Installed baseline dependency differs: ${name}`);
  }
  const baselineFiles = filesUnder(baseline), candidateFiles = filesUnder(candidate);
  const deps = list => list.filter(file => file.path.startsWith('node_modules/'));
  assert.deepEqual(deps(baselineFiles), deps(candidateFiles), 'Copied dependency trees differ');
  return {baseline, candidate, metadata: {
    baseline: {sourcePath: realpathSync(baselinePath), packageVersion: oldManifest.version, fileInventorySha256: hash(json(baselineFiles)), files: baselineFiles},
    candidate: {artifactPath: artifact, artifactSha256: hash(readFileSync(artifact)), packageVersion: newManifest.version, fileInventorySha256: hash(json(candidateFiles)), files: candidateFiles},
    dependencies: {declarations: oldManifest.dependencies, identicalSeparateCopies: true, source: 'supplied frozen baseline node_modules', inventorySha256: hash(json(deps(baselineFiles)))}},
  };
}
function compareObservations(baseline, candidate, suite) {
  const checks = [];
  const push = (id, first, second, precondition = true) => {
    const mismatch = differences(first, second);
    checks.push({id, passed: precondition && mismatch.count === 0, mismatchCount: mismatch.count, mismatches: mismatch.examples,
      ...(!precondition ? {failure: 'Expected operation did not succeed, or expected rejection did not occur'} : {})});
  };
  push('all-13-house-systems', HOUSES, candidate.houseSystems);
  push('baseline-all-13-house-systems', HOUSES, baseline.houseSystems);
  push('ephemeris-identity', baseline.ephemeris, candidate.ephemeris);
  push('identical-public-operation-order', baseline.operationTrace, candidate.operationTrace);
  for (const [name, list] of [['main', 'exportedNames'], ['receipt', 'receiptExportedNames']]) {
    const missing = baseline[list].filter(key => !candidate[list].includes(key));
    push(`${name}-legacy-export-preservation`, [], missing);
  }
  for (let i = 0; i < suite.charts.length; i++) {
    const old = baseline.observations[i], next = candidate.observations[i];
    assert.equal(old?.id, suite.charts[i].id); assert.equal(next?.id, old.id);
    const ok = old.status === 'ok' && next.status === 'ok';
    push(`chart-and-receipt:${old.id}`, ok ? normalizedObserved(old.observed, 'row') : old,
      ok ? normalizedObserved(next.observed, 'row') : next, ok);
    if (ok) {
      // Self replay can intentionally pin the recorded DeltaT. Compare its
      // calculation results, retaining source metadata comparisons between sides.
      for (const [label, row] of [['baseline', old], ['candidate', next]]) {
        const before = row.observed.chart, after = row.observed.replayed;
        push(`${label}-self-replay:${old.id}`, capture({bodies: before.bodies, angles: before.angles, houses: before.houses, aspects: before.aspects, flags: before.flags}),
          capture({bodies: after.bodies, angles: after.angles, houses: after.houses, aspects: after.aspects, flags: after.flags}));
      }
      const cross = candidate.crossReplay.find(row => row.id === old.id);
      const oldCross = baseline.crossReplay.find(row => row.id === old.id);
      push(`candidate-parses-rc10:${old.id}`, old.observed.decoded, cross?.decoded, cross?.status === 'ok');
      push(`candidate-replays-rc10:${old.id}`, oldCross?.chart ? normalizedObserved(oldCross.chart, 'chart') : oldCross,
        cross?.chart ? normalizedObserved(cross.chart, 'chart') : cross, oldCross?.status === 'ok' && cross?.status === 'ok');
      push(`candidate-rc10-replay-request:${old.id}`, old.observed.replayInput, cross?.replayInput, cross?.status === 'ok');
    }
  }
  for (let i = 0; i < suite.invalid.length; i++) {
    const first = baseline.invalid[i], second = candidate.invalid[i];
    push(`invalid-input:${suite.invalid[i].id}`, first, second, first?.status === 'error' && second?.status === 'error');
  }
  for (let i = 0; i < baseline.extras.length; i++) {
    const first = baseline.extras[i], second = candidate.extras[i];
    assert.equal(first.id, second?.id);
    push(`legacy-api:${first.id}`, normalizedObserved(first.observed, first.id), normalizedObserved(second.observed, second.id));
  }
  push('malformed-receipt-rejections', baseline.malformedReceipts, candidate.malformedReceipts);
  const seed = baseline.observations.find(row => row.status === 'ok');
  assert(seed, 'No successful baseline chart for negative control');
  const tampered = structuredClone(seed.observed);
  tampered.chart.bodies[0].lon += 0.000001;
  const negative = differences(normalizedObserved(seed.observed, 'row'), normalizedObserved(tampered, 'row'));
  return {checks, negativeControl: {passed: negative.count > 0, injectedChange: 'Clone of one observed Sun longitude increased by 0.000001 degrees; no artifact altered.',
    mismatchCount: negative.count, mismatches: negative.examples}};
}
function differentCallHistoryDiagnostics(snapshot) {
  const changed = [];
  for (const early of snapshot.observations) {
    const late = snapshot.crossReplay.find(row => row.id === early.id);
    if (early.status !== 'ok' || late?.status !== 'ok') continue;
    const mismatch = differences(normalizedObserved(early.observed.replayed, 'chart'), normalizedObserved(late.chart, 'chart'));
    if (mismatch.count) changed.push({id: early.id, mismatchCount: mismatch.count, mismatches: mismatch.examples});
  }
  return {meaning: 'Same artifact and input, earlier versus later calls in this worker; different call history, not a cross-version comparison.',
    differingCases: changed.length, cases: changed};
}
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--worker') return worker(args[1], args[2], args[3], args[4] || null);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(['--candidate', '--baseline', '--output'].includes(args[i]) && args[i + 1], 'Usage: --candidate /absolute/engine.tgz --baseline /absolute/frozen-package[/dist/index.js] [--output /absolute/evidence.json]');
    assert(!Object.hasOwn(options, args[i]), `Duplicate argument ${args[i]}`);
    options[args[i]] = args[i + 1];
    assert(isAbsolute(args[i + 1]), 'All supplied paths must be absolute');
  }
  assert(options['--candidate'] && options['--baseline'], 'Candidate and baseline arguments are required');
  const directory = mkdtempSync(join(tmpdir(), 'zodiacs-rc10-compatibility-'));
  const startedAt = new Date().toISOString();
  try {
    const staged = stage(options['--candidate'], options['--baseline'], directory);
    const suite = fixtures();
    const fixturePath = join(directory, 'fixtures.json'), oldPath = join(directory, 'baseline.json'), newPath = join(directory, 'candidate.json');
    writeFileSync(fixturePath, json(suite));
    const run = args => execFileSync(process.execPath, [SCRIPT, '--worker', ...args], {
      encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    run([staged.baseline, fixturePath, oldPath]);
    run([staged.candidate, fixturePath, newPath, oldPath]);
    const old = readJson(oldPath), next = readJson(newPath);
    const compared = compareObservations(old, next, suite);
    const failures = compared.checks.filter(check => !check.passed);
    const report = {schema: 'zodiacs.rc10-compatibility-report.v1', startedAt, completedAt: new Date().toISOString(),
      status: failures.length === 0 && compared.negativeControl.passed ? 'pass' : 'fail', runtime: {node: process.version, platform: process.platform, arch: process.arch},
      scope: 'Finite exact legacy-behavior comparison of a packed candidate against a caller-supplied frozen rc.10 package, with identical copied pinned dependencies in separate processes.',
      limitations: ['This is not an independent astronomical accuracy reference, exhaustive compatibility proof, Swiss equivalence claim, or test of the new optional APIs.',
        'It does not test every date, place, host runtime, or transit/return search. Source ancestry and artifact authenticity are not inferred from package versions.',
        'The exact geographic pole fixture checks observed chart acceptance and receipt refusal, not mathematical validity of its angles.',
        'Only known engine version metadata fields are normalized; numerical fields, types, ordering, flags, DeltaT values and provenance, receipt conventions, and requested/effective houses are compared without tolerance.'],
      metadata: staged.metadata, fixtureSha256: hash(json(suite)), fixtures: suite,
      normalization: ['chart.engineVersion', 'replayed.engineVersion', 'envelope.receipt.engine.version', 'decoded.envelope.receipt.engine.version', 'transits.natal.engineVersion', 'synastry.a.engineVersion', 'synastry.b.engineVersion', 'exact-geographic-pole.chart.engineVersion'],
      summary: {chartCases: suite.charts.length, invalidInputCases: suite.invalid.length, legacyApiCases: old.extras.length,
        checks: compared.checks.length, passed: compared.checks.length - failures.length, failed: failures.length,
        rc10ReceiptsReplayedByCandidate: next.crossReplay.filter(row => row.status === 'ok').length,
        addedMainExports: next.exportedNames.filter(key => !old.exportedNames.includes(key))},
      baselineObservationSha256: hash(readFileSync(oldPath)), candidateObservationSha256: hash(readFileSync(newPath)),
      operationTrace: {callsPerWorker: old.operationTrace.length, identical: JSON.stringify(old.operationTrace) === JSON.stringify(next.operationTrace),
        baselineSha256: hash(json(old.operationTrace)), candidateSha256: hash(json(next.operationTrace)), calls: old.operationTrace},
      differentCallHistoryDiagnostics: {baseline: differentCallHistoryDiagnostics(old), candidate: differentCallHistoryDiagnostics(next)},
      negativeControl: compared.negativeControl, checks: compared.checks};
    if (options['--output']) writeFileSync(options['--output'], json(report));
    process.stdout.write(json(report));
    if (report.status !== 'pass') process.exitCode = 1;
  } finally { rmSync(directory, {recursive: true, force: true}); }
}
main().catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
