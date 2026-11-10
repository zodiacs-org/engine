import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

assert(process.version.startsWith('v22.'), 'Use the declared Node 22 runtime.');
const report = JSON.parse(await readFile(new URL('../generated/m13-vitest.json', import.meta.url), 'utf8'));
const executable = JSON.parse(await readFile(new URL('../generated/m13-http-esm.json', import.meta.url), 'utf8'));
const isolation = await readFile(new URL('../generated/m13-isolation.txt', import.meta.url), 'utf8');
assert(report.success && report.numFailedTests === 0);
assert.equal(executable.runtime, process.version); assert.equal(executable.status, 'passed');
assert(isolation.includes('Isolation passed: npm excludes electional/ and parent Vitest discovers no workbench tests.'));
const assertions = report.testResults.flatMap(file => file.assertionResults);
assert.equal(assertions.length, report.numTotalTests);
const select = prefix => assertions.filter(test => test.fullName.startsWith(prefix));
const skipped = test => ['pending', 'skipped'].includes(test.status);
const statuses = tests => ({ passed: tests.filter(t => t.status === 'passed').length,
  skipped: tests.filter(skipped).length, failed: tests.filter(t => t.status === 'failed').length });
assert.equal(statuses(assertions).passed, report.numPassedTests);
assert.equal(statuses(assertions).skipped, report.numPendingTests);
assert.equal(Object.values(statuses(assertions)).reduce((sum, count) => sum + count, 0), report.numTotalTests);
const groups = {
  httpGolden: select('HTTP hand-derived window transport'),
  httpValidation: select('HTTP strict inputs and operator policy'),
  httpLifecycle: select('HTTP deadlines cancellation and worker lifetime'),
  httpNative: select('HTTP native delegation'),
  internalOptIn: select('explicit internal numeric annotation'),
  composition: [...select('independent hand-derived composition golden'), ...select('independent exhaustive finite-state composition')],
  stream: select('independent hand-derived streaming golden'),
  cli: select('CLI independent hand-derived window transport'),
};
assert(Object.values(groups).every(tests => tests.length > 0 && tests.every(t => t.status === 'passed')));
const sha256 = {};
for (const path of ['src/http.ts', 'src/http-limits.ts', 'src/http-worker.ts', 'src/internal-scoring.ts', 'src/composition.ts',
  'src/stream.ts', 'src/search.ts', 'src/presets.ts', 'src/index.ts', 'src/cli-controls.ts', 'bin/electional-http.mjs',
  'test/http.electional-check.ts', 'test/support/http-basic-stub.ts', 'test/internal-scoring.electional-check.ts',
  'test/composition.electional-check.ts', 'test/stream.electional-check.ts', 'test/cli.electional-check.ts',
  'test/fixtures/composition-windows.json', 'test/fixtures/stream-windows.json', 'examples/http-policy.json',
  'examples/http-controls.json', 'examples/synthetic-hours.yaml', 'scripts/check-http-esm.mjs',
  'scripts/check-search-esm.mjs', 'scripts/check-isolation.mjs', 'scripts/record-m13-tests.mjs',
  'package.json', 'package-lock.json', 'generated/engine.mjs']) {
  sha256[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
}
let eventsSource = null;
try {
  const bytes = await readFile(new URL('../../../wt-events/events/build/src/index.js', import.meta.url));
  eventsSource = { sha256: createHash('sha256').update(bytes).digest('hex'), scope: 'Read-only sibling entry bytes only.' };
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const record = { schema: 'electional-m13-test-record/v1', runtime: process.version,
  startedAt: new Date(report.startTime).toISOString(),
  command: 'npm test -- --reporter=dot --reporter=json --outputFile=generated/m13-vitest.json',
  tests: statuses(assertions), groups: Object.fromEntries(Object.entries(groups).map(([name, tests]) => [name, statuses(tests)])),
  handDerivedReference: { fixture: 'test/fixtures/composition-windows.json',
    domain: { startMs: 0, endMs: 100, clock: 'utc' },
    scope: 'Full-domain failed/satisfied/unknown states, optional sums, chronological cells, worker/CLI/HTTP transport and seam ownership.' },
  internalScoring: { enabled: 'Only separate scoreConditions(facts, { enabled: true }); never imported by consumer entries.',
    scope: 'Numeric arithmetic annotations with full per-rule weights and bounds; no ranks or reordered windows.' },
  http: { policy: 'examples/http-policy.json', controls: 'examples/http-controls.json',
    scope: 'Real local HTTP requests: strict input, admission, byte/work/range caps, deadlines during synchronous worker calls, stalled uploads, disconnects, output limits and acknowledgement ownership.' },
  executableRecord: 'docs/evidence/m13-http-esm.json',
  isolation: { command: 'npm run check:isolation', output: isolation.trim(),
    scope: 'Parent npm dry-run selection without build hook or archive creation; parent Vitest discovery without executing parent tests.' },
  eventsSource,
  skippedTests: assertions.filter(skipped).map(t => t.fullName),
  sha256,
  scope: 'Condition set logic, explicit internal opt-in and HTTP transport on the recorded runtime. Optional sibling-native checks are skipped when the events build is absent. No new astronomical accuracy, exhaustive completeness, heap, throughput or predictive claim. Historical M10/M11/M12 records describe the older builds they measured.' };
await writeFile(new URL('../generated/m13-tests.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
console.log('Wrote generated/m13-tests.json from executed tests, executable checks and isolation output.');
