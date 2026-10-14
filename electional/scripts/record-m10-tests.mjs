import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const report = JSON.parse(await readFile(new URL('../generated/m10-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
assert(process.version.startsWith('v22.'), 'Record this project on its declared Node 22 runtime.');
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const select = phrase => assertions.filter(test => test.fullName.includes(phrase));
const finite = select('independent exhaustive finite-state composition');
const golden = select('independent hand-derived composition golden');
const native = select('native composed search with independent hand-derived interval logic');
assert.equal(finite.length, 3); assert.equal(golden.length, 3); assert.equal(native.length, 2);
assert([...finite, ...golden].every(test => test.status === 'passed'));
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(t => t.status === 'pending').length, failed: tests.filter(t => t.status === 'failed').length });
const sha256 = {};
for (const path of ['src/composition.ts', 'src/search.ts', 'src/index.ts', 'src/intervals.ts', 'src/adapter-contract.ts',
  'src/basic-rules.ts', 'src/void-rule.ts', 'src/hour-rule.ts', 'src/chart-rules.ts', 'src/avoidance-rules.ts', 'src/synastry-rule.ts',
  'test/composition.electional-check.ts', 'test/search.electional-check.ts', 'test/search-native.electional-check.ts',
  'test/fixtures/composition-windows.json', 'scripts/check-search-esm.mjs', 'scripts/record-m10-tests.mjs', 'package-lock.json', 'generated/engine.mjs']) {
  sha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let eventsSource = null;
try {
  eventsSource = { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex'),
    scope: 'Read-only entry bytes, not its dependency graph or an authenticated release.' };
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const record = { schema: 'electional-m10-test-record/v1', runtime: process.version, startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m10-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  compositionGolden: { ...statuses(golden), reference: 'test/fixtures/composition-windows.json', domain: { startMs: 0, endMs: 100, clock: 'utc' } },
  finiteStateComposition: { ...statuses(finite), arbiter: 'Independent base-three label table and direct Boolean/weight equations',
    domain: { startMs: 0, endMs: 3 }, statesPerRule: 3, rulesPerTable: 2, tablesPerModePair: 729,
    modePairs: ['require/require', 'require/prefer', 'prefer/prefer'] },
  nativeComposition: { ...statuses(native), reference: 'Invented linear Moon longitude 0.1 * label and direct planetary motion; tautological all-sign/house/ruler selection for native provenance only',
    linearSpan: { startMs: 0, endMs: 1000, clock: 'utc' }, provenanceSpan: { start: '2000-09-22T12:00:00Z', end: '2000-09-22T12:01:00Z', clock: 'utc' } },
  eventsSource, sha256,
  scope: 'Set composition, declared scoring/ranking, control flow and native receipt transport. Existing independent astronomical reference comparisons remain in the complete suite. No new astronomical accuracy, exhaustive completeness, performance or predictive claim.',
};
await writeFile(new URL('../generated/m10-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m10-tests.json from the complete Vitest report for review.');
