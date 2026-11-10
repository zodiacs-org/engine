import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const report = JSON.parse(await readFile(new URL('../generated/m9-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const independent = assertions.filter(test => test.fullName.includes('independent Horizons fixed-natal synastry comparison'));
const native = assertions.filter(test => test.fullName.includes('native synastry scanner with hand-derived equations'));
assert.equal(independent.length, 2); assert.equal(native.length, 10);
assert([...independent, ...native].every(test => test.status === 'passed'), 'Do not record skipped integration as verified evidence.');
const selection = JSON.parse(await readFile(new URL('../references/synastry-cases.json', import.meta.url), 'utf8'));
const sha256 = {};
for (const path of ['references/synastry-cases.json', 'references/synastry-horizons.json', 'references/horizons.json',
  'references/void-horizons.json', 'test/fixtures/synastry-windows.json', 'src/synastry-rule.ts', 'src/synastry-adapter.ts',
  'src/chart-adapter.ts', 'src/engine-adapter.ts', 'src/derived-search.ts', 'src/adapter-contract.ts', 'src/intervals.ts',
  'src/index.ts', 'src/rules.ts', 'src/rule-schema.ts', 'src/rule-types.ts',
  'test/synastry-rule.electional-check.ts', 'test/synastry-references.electional-check.ts', 'scripts/synastry-horizons.mjs',
  'scripts/horizons.mjs', 'scripts/void-horizons.mjs', 'scripts/check-synastry-esm.mjs', 'scripts/record-m9-tests.mjs',
  'scripts/build-engine.mjs', 'package-lock.json', '../src/calc.ts', '../src/synastry.ts', '../src/aspects.ts',
  '../scripts/time-scale-sources/leap-seconds.list', 'generated/engine.mjs']) {
  sha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
const eventsSource = { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex'),
  scope: 'Read-only entry bytes only; not its dependencies or an authenticated release.' };
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(t => t.status === 'pending').length, failed: tests.filter(t => t.status === 'failed').length });
const record = { schema: 'electional-m9-test-record/v1', runtime: process.version, startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m9-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  synastryComparison: { source: selection.source, clock: selection.clock, range: selection.range,
    syntheticNatal: selection.natal, natalTtMs: selection.natalTtMs, natalTtMinusUtcMs: selection.natalTtMinusUtcMs,
    toleranceMs: selection.boundaryToleranceMs, maxOrbDegrees: selection.maxOrbDegrees,
    ...statuses(independent), scope: 'Moon to fixed natal Sun/Jupiter, selected sextile/square/trine aspects and any/all pair sets on the declared span only.' },
  nativeSyntheticScanner: statuses(native), eventsSource, sha256,
  scope: 'Hand-derived integer sets, control flow, clocks and policy checks plus declared independent reference comparisons only. No exhaustive completeness, performance, physical error bound or prediction claim.',
};
await writeFile(new URL('../generated/m9-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m9-tests.json from the complete Vitest report for review.');
