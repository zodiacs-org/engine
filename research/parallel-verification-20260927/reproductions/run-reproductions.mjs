#!/usr/bin/env node
/** Black-box observations against an explicitly supplied local engine build. */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--engine', '--tarball', '--source-ref', '--output'].includes(args[i]) || !args[i + 1]) {
    throw new Error('Usage: node run-reproductions.mjs --engine /absolute/path/dist/index.js [--tarball /absolute/path.tgz] [--source-ref commit] [--output /absolute/path/results.json]');
  }
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.engine || !path.isAbsolute(options.engine)) throw new Error('--engine must be an absolute path.');
const entry = await realpath(options.engine);
const dist = path.dirname(entry);
const packageRoot = path.dirname(dist);
const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const artifactFiles = [];
for (const file of (await readdir(dist)).filter(name => /\.(?:js|mjs|cjs|d\.ts)$/.test(name)).sort()) {
  const bytes = await readFile(path.join(dist, file));
  artifactFiles.push({ path: `dist/${file}`, bytes: bytes.length, sha256: hash(bytes) });
}
const engine = await import(pathToFileURL(entry).href);
const angularDifference = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const saturnOf = chart => chart.bodies.find(body => body.body === 'Saturn').lon;
const sourceRoot = `https://github.com/zodiacs-org/engine/blob/${options['source-ref'] || 'f5f33892a95cd0d6cd4a11a80e66f802b11bccfa'}`;
const startedAt = new Date().toISOString();
const observations = [];

// The ordinary and pinned births below are synthetic public test inputs.
const birth = { utc: '1990-02-01T12:00:00Z', timeKnown: false };
const baseline = engine.natalChart(birth);
const baselineReturn = engine.saturnReturn(birth);
const pinnedRows = [];
for (const extraSeconds of [1, 3600]) {
  const pinnedBirth = { ...birth, deltaT: baseline.deltaT.seconds + extraSeconds };
  const chart = engine.natalChart(pinnedBirth);
  const fromBirth = engine.saturnReturn(pinnedBirth);
  const fromChart = engine.saturnReturn(chart);
  pinnedRows.push({
    extraSeconds,
    purpose: extraSeconds === 1 ? 'small accepted clock override' : 'accepted synthetic diagnostic; not an estimate of actual clock error',
    pinSeconds: pinnedBirth.deltaT,
    chartModel: chart.deltaT.model,
    chartNatalLongitude: saturnOf(chart),
    birthReturnNatalLongitude: fromBirth.natalLon,
    chartReturnNatalLongitude: fromChart.natalLon,
    chartShiftArcseconds: angularDifference(saturnOf(chart), saturnOf(baseline)) * 3600,
    birthReturnMismatchArcseconds: angularDifference(fromBirth.natalLon, saturnOf(chart)) * 3600,
    chartReturnMismatchArcseconds: angularDifference(fromChart.natalLon, saturnOf(chart)) * 3600,
    birthReturnUnchanged: JSON.stringify(fromBirth) === JSON.stringify(baselineReturn),
    chartReturnUnchanged: JSON.stringify(fromChart) === JSON.stringify(baselineReturn),
    firstReturnedCrossing: fromChart.seasons[0]?.crossings[0]?.at.toISOString() ?? null,
  });
}
const pinMismatch = pinnedRows.some(row => row.chartShiftArcseconds > 1e-6 && row.chartReturnMismatchArcseconds > 1e-6 && row.chartReturnUnchanged);
observations.push({
  id: 'saturn-return-birth-clock',
  category: 'contract-gap',
  status: pinMismatch ? 'reproduced' : 'not-reproduced',
  severity: 'moderate-for-callers-using-pinned-deltaT',
  expected: 'A return calculated from an engine-created pinned natal chart should use that chart\'s natal Saturn target, or explicitly reject/document the unsupported clock override. This is a proposed consistency requirement; the existing return API does not explicitly promise pin support.',
  actual: { birth, baselineDeltaT: baseline.deltaT, baselineNatalLongitude: saturnOf(baseline), baselineReturnNatalLongitude: baselineReturn.natalLon, rows: pinnedRows },
  interpretation: 'The natal pin is honored by natalChart but may be silently discarded by saturnReturn. This demonstrates an API consistency problem, not an independent astronomical accuracy result. No correction to future-event clocks is inferred.',
  sources: [`${sourceRoot}/src/api.ts`, `${sourceRoot}/src/returns.ts`, `${sourceRoot}/src/types.ts`, `${sourceRoot}/README.md`],
});

