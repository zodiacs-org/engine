// Measure sequentially, or verify result identity without imposing timing gates.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { build } from 'esbuild';

const project = new URL('../', import.meta.url);
const path = name => fileURLToPath(new URL(name, project));
const bytes = name => readFileSync(path(name));
const json = name => JSON.parse(bytes(name));
const digest = value => createHash('sha256').update(value).digest('hex');
const planFile = 'scripts/performance-plan.json';
const plan = json(planFile);
const mode = process.argv[2];
assert.ok(process.argv.length === 3 && ['--measure', '--check'].includes(mode), 'Use --measure or --check.');
assert.equal(process.versions.node.split('.')[0], '22', 'Use Node 22.');
assert.equal(plan.schema, 1);

function sources(directory) {
  return readdirSync(path(directory), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap(entry => {
      const name = `${directory}/${entry.name}`;
      return entry.isDirectory() ? sources(name) : name.endsWith('.ts') && !name.endsWith('.test.ts') ? [name] : [];
    });
}
const sourcePaths = [...sources('../src'), ...sources('src')];
const sourceSha256 = digest(Buffer.concat(sourcePaths.flatMap(name =>
  [Buffer.from(`${name}\0`), bytes(name), Buffer.from('\0')])));
const inputs = Object.fromEntries([planFile, 'scripts/performance.mjs', 'scripts/performance-runner.mjs',
  'scripts/build.mjs', 'tsconfig.json', 'package-lock.json'].map(name => [name, digest(bytes(name))]));
const destination = 'evidence/performance.json';
const resultEncoding = 'JSON with negative zero represented as {number:"-0"}; all numeric values must be finite. Hash includes every returned field and evaluation count.';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = measurements => ({
  medianBeforeMs: median(measurements.before.map(m => m.elapsedMs)),
  medianAfterMs: median(measurements.after.map(m => m.elapsedMs))
});
// Bound local output before compiling. No archives or parent builds.
function size(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((n, entry) => {
    const name = `${directory}/${entry.name}`;
    return n + (entry.isDirectory() ? size(name) : entry.isFile() ? statSync(name).size : 0);
  }, 0);
}
assert.ok(size(path('.')) + 10000000 < 2000000000, 'Stop: benchmark would exceed the brief disk cap; record in PHASE2.md.');
mkdirSync(path('generated/performance'), { recursive: true });
const baselinePath = `events/${plan.baselineFile}`;
const old = execFileSync('git', ['show', `${plan.baselineCommit}:${baselinePath}`], { cwd: project });
async function compile(output, baselineSource) {
  await build({ absWorkingDir: path('.'), entryPoints: [path('src/index.ts')], outfile: path(output),
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    nodePaths: [path('node_modules')],
    alias: { 'astronomy-engine': path('node_modules/astronomy-engine') },
    banner: { js: 'import { createRequire as eventsCreateRequire } from "node:module"; const require = eventsCreateRequire(import.meta.url);' },
    plugins: baselineSource === undefined ? [] : [{ name: 'baseline-adapter', setup(builder) {
      builder.onLoad({ filter: /[/\\]events[/\\]src[/\\]engine\.ts$/ }, () =>
        ({ contents: baselineSource.toString('utf8'), loader: 'ts', resolveDir: path('src') }));
    } }] });
  assert.ok(statSync(path(output)).size < 2000000);
}
const before = 'generated/performance/before.mjs', after = 'generated/performance/after.mjs';
// Build the measured source here so stale build/ files cannot claim new provenance.
await compile(after);
function run(bundle, entry) {
  return JSON.parse(execFileSync(process.execPath,
    [path('scripts/performance-runner.mjs'), path(bundle), path(planFile), entry.id],
    { cwd: project, encoding: 'utf8', maxBuffer: 1000000 }));
}
if (mode === '--check') {
  const evidence = json(destination);
  assert.deepEqual(evidence.inputs, inputs, 'Benchmark inputs changed; remeasure and review.');
  assert.equal(evidence.sourceSha256, sourceSha256, 'Runtime source changed; remeasure and review.');
  assert.equal(evidence.baseline.commit, plan.baselineCommit);
  assert.equal(evidence.baseline.file, plan.baselineFile);
  assert.equal(evidence.baseline.sha256, digest(old));
  assert.equal(evidence.resultEncoding, resultEncoding);
  assert.equal(evidence.cases.length, plan.cases.length);
  await compile(before, old);
  for (const [i, entry] of plan.cases.entries()) {
    const recorded = evidence.cases[i];
    assert.equal(recorded.id, entry.id);
    assert.equal(recorded.before.length, plan.rounds);
    assert.equal(recorded.after.length, plan.rounds);
    assert.deepEqual(recorded.summary, summary(recorded));
    for (const measurement of [...recorded.before, ...recorded.after]) {
      assert.ok(measurement.elapsedMs > 0 && measurement.maxRssKiB > 0);
      assert.deepEqual(measurement.result, recorded.result);
    }
    // Compare both implementations on this runtime. Historical numerical hashes
    // are measurements, not portable fixtures across processors or Node patches.
    assert.deepEqual(run(after, entry).result, run(before, entry).result,
      `${entry.id}: before/after result changed, including work count or numerical payload.`);
  }
  process.stdout.write('Current before/after results agree exactly; historical wall times are not CI thresholds\n');
} else {
  await compile(before, old);
  const cases = [];
  for (const entry of plan.cases) {
    const measurements = { before: [], after: [] };
    for (let round = 0; round < plan.rounds; round++) {
      for (const variant of round % 2 ? ['after', 'before'] : ['before', 'after']) {
        const measured = run(variant === 'before' ? before : after, entry);
        measurements[variant].push(measured);
        process.stdout.write(`${entry.id} ${variant} round ${round + 1}: ${Math.round(measured.elapsedMs)} ms\n`);
      }
    }
    const result = measurements.before[0].result;
    assert.equal(result.status, entry.id === 'mercury-coverage-edge' ? 'refused' : 'complete');
    if (result.status === 'refused') assert.equal(result.reason, 'engine-refused');
    for (const measurement of [...measurements.before, ...measurements.after]) {
      assert.ok(isDeepStrictEqual(result, measurement.result), `${entry.id}: before/after results differ.`);
    }
    cases.push({ id: entry.id, result, ...measurements, summary: summary(measurements) });
  }
  const evidence = { schema: 1, measuredAt: new Date().toISOString(),
    scope: plan.scope, inputs, sourceSha256, resultEncoding,
    baseline: { commit: plan.baselineCommit, file: plan.baselineFile, sha256: digest(old),
      method: 'Rebuild the current runtime with only the adapter replaced by this committed pre-optimization source. All other code and dependencies are shared.' },
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model,
      workers: 1, timing: 'Monotonic query wall time in fresh processes; imports excluded. Alternating variant order, no parallel benchmarks. Peak RSS includes imports and runtime. No timing acceptance gate.' },
    cases };
  const encoded = JSON.stringify(evidence, null, 2) + '\n';
  assert.ok(Buffer.byteLength(encoded) < 2000000);
  writeFileSync(path(destination), encoded);
  process.stdout.write('Performance measurements written with identical full result hashes\n');
}
