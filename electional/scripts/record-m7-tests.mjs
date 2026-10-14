import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const report = JSON.parse(await readFile(new URL('../generated/m7-vitest.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const independent = assertions.filter(test => test.fullName.includes('independent Horizons applying-window comparison'));
assert.equal(independent.length, 2);
const native = assertions.filter(test => test.fullName.includes('native scanner with independently hand-derived linear models'));
assert(native.length > 0);
const sha256 = {};
for (const path of ['references/chart-cases.json', 'references/chart-horizons.json', 'references/horizons.json',
  'references/void-horizons.json', 'test/fixtures/chart-windows.json', 'src/chart-adapter.ts', 'src/chart-rules.ts',
  'src/derived-search.ts', 'src/adapter-contract.ts', 'src/engine-adapter.ts', 'src/index.ts',
  'test/chart-rules.electional-check.ts', 'test/chart-references.electional-check.ts',
  'scripts/chart-horizons.mjs', 'scripts/horizons.mjs', 'scripts/void-horizons.mjs', 'scripts/build-engine.mjs',
  'scripts/check-chart-esm.mjs', 'scripts/record-m7-tests.mjs', 'package-lock.json',
  '../src/calc.ts', '../src/window.ts', '../src/houses.ts', '../src/configured-aspects.ts', '../src/aspects.ts']) {
  sha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(t => t.status === 'pending').length, failed: tests.filter(t => t.status === 'failed').length });
const record = { schema: 'electional-m7-test-record/v1', runtime: process.version,
  startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m7-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  independentComparison: { source: 'NASA/JPL Horizons DE441', clock: 'tt', start: '2023-10-03', end: '2023-10-28',
    ...statuses(independent), scope: 'Moon applying to Sun/Jupiter major aspects, declared orb, any/all target combinations only' },
  nativeSyntheticScanner: statuses(native), sha256,
  scope: 'Hand-derived interval logic, control flow and native API delegation; independent applying-window comparison over the declared TT span only. No physical accuracy claim for angular/house windows, no exhaustive event proof, and no runtime or hidden window-sample budget claim.',
};
await writeFile(new URL('../generated/m7-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m7-tests.json from the complete Vitest report for review.');