// Independent geometry path within the SAME dependency, not an independent ephemeris.
// Explicitly put its CJS module on the engine's clock to remove default ΔT differences.
let illuminationReference;
try {
  const require = createRequire(entry);
  const referenceEntry = require.resolve('astronomy-engine');
  const astronomy = require('astronomy-engine');
  astronomy.SetDeltaTFunction(engine.deltaT);
  const samples = [];
  for (let day = 0; day < 33; day++) {
    const date = new Date(Date.UTC(2026, 8, 1 + day, 12));
    const reported = engine.moonPhase(date);
    const reference = astronomy.Illumination(astronomy.Body.Moon, date);
    const formula = (1 - Math.cos(reported.angle * Math.PI / 180)) / 2;
    samples.push({ utc: date.toISOString(), longitudeElongationDegrees: reported.angle,
      reportedIllumination: reported.illumination, longitudeOnlyFormula: formula,
      geometryReferenceIllumination: reference.phase_fraction,
      geometryReferencePhaseAngleDegrees: reference.phase_angle,
      signedDifference: reported.illumination - reference.phase_fraction,
      differencePercentagePoints: 100 * (reported.illumination - reference.phase_fraction) });
  }
  const worst = samples.reduce((a, b) => Math.abs(b.signedDifference) > Math.abs(a.signedDifference) ? b : a);
  illuminationReference = { dependency: engine.EPHEMERIS, resolvedEntry: referenceEntry,
    entrySha256: hash(await readFile(referenceEntry)), clock: 'engine.deltaT explicitly installed',
    independence: 'same astronomical dependency; separate phase-geometry computation, not JPL/Swiss validation' };
  observations.push({ id: 'moon-illumination-approximation', category: 'documented-scope-clarification', status: 'measured', severity: 'low',
    expected: 'If illumination is advertised as a physical illuminated fraction, define its geometry and precision. A longitude-only display approximation is legitimate if labeled accordingly.',
    actual: { sampleCount: samples.length, from: samples[0].utc, to: samples.at(-1).utc,
      maximumAbsoluteDifferencePercentagePoints: Math.abs(worst.differencePercentagePoints), worst,
      matchesLongitudeOnlyFormula: samples.every(row => Math.abs(row.reportedIllumination - row.longitudeOnlyFormula) <= 1e-15), samples },
    interpretation: 'This is a model/documentation limitation, not a newly proven defect or claimed failure versus ground truth. Moon phase angle for zodiac events can remain an intentional longitude elongation. No 33-day result is a global error bound.',
    sources: [`${sourceRoot}/src/api.ts`, `${sourceRoot}/src/types.ts`, `${sourceRoot}/README.md`, 'https://github.com/cosinekitty/astronomy/blob/master/source/js/astronomy.ts'] });
} catch (error) {
  observations.push({ id: 'moon-illumination-approximation', category: 'documented-scope-clarification', status: 'blocked', severity: 'unassessed', expected: 'Installed astronomy-engine dependency available for a same-model geometry comparison.', actual: { error: String(error) }, interpretation: 'No measured illumination result is asserted.' });
}

const guards = [];
function rejects(name, call) {
  try { call(); guards.push({ name, expected: 'RangeError', actual: 'accepted', pass: false }); }
  catch (error) { guards.push({ name, expected: 'RangeError', actual: error.name, pass: error instanceof RangeError }); }
}
rejects('invalid-calendar-date', () => engine.natalChart({ utc: '2026-02-30T12:00:00Z' }));
rejects('nonfinite-pin', () => engine.natalChart({ ...birth, deltaT: Infinity }));
rejects('contradictory-derived-polar-flag', () => engine.natalChart({ utc: birth.utc, latitude: 0, longitude: 0, houseSystem: 'placidus', flags: ['polar-fallback'] }));
const unknown = engine.natalChart({ utc: birth.utc, latitude: 40, longitude: 10, timeKnown: false });
const unknownPoints = engine.chartPoints(unknown);
guards.push({ name: 'unknown-time-withholds-angles-houses-lots', expected: 'null angles/houses/sect, no-time flag, three time-dependent mean lunar points only', actual: { angles: unknown.angles, houses: unknown.houses, flags: unknown.flags, sect: unknownPoints.sect, points: unknownPoints.points.map(p => p.point) }, pass: unknown.angles === null && unknown.houses === null && unknown.flags.includes('no-time') && unknownPoints.sect === null && unknownPoints.points.length === 3 });
const afterPin = engine.natalChart(birth);
const restoredDifference = Math.max(...baseline.bodies.map((body, index) => angularDifference(body.lon, afterPin.bodies[index].lon)));
guards.push({ name: 'pin-does-not-leak-into-later-natal-chart', expected: 'engine model restored; baseline reproduced within 1e-9 degrees', actual: { model: afterPin.deltaT.model, maximumLongitudeDifferenceDegrees: restoredDifference }, pass: afterPin.deltaT.model === baseline.deltaT.model && restoredDifference <= 1e-9 });
observations.push({ id: 'public-boundary-controls', category: 'control', status: guards.every(g => g.pass) ? 'passed' : 'failed', severity: guards.every(g => g.pass) ? 'none' : 'needs-review', expected: 'Existing documented guards remain intact.', actual: { guards }, interpretation: 'A few targeted controls, not an exhaustive API/security audit.' });

const result = { schemaVersion: 'zodiacs-parallel-reproductions/1', startedAt, completedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  engine: { entry, packageName: packageJson.name, packageVersion: packageJson.version, runtimeVersion: engine.ENGINE_VERSION,
    sourceRef: options['source-ref'] || null, sourceRefStatus: 'caller-supplied, not attested by package',
    ephemeris: engine.EPHEMERIS, packageJsonSha256: hash(await readFile(path.join(packageRoot, 'package.json'))),
    distributionFileManifestSha256: hash(JSON.stringify(artifactFiles)), artifactFiles,
    tarball: options.tarball ? { path: path.resolve(options.tarball), sha256: hash(await readFile(options.tarball)) } : null },
  illuminationReference: illuminationReference || null,
  scope: { productionWrites: false, internetRequests: false, finiteCasesOnly: true, numericalCertification: false, existingReleaseGatesChanged: false },
  observations };
const output = options.output || path.join(path.dirname(fileURLToPath(import.meta.url)), 'results.json');
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, engine: engine.ENGINE_VERSION, observations: observations.map(({ id, status, category }) => ({ id, status, category })) }, null, 2));
if (observations.some(o => o.status === 'blocked' || o.status === 'failed')) process.exitCode = 1;
