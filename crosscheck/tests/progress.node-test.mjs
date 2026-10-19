import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkpointSnapshot, measuredInvocation, renderResources, specDigest, validateLedger, validatePrefixes } from '../tools/progress.mjs';
import { campaignIdentity } from '../lib/runner.mjs';
import { addResidual, emptyStats } from '../lib/statistics.mjs';

const spec = { name: 'invented-progress', kernel: 'de440s', seed: 'invented', total: 11, shards: 2 };
const config = { seed: spec.seed, total: spec.total, shards: spec.shards, startMs: 0, endMs: 100,
  channels: { invented: 2 }, conventions: { invented: 'Independent resource arithmetic only' } };
const campaign = campaignIdentity(config, { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { invented: 'arithmetic' } });
const disk = { usedBytes: 100, fileCount: 3, limitBytes: 6_000_000_000 };
const usage = { userCPUTime: 10, systemCPUTime: 20, maxRSS: 30 };
function invocation(before, after, action = 'all', budget = '2') {
  return measuredInvocation({ spec, before, after, workingDirectory: '.',
    wrapperCommand: ['node', 'crosscheck/tools/progress.mjs', 'crosscheck/runtime/invented-progress.json', action, budget],
    driverCommand: ['node', 'crosscheck/tools/campaign.mjs', 'crosscheck/runtime/invented-progress.json', action, budget],
    elapsedNanoseconds: 2_500_000_000n, usageBefore: usage,
    usageAfter: { userCPUTime: 110, systemCPUTime: 70, maxRSS: 80 }, diskBefore: disk,
    diskAfter: { ...disk, usedBytes: 200, fileCount: 4 } });
}
function ledger(entries = [invocation([null, null], [2, 2])]) {
  return { schema: 'crosscheck-resource-progress/1', spec, specSha256: specDigest(spec), campaignSha256: campaign.sha256,
    invocations: entries };
}
function checkpoint(shard, completed) {
  let stats = emptyStats(2);
  for (let i = 0; i < completed; i++) stats = addResidual(stats, 1);
  return { schema: 'crosscheck-checkpoint/1', campaign: campaign.sha256, shard, completed,
    channels: { invented: { stats, verdicts: { pass: completed, fail: 0, error: 0, unsupported: 0, fallback: 0 }, flags: {} } } };
}

test('resource measurements use counter differences and measured duration, with explicit process high-water RSS', () => {
  const entry = invocation([0, 0], [2, 2]);
  assert.equal(entry.processed, 4);
  assert.equal(entry.elapsedNanoseconds, 2_500_000_000);
  assert.equal(entry.nodeUserCpuMicroseconds, 100);
  assert.equal(entry.nodeSystemCpuMicroseconds, 50);
  assert.equal(entry.nodeMaxRssKiB, 80);
  assert.equal(entry.diskBefore.usedBytes, 100);
  assert.equal(entry.diskAfter.usedBytes, 200);
  const output = renderResources(ledger([entry]), spec, { campaignSha256: campaign.sha256, completed: [2, 2] });
  const report = JSON.parse(output.json);
  assert.equal(report.totals.elapsedNanoseconds, 2_500_000_000);
  assert.equal(report.totals.nodeMaxRssKiB, 80);
  assert(output.markdown.includes('exclude child adapter CPU and memory'));
  assert(output.markdown.includes('not an invocation delta or total-process peak'));
  assert.equal(report.complete, false);
  assert.equal(report.completed, 4);
  assert.equal(report.requested, 11);
});

test('resource ledger enforces exact continuity, budget and selected-shard progress', () => {
  const entries = [invocation([null, null], [0, 0], 'all', '0'), invocation([0, 0], [1, 1], 'all', '1'),
    invocation([1, 1], [3, 1], '0', '2')];
  assert.equal(validateLedger(ledger(entries), spec).invocations.length, 3);
  assert.throws(() => invocation([0, 0], [3, 2]), /budget/);
  assert.throws(() => invocation([2, 2], [1, 2]), /progress/);
  assert.throws(() => invocation([0, 0], [2, 1], '0'), /progress/);
  assert.throws(() => invocation([null, null], [null, 0], 'all', '0'), /progress/);
  assert.throws(() => validateLedger(ledger([invocation([1, 1], [2, 2])]), spec), /Unrecorded/);
  assert.throws(() => validateLedger(ledger([entries[0], entries[2]]), spec), /discontinuous/);
  assert.throws(() => validateLedger({ ...ledger(entries), specSha256: 'f'.repeat(64) }, spec), /identity/);
});

