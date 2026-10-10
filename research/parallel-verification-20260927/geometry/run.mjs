#!/usr/bin/env node
/** Read-only public-API comparison. Oracle fixture construction is independent. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let enginePath;
let output = resolve(here, 'report.json');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--engine' && args[i + 1]) enginePath = resolve(args[++i]);
  else if (args[i] === '--out' && args[i + 1]) output = resolve(args[++i]);
  else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
}
if (!enginePath) throw new Error('Usage: node run.mjs --engine /absolute/target/dist/index.js [--out report.json]');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = await readFile(resolve(here, 'fixtures.json'));
const gateBytes = await readFile(resolve(here, 'gates.json'));
const fixtures = JSON.parse(fixtureBytes);
const freeze = JSON.parse(await readFile(resolve(here, 'freeze.json'), 'utf8'));
if (sha(fixtureBytes) !== freeze.fixturesSha256 || sha(gateBytes) !== freeze.gatesSha256) {
  throw new Error('Frozen inputs changed. Review and explicitly create a new pre-execution freeze; never tune thresholds against observed target results.');
}
if (sha(gateBytes) !== fixtures.gatesSha256) throw new Error('Fixture gate digest mismatch');
const targetBytes = await readFile(enginePath);
const engine = await import(pathToFileURL(enginePath).href);
if (typeof engine.natalChart !== 'function') throw new Error('Target must export natalChart');
const angularError = (a, b) => Math.abs(((a - b + 540) % 360) - 180) * 3600;
const summary = {
  asc: { gated: 0, passed: 0, failed: 0, exploratory: 0, maximumGatedErrorArcsec: 0, maximumCaseId: null },
  mc: { gated: 0, passed: 0, failed: 0, exploratory: 0, maximumGatedErrorArcsec: 0, maximumCaseId: null },
  targetErrors: 0,
};
const rows = [];
const versions = new Set();
for (const item of fixtures.cases) {
  const row = { id: item.id, family: item.family, input: item.input, expected: item.expected, angles: {} };
  let chart;
  try {
    chart = engine.natalChart(item.input);
    if (chart.engineVersion) versions.add(chart.engineVersion);
    if (chart.deltaT?.model !== 'pinned' || chart.deltaT?.seconds !== item.input.deltaT) {
      // Field contract is intentionally checked; mismatched time invalidates comparison.
      throw new Error(`Target did not confirm pinned DeltaT=${item.input.deltaT}: ${JSON.stringify(chart.deltaT)}`);
    }
  } catch (error) {
    row.error = String(error?.message || error);
    summary.targetErrors++;
  }
  for (const angle of ['asc', 'mc']) {
    const gate = item.acceptance[angle];
    const actual = chart?.angles?.[angle];
    const valid = !row.error && Number.isFinite(actual) && actual >= 0 && actual < 360;
    const errorArcsec = valid ? angularError(actual, item.expected[angle]) : null;
    let status;
    if (!gate.comparable) {
      summary[angle].exploratory++;
      status = 'exploratory';
    } else {
      summary[angle].gated++;
      status = valid && errorArcsec <= gate.maximumErrorArcsec ? 'pass' : 'fail';
      summary[angle][status === 'pass' ? 'passed' : 'failed']++;
      if (valid && errorArcsec > summary[angle].maximumGatedErrorArcsec) {
        summary[angle].maximumGatedErrorArcsec = errorArcsec;
        summary[angle].maximumCaseId = item.id;
      }
    }
    row.angles[angle] = { actual: Number.isFinite(actual) ? actual : null, errorArcsec,
      maximumErrorArcsec: gate.maximumErrorArcsec, status,
      ...(valid ? {} : { comparisonError: row.error || 'Expected finite angle in [0,360)' }) };
  }
  rows.push(row);
}
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  target: { path: enginePath, entryFileSha256: sha(targetBytes), reportedVersions: [...versions] },
  fixtureSha256: sha(fixtureBytes), gatesSha256: sha(gateBytes),
  scope: fixtures.scope,
  oracleVersions: fixtures.versions,
  conventions: fixtures.conventions,
  controlsPassedDuringFixtureGeneration: fixtures.selfControls.length,
  summary,
  acceptancePassed: summary.targetErrors === 0 && summary.asc.failed === 0 && summary.mc.failed === 0,
  rows,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, acceptancePassed: report.acceptancePassed, summary }));
if (!report.acceptancePassed) process.exitCode = 1;
