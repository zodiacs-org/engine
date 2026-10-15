import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Consume Vitest's generated report without importing expected sky values from
// the engine or committing timings, raw runtime positions or test-runner output.
const report = JSON.parse(await readFile(new URL('../generated/m4-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const native = assertions.filter(test => test.fullName.includes('native event delegation against independent Horizons dates'));
const hashes = {};
for (const path of ['references/cases.json', 'references/horizons.json', 'scripts/horizons.mjs',
  'src/basic-rules.ts', 'src/events-adapter.ts', 'test/fixtures/basic-windows.json',
  'test/basic-rules.electional-check.ts', 'test/references.electional-check.ts', 'package-lock.json']) {
  hashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let eventsEntrySha256 = null;
try { eventsEntrySha256 = createHash('sha256').update(await readFile(eventsUrl)).digest('hex'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const summary = {
  schema: 'electional-m4-test-record/v1', runtime: process.version,
  startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m4-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  nativeHorizonsComparisons: { passed: native.filter(test => test.status === 'passed').length,
    skipped: native.filter(test => test.status !== 'passed').length, eventsEntrySha256 },
  sha256: hashes,
  scope: 'Hand-derived set behavior and Horizons dates over references/cases.json only; no completeness or physical error-bound claim.',
};
await writeFile(new URL('../generated/m4-tests.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
console.log('Wrote electional/generated/m4-tests.json from the generated Vitest report.');
