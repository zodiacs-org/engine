import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { verify as verifyBasic } from './horizons.mjs';
import { verify as verifyVoid } from './void-horizons.mjs';
import { verify as verifyChart } from './chart-horizons.mjs';
import { verify as verifyAvoidance } from './avoidance-nasa.mjs';
import { verify as verifySynastry } from './synastry-horizons.mjs';

assert(process.version.startsWith('v22.'), 'Record evidence on Node 22.');
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const report = JSON.parse(await read('generated/m14-vitest.json'));
const examples = JSON.parse(await read('generated/m14-examples.json'));
const cli = JSON.parse(await read('generated/m12-cli-esm.json'));
const http = JSON.parse(await read('generated/m13-http-esm.json'));
const isolation = await read('generated/m14-isolation.txt');
assert(report.success && report.numFailedTests === 0);
for (const record of [examples, cli, http]) { assert.equal(record.runtime, process.version); assert.equal(record.status, 'passed'); }
assert(isolation.includes('Isolation passed: npm excludes electional/ and parent Vitest discovers no workbench tests.'));
assert(isolation.includes('Carryable workbench files fit the owner byte cap and Markdown contains no em dashes.'));
const assertions = report.testResults.flatMap(file => file.assertionResults);
const skipped = test => ['pending', 'skipped'].includes(test.status);
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(skipped).length, failed: tests.filter(t => t.status === 'failed').length });
const counts = statuses(assertions);
assert.equal(counts.passed, report.numPassedTests); assert.equal(counts.skipped, report.numPendingTests);
assert.equal(counts.passed + counts.skipped, report.numTotalTests); assert.equal(counts.failed, 0);
const prefixes = {
  longRangeSets: ['independent hand-derived long-range condition sets'],
  examples: ['executable synthetic condition documents'],
  defaultComposition: ['independent hand-derived composition golden', 'independent exhaustive finite-state composition'],
  streaming: ['independent hand-derived streaming golden'],
  cliTransport: ['CLI independent hand-derived window transport'],
  httpTransport: ['HTTP hand-derived window transport'],
  optionalInternal: ['explicit internal numeric annotation'],
  publishedHours: ['independent published USNO planetary-hour reference'],
};
const groups = {};
for (const [name, names] of Object.entries(prefixes)) {
  const tests = assertions.filter(test => names.some(prefix => test.fullName.startsWith(prefix)));
  assert(tests.length > 0 && tests.every(t => t.status === 'passed'), `Required group ${name} did not execute and pass.`);
  groups[name] = statuses(tests);
}
const verifiers = { basicHorizons: () => verifyBasic(new URL('../references/horizons.json', import.meta.url)), voidHorizons: verifyVoid, applyingHorizons: verifyChart,
  nasaAvoidance: verifyAvoidance, syntheticSynastryHorizons: verifySynastry };
const referenceVerification = {};
for (const [name, verify] of Object.entries(verifiers)) {
  await verify(); referenceVerification[name] = 'passed-offline-digests-and-independent-reductions';
}
// Bind the carried code, documentation, examples, fixtures and source references.
// Skip historical evidence and mutable session logs; no raw test report or sky
// result is promoted to an astronomical expectation.
const sha256 = {}, excluded = new Set(['node_modules', 'build', 'generated', '.cache', 'coverage']);
async function bind(directory = '') {
  for (const entry of await readdir(new URL(`../${directory}`, import.meta.url), { withFileTypes: true })) {
    const path = directory + entry.name;
    if (excluded.has(entry.name) || path === 'docs/evidence' || ['PLAN.md', 'CHANGES.txt'].includes(path)) continue;
    if (entry.isDirectory()) await bind(`${path}/`);
    else if (entry.isFile() && !entry.name.endsWith('.tsbuildinfo')) {
      const bytes = await readFile(new URL(`../${path}`, import.meta.url));
      sha256[path] = createHash('sha256').update(bytes).digest('hex');
    }
  }
}
await bind();
sha256['generated/engine.mjs'] = createHash('sha256').update(await readFile(new URL('../generated/engine.mjs', import.meta.url))).digest('hex');
const record = { schema: 'electional-m14-test-record/v1', runtime: process.version,
  startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=dot --reporter=json --outputFile=generated/m14-vitest.json',
  tests: counts, groups, referenceVerification,
  longRangeReference: { fixture: 'test/fixtures/long-range.json', start: '2000-01-01T00:00:00Z', end: '2001-01-01T00:00:00Z',
    scope: 'Hand-derived recurring condition sets, chunk seams, unchanged facts-only chronology, exact cumulative budgets and unprocessed suffixes. No astronomical reference.' },
  executableRecord: 'docs/evidence/m14-examples.json',
  executableRechecks: { cli: cli.checked, http: http.checks,
    commands: ['node scripts/check-cli-esm.mjs', 'node scripts/check-http-esm.mjs'] },
  isolation: { command: 'npm run check:isolation', output: isolation.trim(),
    scope: 'Parent npm file selection without lifecycle hooks or archive creation, parent test discovery, carryable workbench byte limits and Markdown punctuation. Parent build and archive gates were not run.' },
  optionalEvents: examples.events,
  skippedTests: assertions.filter(skipped).map(t => t.fullName), sha256,
  scope: 'The recorded runtime and declared cases only. Offline reference verification authenticates stored digests/reductions, not the live source. Missing optional native comparisons remain skipped, not accuracy passes. Native monthly examples establish set coverage and transport under source scan assumptions, not independent event completeness, heap/throughput bounds, predictions or date recommendations.' };
await writeFile(new URL('../generated/m14-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m14-tests.json from executed tests, offline reference verifiers, executable checks and isolation output.');
