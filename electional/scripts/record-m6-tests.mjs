import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Summarize statuses and source identity; never record native sky values as
// expectations. Raw reports and the generated record stay in generated/ until
// the small test-run receipt is reviewed for docs/evidence/.
const report = JSON.parse(await readFile(new URL('../generated/m6-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const usno = assertions.filter(test => test.fullName.includes('independent published USNO planetary-hour reference'));
assert.equal(usno.length, 2);
assert(usno.every(test => test.status === 'passed'));
const hashes = {};
for (const path of ['references/hour-cases.json', 'test/fixtures/hour-windows.json', 'src/hour-rule.ts',
  'src/sky-adapter.ts', 'src/adapter-contract.ts', 'src/engine-adapter.ts', 'src/rule-schema.ts', 'src/rules.ts',
  'test/hour-rule.electional-check.ts', 'test/hour-references.electional-check.ts', 'scripts/build-engine.mjs',
  'scripts/check-hour-esm.mjs', 'scripts/record-m6-tests.mjs', 'package-lock.json',
  '../src/sky/hours.ts', '../src/sky/riseset.ts', '../src/sky/fixtures/usno-rstt.json']) {
  hashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const record = {
  schema: 'electional-m6-test-record/v1', runtime: process.version, startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m6-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  publishedReference: { source: 'US Naval Observatory rise/set ephemeris, hand-reduced hour durations',
    date: '2000-09-22', referenceClock: 'ut', comparedClock: 'utc', passed: usno.length },
  sha256: hashes,
  scope: 'Hand-derived interval logic and control flow, native sky API status delegation, and the nominal UT/UTC coordinate comparison declared in references/hour-cases.json only. No general physical accuracy or completeness claim.',
};
await writeFile(new URL('../generated/m6-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote electional/generated/m6-tests.json from the generated Vitest report.');
