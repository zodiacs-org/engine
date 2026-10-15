import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const report = JSON.parse(await readFile(new URL('../generated/m12-vitest.json', import.meta.url), 'utf8'));
const executable = JSON.parse(await readFile(new URL('../generated/m12-cli-esm.json', import.meta.url), 'utf8'));
assert(report.success && report.numFailedTests === 0);
assert(process.version.startsWith('v22.'), 'Record this project on its declared Node 22 runtime.');
assert.equal(executable.runtime, process.version); assert.equal(executable.status, 'passed');
const assertions = report.testResults.flatMap(result => result.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const selected = phrase => assertions.filter(test => test.fullName.startsWith(phrase));
const golden = selected('CLI independent hand-derived window transport');
const argumentsAndControls = [...selected('CLI strict arguments'), ...selected('CLI bounded explicit controls')];
const files = selected('CLI regular file');
const presets = selected('authored traditional preset conventions');
assert([golden, argumentsAndControls, files, presets].every(group => group.length > 0 && group.every(t => t.status === 'passed')));
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(t => t.status === 'pending').length, failed: tests.filter(t => t.status === 'failed').length });
const sha256 = {};
for (const path of ['src/cli.ts', 'src/cli-controls.ts', 'src/cli-main.ts', 'src/presets.ts', 'src/index.ts',
  'src/stream.ts', 'src/search.ts', 'test/cli.electional-check.ts', 'test/cli-files.electional-check.ts',
  'test/presets.electional-check.ts', 'test/fixtures/composition-windows.json', 'bin/electional.mjs',
  'examples/controls.json', 'examples/synthetic-hours.yaml', 'scripts/check-cli-esm.mjs', 'scripts/record-m12-tests.mjs',
  'package.json', 'package-lock.json', 'generated/engine.mjs']) {
  sha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
const record = { schema: 'electional-m12-test-record/v1', runtime: process.version,
  startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=default --reporter=json --outputFile=generated/m12-vitest.json',
  tests: { passed: report.numPassedTests, failed: report.numFailedTests, skipped: report.numPendingTests },
  cliWindowTransport: { ...statuses(golden), reference: 'Hand-derived half-open sets in test/fixtures/composition-windows.json',
    domain: { startMs: 0, endMs: 100, clock: 'utc' }, chunkMs: 25,
    scope: 'JSON/YAML equivalence, chronological facts, native-receipt transport, unresolved/refused status, budgets, backpressure, cancellation and source/output errors.' },
  argumentsAndControls: { ...statuses(argumentsAndControls), reference: 'Explicit public argument/control grammar and RULE_LIMITS.documentBytes',
    scope: 'No implicit scoring, malformed or missing controls, duplicate JSON keys, explicit eclipse settings and bounded diagnostics.' },
  files: { ...statuses(files), reference: 'Independent byte counts on invented regular files, invalid UTF-8 and initial byte-order mark',
    inclusiveBoundaryBytes: 4, scope: 'Regular local file reads and inclusive byte/UTF-8 decoding boundaries.' },
  presets: { ...statuses(presets), reference: 'Authored pack policy, not an ephemeris or predictive evidence',
    syntheticRange: { start: '2000-01-01T00:00:00Z', end: '2000-01-02T00:00:00Z', clock: 'utc' },
    names: ['launch', 'contract-signing', 'travel'], scope: 'Exact options, required/preferred mode, numeric policy, validated immutable JSON documents and context rejection.' },
  executableRecord: 'docs/evidence/m12-cli-esm.json', sha256,
  scope: 'CLI transport and authored configuration behavior. Existing independent astronomical comparisons remain in the complete suite. No new astronomical accuracy, exhaustive completeness, heap, throughput or predictive claim.' };
await writeFile(new URL('../generated/m12-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m12-tests.json from the complete Vitest report and executable check for review.');
