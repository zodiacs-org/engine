import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Record only statuses and provenance, never native sky values as expectations.
const report = JSON.parse(await readFile(new URL('../generated/m5-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const native = assertions.filter(test => test.fullName.includes('native void delegation against independent Horizons dates'));
const hashes = {};
for (const path of ['references/void-cases.json', 'references/void-horizons.json', 'references/horizons.json',
  'scripts/void-horizons.mjs', 'scripts/build-engine.mjs', 'src/void-rule.ts', 'src/basic-rules.ts', 'src/events-adapter.ts',
  'test/fixtures/void-windows.json', 'test/void-rule.electional-check.ts', 'test/void-references.electional-check.ts', 'package-lock.json']) {
  hashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let eventsEntrySha256 = null;
try { eventsEntrySha256 = createHash('sha256').update(await readFile(eventsUrl)).digest('hex'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const summary = {
  schema: 'electional-m5-test-record/v1', runtime: process.version,
  startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m5-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  nativeHorizonsVoidComparisons: { passed: native.filter(test => test.status === 'passed').length,
    skipped: native.filter(test => test.status !== 'passed').length, eventsEntrySha256 },
  sha256: hashes,
  scope: 'Hand-derived set behavior and independent Horizons void windows within references/void-cases.json only; no completeness or physical error-bound claim.',
};
await writeFile(new URL('../generated/m5-tests.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
console.log('Wrote electional/generated/m5-tests.json from the generated Vitest report.');
