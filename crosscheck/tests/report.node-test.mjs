import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runShard } from '../lib/runner.mjs';
import { emptyStats, addResidual } from '../lib/statistics.mjs';
import { renderReport } from '../lib/report.mjs';
import { reportFile } from '../tools/report.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t, partial = false) {
  await mkdir(root + 'runtime', { recursive: true });
  const directory = await mkdtemp(root + 'runtime/report-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { seed: 'invented-report', startMs: 0, endMs: 1000, total: 6, shards: 2,
    channels: { arithmetic: 1, missing: 1 }, conventions: { reference: 'invented arithmetic only' } };
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { invented: 'not an astronomical instrument' } };
  const states = []; let campaign;
  for (let shard = 0; shard < 2; shard++) {
    const result = await runShard({ config, identities, directory, shard, maxCases: partial ? 1 : 100,
      evaluate: async c => ({ arithmetic: c.index === 4 ? { verdict: 'fallback', retflags: 4 } :
        { verdict: c.index % 2 ? 'pass' : 'fail', stats: addResidual(emptyStats(1), c.index % 2 ? 1 : -2), retflags: 2 },
      missing: { verdict: c.index === 5 ? 'error' : 'unsupported' } }) });
    states.push(result.state); campaign = result.campaign;
  }
  return { directory, bundle: { campaign, states, metadata: { title: 'Invented arithmetic tooling test',
    command: ['node', 'invented command', 'a,b"c'], runtime: { node: process.version, platform: process.platform, arch: process.arch },
    units: { arithmetic: 'test,unit', missing: 'test unit' }, exclusions: ['No physical comparison performed'] } } };
}
test('reports independently counted verdicts and arithmetic, sorting, quoting and empty groups', async t => {
  const { bundle } = await fixture(t);
  const output = renderReport(bundle);
  assert.deepEqual(output, renderReport({ ...bundle, states: [...bundle.states].reverse() }));
  const report = JSON.parse(output.json), c = report.channels.arithmetic;
  assert.equal(report.completed, 6); assert.equal(report.complete, true);
  assert.deepEqual(c.verdicts, { pass: 3, fail: 2, error: 0, unsupported: 0, fallback: 1 });
  assert.ok(Math.abs(c.statistics.mean - (-1/5)) < 1e-15); assert.equal(c.statistics.meanAbs, 7/5);
  assert.equal(c.statistics.rms, Math.sqrt(11/5)); assert.equal(c.statistics.maxAbs, 2);
  assert.equal(report.channels.missing.statistics.mean, null);
  assert.deepEqual(report.coverage.map(c => [c.firstIndex,c.lastIndex,c.stride]), [[0,4,2],[1,5,2]]);
  assert.ok(output.csv.includes('"test,unit"')); assert.ok(output.csv.includes('"{""2"":5,""4"":1}"'));
  assert.ok(output.markdown.includes('unavailable'));
  assert.deepEqual(report.metadata.command, bundle.metadata.command);
});
test('partial reports require explicit opt-in and do not claim requested coverage', async t => {
  const { bundle } = await fixture(t, true);
  assert.throws(() => renderReport(bundle), /Incomplete/);
  const report = JSON.parse(renderReport(bundle, { allowPartial: true }).json);
  assert.equal(report.completed, 2); assert.equal(report.complete, false);
  assert.deepEqual(report.coverage.map(c => c.lastIndex), [0,1]);
});
test('rejects raw payloads, changed campaign identity and missing units or exclusions', async t => {
  const { bundle } = await fixture(t);
  for (const change of [b => { b.states[0].positions = [123]; }, b => { b.states[0].channels.arithmetic.stats.raw = 123; },
    b => { b.campaign.config.seed = 'changed'; }, b => { delete b.metadata.units.missing; },
    b => { b.metadata.exclusions = []; }, b => { b.metadata.stdout = 'raw'; }]) {
    const changed = structuredClone(bundle); change(changed);
    assert.throws(() => renderReport(changed));
  }
});
test('CLI helper writes aggregate artifacts, reproduces bytes and refuses overwrites and unsafe paths', async t => {
  const { directory, bundle } = await fixture(t);
  const input = directory + '/bundle.json', name = 'invented-report-test-' + process.pid;
  const paths = ['json','md','csv'].map(ext => root + 'reports/' + name + '.' + ext);
  t.after(() => Promise.all(paths.map(path => rm(path, { force: true }))));
  await writeFile(input, JSON.stringify(bundle));
  await reportFile(input, name); await reportFile(input, name, { check: true });
  await assert.rejects(reportFile(input, name), { code: 'EEXIST' });
  await writeFile(paths[2], (await readFile(paths[2], 'utf8')) + 'changed');
  await assert.rejects(reportFile(input, name, { check: true }), /differs/);
  await assert.rejects(reportFile(input, '../escape'), /name/);
  await assert.rejects(reportFile(root + 'PLAN.md', name), /outside/);
  await symlink(input, directory + '/link.json');
  await assert.rejects(reportFile(directory + '/link.json', name), /symlinks/);
});
test('report output limit refuses excessive shard coverage', async t => {
  const { bundle } = await fixture(t);
  const { campaignIdentity } = await import('../lib/runner.mjs');
  bundle.campaign = campaignIdentity({ ...bundle.campaign.config, total: 0, shards: 20000 }, bundle.campaign.identities);
  bundle.states = Array.from({ length: 20000 }, (_, shard) => ({ schema: 'crosscheck-checkpoint/1',
    campaign: bundle.campaign.sha256, shard, completed: 0,
    channels: Object.fromEntries(Object.keys(bundle.campaign.config.channels).map(name => [name,
      { stats: emptyStats(1), verdicts: { pass: 0, fail: 0, error: 0, unsupported: 0, fallback: 0 }, flags: {} }])) }));
  assert.throws(() => renderReport(bundle), /file limit/);
});
