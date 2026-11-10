import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const report = JSON.parse(await readFile(new URL('../generated/m11-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
assert(process.version.startsWith('v22.'), 'Record this project on its declared Node 22 runtime.');
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const selected = phrase => assertions.filter(test => test.fullName.includes(phrase));
const golden = selected('independent hand-derived streaming golden');
const native = selected('native streaming with independent hand-derived equations');
const controls = assertions.filter(test => test.fullName.startsWith('stream seams,') || test.fullName.startsWith('stream cumulative') || test.fullName.startsWith('stream cancellation'));
assert.equal(golden.length, 3); assert.equal(native.length, 8); assert(controls.length > 0);
assert([...golden, ...controls].every(test => test.status === 'passed'));
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(t => t.status === 'pending').length, failed: tests.filter(t => t.status === 'failed').length });
const sha256 = {};
for (const path of ['src/stream.ts', 'src/search.ts', 'src/composition.ts', 'src/index.ts', 'src/adapter-contract.ts',
  'test/stream.electional-check.ts', 'test/stream-native.electional-check.ts', 'test/fixtures/stream-windows.json',
  'test/fixtures/composition-windows.json', 'scripts/check-stream-esm.mjs', 'scripts/record-m11-tests.mjs', 'package-lock.json', 'generated/engine.mjs']) {
  sha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const eventsUrl = new URL('../../../wt-events/events/build/src/index.js', import.meta.url);
let eventsSource = null;
try { eventsSource = { moduleUrl: eventsUrl.href, sha256: createHash('sha256').update(await readFile(eventsUrl)).digest('hex'),
  scope: 'Read-only entry bytes, not its dependency graph or an authenticated release.' }; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const record = { schema: 'electional-m11-test-record/v1', runtime: process.version, startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m11-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  streamingGolden: { ...statuses(golden), reference: 'test/fixtures/stream-windows.json and test/fixtures/composition-windows.json',
    domain: { startMs: 0, endMs: 100, clock: 'utc' }, chunkWidthsMs: { first: 1, last: 101, stride: 1 } },
  controls: { ...statuses(controls), reference: 'Hand-derived rule partitions and explicit request/sample/output controls in test/stream.electional-check.ts',
    domain: { startMs: 0, endMs: 100, clock: 'utc' } },
  nativeStreaming: { ...statuses(native), reference: 'Independently specified linear Moon longitude and polynomial station, not an astronomical ephemeris',
    sectorSpan: { startMs: 0, endMs: 1000, clock: 'utc' }, sectorChunkWidthsMs: [100, 150, 300, 333, 1000],
    voidSpan: { startMs: 0, endMs: 600, clock: 'utc' }, voidLookaheadMs: 700,
    stationSpan: { startMs: 0, endMs: 2000, clock: 'utc' }, stationAtMs: 500, marginMs: 864 },
  eventsSource, sha256,
  scope: 'Chunk ownership, continuation, preserved uncertainty, shared budgets, facts-only output, cancellation, and receipt transport. Existing astronomical reference comparisons remain in the complete suite. No new astronomical accuracy, exhaustive completeness, heap, throughput or predictive claim.',
};
await writeFile(new URL('../generated/m11-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m11-tests.json from the complete Vitest report for review.');
