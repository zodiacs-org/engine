#!/usr/bin/env node
/** Black-box check of two preselected lunations; no Swiss dependency. */
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--engine', '--tarball', '--output', '--references', '--expect-version'].includes(args[i]) || !args[i + 1]) {
    throw new Error('Usage: node compare-events.mjs --engine /path/to/dist/index.js [--expect-version 0.1.1-rc.10] [--tarball /path/to/rc10.tgz] [--references references.json] [--output measured.json]');
  }
  options[args[i]] = args[i + 1];
}
if (!options['--engine']) throw new Error('--engine is required; supply a candidate public entry point');
const hash = value => createHash('sha256').update(value).digest('hex');
const protocolBytes = await readFile(resolve(here, 'protocol.json'));
const protocol = JSON.parse(protocolBytes);
const FIXED_CASES = [
  {id: 'october-2026-new-moon', phase: 'new', targetAngleDegrees: 0, from: '2026-10-01T00:00:00.000Z', to: '2026-10-16T00:00:00.000Z'},
  {id: 'october-2026-full-moon', phase: 'full', targetAngleDegrees: 180, from: '2026-10-16T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z'}
];
if (protocol.diagnosticGateSeconds !== 10 || protocol.clock.deltaTSeconds !== 69 || protocol.engineStepDays !== .25 ||
    protocol.cases.length !== FIXED_CASES.length ||
    FIXED_CASES.some((c, i) => Object.entries(c).some(([k, v]) => protocol.cases[i][k] !== v))) {
  throw new Error('Protocol changed: this runner fixes the two October windows, 69-second deltaT, quarter-day scan and 10-second diagnostic gate');
}
const referencePath = resolve(options['--references'] ?? resolve(here, 'references.json'));
const referenceBytes = await readFile(referencePath);
const reference = JSON.parse(referenceBytes);
if (reference.protocolSha256 !== hash(protocolBytes)) throw new Error('Reference protocol hash mismatch');
if (reference.references.length !== protocol.cases.length) throw new Error('Missing bounded reference cases');
if (new Set(reference.references.map(r => r.id)).size !== protocol.cases.length) throw new Error('Duplicate reference case ID');
if (reference.requests.length !== 10 || new Set(reference.requests.map(r => r.name)).size !== 10) throw new Error('Missing or duplicate source requests');
const rawByName = new Map();
for (const request of reference.requests) {
  const raw = await readFile(resolve(dirname(referencePath), request.rawFile));
  if (hash(raw) !== request.rawSha256) throw new Error(`Reference raw response hash mismatch: ${request.name}`);
  rawByName.set(request.name, JSON.parse(raw));
}
const wrapSigned = x => ((x + 180) % 360 + 360) % 360 - 180;
function rawLongitudes(name, body) {
  const payload = rawByName.get(name);
  if (!payload?.result) throw new Error(`Missing raw table: ${name}`);
  const [header, rest] = payload.result.split('$$SOE');
  if (!rest || !rest.includes('$$EOE') || !header.includes(`Target body name: ${body}`) ||
      !header.includes('Center body name: Earth (399)') || !header.includes('Calendar mode   : Gregorian')) {
    throw new Error(`Unexpected JPL source header: ${name}`);
  }
  const lines = header.split('\n').filter(line => line.includes('ObsEcLon'));
  if (lines.length !== 1 || !lines[0].includes('JDTT')) throw new Error(`Expected explicit TT longitude table: ${name}`);
  const index = lines[0].split(',').map(s => s.trim()).indexOf('ObsEcLon');
  if (index < 0) throw new Error(`Missing longitude column: ${name}`);
  return rest.split('$$EOE')[0].trim().split('\n').map(line => {
    const cols = line.split(',');
    const jd = Number(cols[0].trim()), lon = Number(cols[index].trim());
    if (!Number.isFinite(jd) || !Number.isFinite(lon)) throw new Error(`Nonfinite reference sample: ${name}`);
    return {jd, seconds: (jd - 2440587.5) * 86400 - 69, longitude: lon};
  });
}
// Recompute each expected root and bracket from independently acquired RAW CSV.
// Editing references.json's processed times cannot change what is tested.
const rederived = new Map();
for (const scenario of FIXED_CASES) {
  const original = reference.references.find(x => x.id === scenario.id);
  if (!original || Object.entries(scenario).some(([k, v]) => original[k] !== v)) throw new Error('Reference scenario differs');
  const sun = rawLongitudes(`${scenario.id}-second-sun`, 'Sun (10)');
  const moon = rawLongitudes(`${scenario.id}-second-moon`, 'Moon (301)');
  if (sun.length !== 5 || moon.length !== 5) throw new Error('Expected five independently sampled fine instants');
  const samples = sun.map((s, i) => {
    if (s.jd !== moon[i].jd) throw new Error('Raw Sun/Moon TT timestamps differ');
    if (i && !(s.seconds > sun[i - 1].seconds)) throw new Error('Raw TT grid is not increasing');
    return {seconds: s.seconds, residual: wrapSigned(moon[i].longitude - s.longitude - scenario.targetAngleDegrees)};
  });
  const brackets = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.residual <= 0 && b.residual > 0 && Math.abs(a.residual) < 90 && Math.abs(b.residual) < 90) {
      const width = b.seconds - a.seconds;
      if (width > 1.01 || width <= 0 || a.seconds < Date.parse(scenario.from) / 1000 || b.seconds > Date.parse(scenario.to) / 1000) {
        throw new Error('Raw reference bracket outside specified bounds');
      }
      brackets.push({lowerSeconds: a.seconds, upperSeconds: b.seconds,
        lowerResidualDegrees: a.residual, upperResidualDegrees: b.residual,
        linearEstimateSeconds: a.seconds - a.residual * width / (b.residual - a.residual),
        localRateDegreesPerSecond: (b.residual - a.residual) / width, widthSeconds: width});
    }
  }
  if (brackets.length !== 1) throw new Error('Fine raw data does not identify exactly one bounded increasing root');
  const bracket = brackets[0];
  for (const key of ['lowerSeconds', 'upperSeconds', 'linearEstimateSeconds', 'widthSeconds']) {
    if (!Number.isFinite(original.sampleBracket?.[key]) || Math.abs(bracket[key] - original.sampleBracket[key]) > .00001) {
      throw new Error(`Processed reference bracket was edited: ${scenario.id} ${key}`);
    }
  }
  if (!Number.isFinite(original.referenceSyntheticUt1UnixSeconds) ||
      Math.abs(bracket.linearEstimateSeconds - original.referenceSyntheticUt1UnixSeconds) > .00001 ||
      !Number.isFinite(Date.parse(original.referenceSyntheticUt1)) ||
      Math.abs(Date.parse(original.referenceSyntheticUt1) / 1000 - bracket.linearEstimateSeconds) > .0011 ||
      !Number.isFinite(Date.parse(original.referenceTt)) ||
      Math.abs(Date.parse(original.referenceTt) / 1000 - bracket.linearEstimateSeconds - 69) > .0011) {
    throw new Error(`Processed expected time was edited: ${scenario.id}`);
  }
  rederived.set(scenario.id, {...original, referenceSyntheticUt1UnixSeconds: bracket.linearEstimateSeconds,
    referenceSyntheticUt1: new Date(bracket.linearEstimateSeconds * 1000).toISOString(),
    referenceTt: new Date((bracket.linearEstimateSeconds + 69) * 1000).toISOString(),
    sampleBracket: {...bracket,
      lowerSyntheticUt1: new Date(bracket.lowerSeconds * 1000).toISOString(),
      upperSyntheticUt1: new Date(bracket.upperSeconds * 1000).toISOString()}});
}
// Establish and verify inputs before importing or calling target code.
let tarballVerification = {status: 'not supplied', expectedSha256: protocol.engine.tarballSha256};
if (options['--tarball']) {
  const observed = hash(await readFile(resolve(options['--tarball'])));
  if (options['--expect-version'] === protocol.engine.version && observed !== protocol.engine.tarballSha256) {
    throw new Error('Frozen rc.10 tarball SHA256 mismatch');
  }
  tarballVerification = {status: 'hashed supplied archive', sha256: observed,
    matchesFrozenBaseline: observed === protocol.engine.tarballSha256,
    frozenBaselineEnforced: options['--expect-version'] === protocol.engine.version,
    scope: 'Verifies supplied archive identity; does not by itself establish that the imported runtime was extracted from it.'};
}
const enginePath = resolve(options['--engine']);
const engineEntrySha256 = hash(await readFile(enginePath));
const engine = await import(pathToFileURL(enginePath).href);
if (options['--expect-version'] && engine.ENGINE_VERSION !== options['--expect-version']) throw new Error(`Wrong expected version: ${engine.ENGINE_VERSION}`);
const startedAtUtc = new Date().toISOString();
const caseResults = [];
for (const scenario of protocol.cases) {
  const expected = rederived.get(scenario.id);
  if (!expected || ['from', 'to', 'targetAngleDegrees'].some(k => expected[k] !== scenario[k])) {
    throw new Error(`Scenario mismatch: ${scenario.id}`);
  }
  let longitudeCalls = 0;
  let natalChartCalls = 0;
  const charts = new Map();
  const elongationAt = (_body, date) => {
    longitudeCalls += 1;
    const key = date.getTime();
    let chart = charts.get(key);
    if (!chart) {
      chart = engine.natalChart({utc: date, timeKnown: false, deltaT: protocol.clock.deltaTSeconds});
      if (chart.deltaT.model !== 'pinned' || chart.deltaT.seconds !== protocol.clock.deltaTSeconds) throw new Error('Target did not honor pinned deltaT');
      charts.set(key, chart);
      natalChartCalls += 1;
    }
    const suns = chart.bodies.filter(body => body.body === 'Sun');
    const moons = chart.bodies.filter(body => body.body === 'Moon');
    const sun = suns[0], moon = moons[0];
    if (suns.length !== 1 || moons.length !== 1 || !Number.isFinite(sun.lon) || !Number.isFinite(moon.lon) ||
        sun.lon < 0 || sun.lon >= 360 || moon.lon < 0 || moon.lon >= 360) {
      throw new Error('Target chart must supply exactly one Sun and Moon with longitudes in [0,360)');
    }
    return (moon.lon - sun.lon + 360) % 360;
  };
  const found = engine.findLongitudeCrossingsWith(elongationAt, 'Moon', scenario.targetAngleDegrees,
    new Date(scenario.from), new Date(scenario.to), protocol.engineStepDays);
  const roots = found.map(root => ({syntheticUt1: root.at.toISOString(),
    syntheticUt1UnixSeconds: root.at.getTime() / 1000, retrograde: root.retrograde}));
  const countMatched = roots.length === 1;
  const differenceSeconds = countMatched ? roots[0].syntheticUt1UnixSeconds - expected.referenceSyntheticUt1UnixSeconds : null;
  const worstEndpointDifferenceSeconds = countMatched ? Math.max(
    Math.abs(roots[0].syntheticUt1UnixSeconds - expected.sampleBracket.lowerSeconds),
    Math.abs(roots[0].syntheticUt1UnixSeconds - expected.sampleBracket.upperSeconds)) : null;
  const passed = countMatched && worstEndpointDifferenceSeconds <= protocol.diagnosticGateSeconds;
  caseResults.push({id: scenario.id, phase: scenario.phase, window: {from: scenario.from, to: scenario.to},
    targetAngleDegrees: scenario.targetAngleDegrees, roots,
    referenceSyntheticUt1: expected.referenceSyntheticUt1,
    referenceTt: expected.referenceTt,
    referenceSampleBracket: expected.sampleBracket,
    expectedRootCount: 1, countMatched,
    targetMinusJplInterpolatedSeconds: differenceSeconds,
    absoluteDifferenceSeconds: differenceSeconds === null ? null : Math.abs(differenceSeconds),
    worstEndpointDifferenceSeconds,
    diagnosticGateSeconds: protocol.diagnosticGateSeconds,
    gateRule: 'Exactly one root, with absolute distance to BOTH endpoints of the JPL reference bracket <=10 seconds.',
    diagnosticPassed: passed, longitudeCalls, natalChartCalls});
}
const report = {
  schemaVersion: 1, protocol: protocol.protocol, startedAtUtc, completedAtUtc: new Date().toISOString(),
  runner: {node: process.version, scriptSha256: hash(await readFile(fileURLToPath(import.meta.url)))},
  target: {package: protocol.engine.name, version: engine.ENGINE_VERSION,
    ephemeris: engine.EPHEMERIS,
    engineEntrySha256,
    functions: ['natalChart({utc,timeKnown:false,deltaT:69})', 'findLongitudeCrossingsWith']},
  baseline: {...protocol.engine, suppliedArchiveVerification: tarballVerification},
  clock: protocol.clock,
  inputs: {protocolSha256: hash(protocolBytes), referencesSha256: hash(referenceBytes),
    rawResponseHashesVerified: reference.requests.length, expectedRootsRederivedFromRawCsv: rederived.size,
    diagnosticGateSeconds: protocol.diagnosticGateSeconds},
  cases: caseResults,
  summary: {passed: caseResults.filter(c => c.diagnosticPassed).length, total: caseResults.length,
    allDiagnosticPassed: caseResults.every(c => c.diagnosticPassed),
    maximumAbsoluteDifferenceSeconds: Math.max(...caseResults.map(c => c.absoluteDifferenceSeconds ?? Infinity))},
  limitations: [protocol.scope,
    'This exercises a custom elongation callback built from natalChart through the public crossing solver; it is not a native lunation catalog API.',
    'The 10-second gate was chosen before target results and is a bounded diagnostic, not a package accuracy specification.',
    'The fine reference bracket describes numerical sampling only; physical ephemeris uncertainty and convention differences are not bounded by it.',
    'Synthetic UT1 with a fixed 69-second TT offset is used to remove model deltaT differences; the ISO Z labels are not claims of actual UTC phase times.',
    'No estimate of event-search completeness over all bodies, all epochs or station/tangent configurations is made.']
};
const outputPath = resolve(options['--output'] ?? resolve(here, 'measured.json'));
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({output: outputPath, summary: report.summary,
  cases: report.cases.map(c => ({id: c.id, targetMinusJplInterpolatedSeconds: c.targetMinusJplInterpolatedSeconds,
    worstEndpointDifferenceSeconds: c.worstEndpointDifferenceSeconds, diagnosticPassed: c.diagnosticPassed}))}, null, 2));
if (!report.summary.allDiagnosticPassed) process.exitCode = 1;
