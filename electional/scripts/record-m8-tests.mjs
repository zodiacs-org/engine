import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const report = JSON.parse(await readFile(new URL('../generated/m8-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const nasa = assertions.filter(test => test.fullName.includes('independent NASA eclipse avoidance comparison'));
const horizons = assertions.filter(test => test.fullName.includes('independent Horizons station avoidance comparison'));
const native = assertions.filter(test => test.fullName.includes('native avoidance scanners with hand-derived equations'));
const selection = JSON.parse(await readFile(new URL('../references/avoidance-cases.json', import.meta.url), 'utf8'));
assert.equal(nasa.length, selection.cases.length); assert.equal(horizons.length, 6); assert.equal(native.length, 2);
assert([...nasa, ...horizons, ...native].every(test => test.status === 'passed'), 'Do not record skipped integration as verified sky evidence.');
const sha256 = {};
for (const path of ['references/avoidance-cases.json', 'references/avoidance-nasa.json', 'references/horizons.json',
  'test/fixtures/avoidance-windows.json', 'src/avoidance-rules.ts', 'src/engine-adapter.ts', 'src/events-adapter.ts',
  'src/adapter-contract.ts', 'src/intervals.ts', 'src/index.ts', 'test/avoidance-rules.electional-check.ts',
  'test/avoidance-references.electional-check.ts', 'scripts/avoidance-nasa.mjs', 'scripts/horizons.mjs',
  'scripts/check-avoidance-esm.mjs', 'scripts/record-m8-tests.mjs', 'scripts/build-engine.mjs', 'package-lock.json',
  '../src/calc.ts', 'generated/engine.mjs']) {
  sha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
const eventsSource = { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex'),
  scope: 'Read-only entry bytes only; not its dependencies or an authenticated release.' };
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(t => t.status === 'pending').length, failed: tests.filter(t => t.status === 'failed').length });
const record = { schema: 'electional-m8-test-record/v1', runtime: process.version, startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m8-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  eclipseComparison: { source: 'NASA GSFC catalogs by Fred Espenak and Jean Meeus', clock: 'tt',
    dates: selection.cases.map(c => c.date), toleranceMs: selection.eclipseToleranceMs, withinDays: selection.withinDays,
    ...statuses(nasa), scope: 'Selected global greatest eclipse labels, coarse classes and day-margin window edges only.' },
  stationComparison: { source: 'NASA/JPL Horizons DE441', clock: 'tt', toleranceMs: selection.stationToleranceMs,
    ...statuses(horizons), scope: 'The committed Mercury/Venus series and padding checks on both sides of the April Mercury station only.' },
  nativeSyntheticScanner: statuses(native), eventsSource, sha256,
  scope: 'Hand-derived integer-set arithmetic and control flow plus declared independent reference comparisons only. No exhaustive completeness, marginal eclipse classification or physical error-bound claim.',
};
await writeFile(new URL('../generated/m8-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m8-tests.json from the complete Vitest report for review.');