test('resource validation refuses nonfinite durations, invalid counters, disk overflow and raw fields', () => {
  const args = { spec, before: [0, 0], after: [2, 2], workingDirectory: '.',
    wrapperCommand: ['node', 'crosscheck/tools/progress.mjs', 'crosscheck/runtime/invented-progress.json', 'all', '2'],
    driverCommand: ['node', 'crosscheck/tools/campaign.mjs', 'crosscheck/runtime/invented-progress.json', 'all', '2'],
    elapsedNanoseconds: 1n, usageBefore: usage, usageAfter: usage, diskBefore: disk, diskAfter: disk };
  for (const elapsedNanoseconds of [-1n, 1, BigInt(Number.MAX_SAFE_INTEGER) + 1n])
    assert.throws(() => measuredInvocation({ ...args, elapsedNanoseconds }), /elapsed/);
  assert.throws(() => measuredInvocation({ ...args, usageAfter: { ...usage, userCPUTime: 0 } }), /decreased/);
  assert.throws(() => measuredInvocation({ ...args, diskAfter: { ...disk, usedBytes: 6_000_000_001 } }), /budget/);
  assert.throws(() => measuredInvocation({ ...args, diskAfter: { ...disk, limitBytes: 7_000_000_000 } }), /cap/);
  const contaminated = ledger(); contaminated.invocations[0].rawStdout = 'invented prohibited marker';
  assert.throws(() => validateLedger(contaminated, spec), /fields/);
  assert.throws(() => validatePrefixes(spec, [7, 0]), /prefixes/);
  assert.throws(() => validatePrefixes(spec, [1, -1]), /prefixes/);
  assert.throws(() => validatePrefixes(spec, [0]), /prefixes/);
  assert.throws(() => measuredInvocation({ ...args, driverCommand: [...args.driverCommand.slice(0, 2), '/outside/spec.json', 'all', '2'] }), /differ/);
  assert.throws(() => measuredInvocation({ ...args, workingDirectory: '..' }), /working directory/);
});

test('stored command paths resolve against recorded execution directory, independently of renderer cwd', () => {
  const entry = invocation([0, 0], [2, 2]);
  const projectEntry = structuredClone(entry);
  projectEntry.workingDirectory = 'crosscheck';
  projectEntry.wrapperCommand[1] = 'tools/progress.mjs';
  projectEntry.driverCommand[1] = 'tools/campaign.mjs';
  projectEntry.wrapperCommand[2] = projectEntry.driverCommand[2] = 'runtime/invented-progress.json';
  const fromRoot = ledger([entry]), fromProject = ledger([projectEntry]);
  validateLedger(fromRoot, spec); validateLedger(fromProject, spec);
  const original = process.cwd();
  try {
    process.chdir(fileURLToPath(new URL('../', import.meta.url)));
    validateLedger(fromRoot, spec); validateLedger(fromProject, spec);
    process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
    validateLedger(fromRoot, spec); validateLedger(fromProject, spec);
  } finally { process.chdir(original); }
  const wrongInput = structuredClone(projectEntry);
  wrongInput.wrapperCommand[2] = wrongInput.driverCommand[2] = 'crosscheck/runtime/invented-progress.json';
  assert.throws(() => validateLedger(ledger([wrongInput]), spec), /arguments/);
});

test('checkpoint snapshots validate aggregates and bind every present shard to one campaign', () => {
  assert.deepEqual(checkpointSnapshot(spec, [null, null]), { campaignSha256: null, completed: [null, null] });
  assert.deepEqual(checkpointSnapshot(spec, [checkpoint(0, 2), null]), { campaignSha256: campaign.sha256, completed: [2, null] });
  assert.throws(() => checkpointSnapshot(spec, [checkpoint(0, 2), null], { requireAll: true }), /Every shard/);
  const states = [checkpoint(0, 2), checkpoint(1, 2)];
  assert.deepEqual(checkpointSnapshot(spec, states, { requireAll: true, campaign }),
    { campaignSha256: campaign.sha256, completed: [2, 2] });
  assert.throws(() => checkpointSnapshot({ ...spec, seed: 'changed' }, states, { campaign }), /configuration/);
  const corrupt = structuredClone(states); corrupt[1].channels.invented.verdicts.pass++;
  assert.throws(() => checkpointSnapshot(spec, corrupt), /aggregate/);
  const changed = structuredClone(states); changed[1].campaign = 'c'.repeat(64);
  assert.throws(() => checkpointSnapshot(spec, changed), /mismatch/);
});

test('resource rendering reproduces exactly and rejects stale progress or unbound campaigns', () => {
  const input = ledger([invocation([null, null], [1, 1], 'all', '1'), invocation([1, 1], [3, 3])]);
  const snapshot = { campaignSha256: campaign.sha256, completed: [3, 3] };
  const first = renderResources(input, spec, snapshot);
  assert.deepEqual(renderResources(JSON.parse(JSON.stringify(input)), { ...spec }, snapshot), first);
  const report = JSON.parse(first.json);
  assert.equal(report.completed, 6);
  assert.equal(report.totals.processed, 6);
  assert.equal(report.totals.elapsedNanoseconds, 5_000_000_000);
  assert.equal(report.totals.nodeUserCpuMicroseconds, 200);
  assert.equal(report.totals.nodeMaxRssKiB, 80);
  assert.throws(() => renderResources(input, spec, { ...snapshot, completed: [4, 3] }), /final checkpoints/);
  assert.throws(() => renderResources(input, spec, { ...snapshot, campaignSha256: 'c'.repeat(64) }), /final checkpoints/);
  assert.throws(() => renderResources(input, spec, { ...snapshot, completed: [3, null] }), /final checkpoints/);
  assert(!/[\u2013\u2014]/.test(first.markdown));
});
