// Aggregate resource evidence for bounded campaign invocations. No instrument output is retained.
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main as campaignMain, readRuntimeJson, validateSpec } from './campaign.mjs';
import { verifyBuild } from './build.mjs';
import { campaignIdentity, runnerToolingIdentity, validateCheckpoint } from '../lib/runner.mjs';
import { checkDiskBudget, measureDiskUsage, MAX_FILE_BYTES } from '../lib/disk-budget.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const runtime = resolve(project, 'runtime');
const repository = resolve(project, '..');
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
export const specDigest = spec => createHash('sha256').update(JSON.stringify(sorted(validateSpec(spec)))).digest('hex');

export function validatePrefixes(spec, prefixes) {
  validateSpec(spec);
  if (!Array.isArray(prefixes) || prefixes.length !== spec.shards || Object.keys(prefixes).length !== prefixes.length ||
      prefixes.some((count, shard) => count !== null && (!integer(count) || count >
        (shard >= spec.total ? 0 : Math.floor((spec.total - 1 - shard) / spec.shards) + 1))))
    throw Error('Invalid resource checkpoint prefixes.');
  return prefixes;
}

export function checkpointSnapshot(spec, states, { requireAll = false, campaign } = {}) {
  validateSpec(spec);
  if (campaign && (campaign.config?.total !== spec.total || campaign.config?.shards !== spec.shards ||
      campaign.config?.seed !== spec.seed)) throw Error('Resource campaign configuration differs from specification.');
  if (!Array.isArray(states) || states.length !== spec.shards) throw Error('Missing resource checkpoint slots.');
  const available = states.filter(state => state !== null);
  if (requireAll && available.length !== spec.shards) throw Error('Every shard checkpoint is required.');
  let sha256 = campaign?.sha256 ?? available[0]?.campaign ?? null;
  if (sha256 !== null && !digest(sha256)) throw Error('Invalid checkpoint campaign digest.');
  let inferred;
  for (let shard = 0; shard < states.length; shard++) {
    const state = states[shard];
    if (state === null) continue;
    if (!state?.channels || typeof state.channels !== 'object' || Array.isArray(state.channels)) throw Error('Invalid checkpoint channels.');
    const shape = { total: spec.total, shards: spec.shards,
      channels: Object.fromEntries(Object.entries(state.channels).map(([name, channel]) => [name, channel?.stats?.tolerance])),
      quantiles: Object.entries(state.channels).filter(([, channel]) => channel?.stats?.version === 2).map(([name]) => name).sort() };
    if (inferred && !same(inferred, shape)) throw Error('Checkpoint channel configurations differ.');
    inferred = shape;
    validateCheckpoint(state, campaign ?? { sha256, config: shape }, shard);
  }
  const completed = states.map(state => state?.completed ?? null);
  validatePrefixes(spec, completed);
  return { campaignSha256: sha256, completed };
}

function validateDisk(value) {
  if (!keys(value, ['usedBytes', 'fileCount', 'limitBytes']) || !integer(value.fileCount)) throw Error('Invalid resource disk snapshot.');
  const budget = checkDiskBudget(value.usedBytes, 0);
  if (value.limitBytes !== budget.limitBytes) throw Error('Invalid resource disk cap.');
  return value;
}
const commandText = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
  !/[\x00-\x1f\x7f\u2013\u2014]/.test(value);
function validateCommand(command) {
  if (!Array.isArray(command) || command.length < 4 || command.length > 5 || !command.every(commandText))
    throw Error('Invalid resource command.');
}

export function measuredInvocation({ spec, before, after, driverCommand, wrapperCommand,
  workingDirectory, elapsedNanoseconds, usageBefore, usageAfter, diskBefore, diskAfter }) {
  validatePrefixes(spec, before); validatePrefixes(spec, after);
  validateCommand(driverCommand); validateCommand(wrapperCommand);
  if (typeof elapsedNanoseconds !== 'bigint' || elapsedNanoseconds < 0n || elapsedNanoseconds > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error('Invalid measured elapsed duration.');
  for (const usage of [usageBefore, usageAfter]) for (const field of ['userCPUTime', 'systemCPUTime', 'maxRSS'])
    if (!integer(usage?.[field])) throw Error('Invalid Node resource usage.');
  if (usageAfter.userCPUTime < usageBefore.userCPUTime || usageAfter.systemCPUTime < usageBefore.systemCPUTime ||
      usageAfter.maxRSS < usageBefore.maxRSS) throw Error('Node resource counters decreased.');
  const entry = { wrapperCommand, driverCommand, workingDirectory, before, after,
    processed: after.reduce((sum, count, shard) => sum + (count ?? 0) - (before[shard] ?? 0), 0),
    elapsedNanoseconds: Number(elapsedNanoseconds),
    nodeUserCpuMicroseconds: usageAfter.userCPUTime - usageBefore.userCPUTime,
    nodeSystemCpuMicroseconds: usageAfter.systemCPUTime - usageBefore.systemCPUTime,
    nodeMaxRssKiB: usageAfter.maxRSS, diskBefore: validateDisk(diskBefore), diskAfter: validateDisk(diskAfter) };
  validateInvocation(spec, entry);
  return entry;
}

function validateInvocation(spec, entry) {
  if (!keys(entry, ['wrapperCommand', 'driverCommand', 'workingDirectory', 'before', 'after', 'processed', 'elapsedNanoseconds',
    'nodeUserCpuMicroseconds', 'nodeSystemCpuMicroseconds', 'nodeMaxRssKiB', 'diskBefore', 'diskAfter']))
    throw Error('Invalid resource invocation fields.');
  validatePrefixes(spec, entry.before); validatePrefixes(spec, entry.after);
  validateCommand(entry.wrapperCommand); validateCommand(entry.driverCommand);
  if (!['.', 'crosscheck'].includes(entry.workingDirectory)) throw Error('Invalid resource working directory.');
  const programPrefix = entry.workingDirectory === '.' ? 'crosscheck/tools/' : 'tools/';
  if (entry.wrapperCommand[0] !== 'node' || entry.wrapperCommand[1] !== programPrefix + 'progress.mjs' ||
      entry.driverCommand[0] !== 'node' || entry.driverCommand[1] !== programPrefix + 'campaign.mjs' ||
      !same(entry.wrapperCommand.slice(2), entry.driverCommand.slice(2))) throw Error('Resource wrapper and driver commands differ.');
  const [, , input, action, budgetText] = entry.driverCommand;
  const rel = relative(runtime, resolve(repository, entry.workingDirectory, input));
  if (!rel || rel.startsWith('..') || isAbsolute(rel) ||
      (action !== 'all' && (!/^(0|[1-9][0-9]*)$/.test(action) || Number(action) >= spec.shards)) ||
      (budgetText !== undefined && (!/^(0|[1-9][0-9]*)$/.test(budgetText) || !integer(Number(budgetText)))))
    throw Error('Invalid resource invocation arguments.');
  const budget = budgetText === undefined ? Number.MAX_SAFE_INTEGER : Number(budgetText);
  let processed = 0;
  for (let shard = 0; shard < spec.shards; shard++) {
    const before = entry.before[shard], after = entry.after[shard], selected = action === 'all' || Number(action) === shard;
    if ((before !== null && after === null) || (selected && after === null) ||
        (!selected && before !== after) || (after ?? 0) < (before ?? 0) || (after ?? 0) - (before ?? 0) > budget)
      throw Error('Resource invocation progress or case budget mismatch.');
    processed += (after ?? 0) - (before ?? 0);
  }
  if (entry.processed !== processed || !['processed', 'elapsedNanoseconds', 'nodeUserCpuMicroseconds',
    'nodeSystemCpuMicroseconds', 'nodeMaxRssKiB'].every(field => integer(entry[field]))) throw Error('Invalid resource measurements.');
  validateDisk(entry.diskBefore); validateDisk(entry.diskAfter);
}

export function validateLedger(ledger, spec) {
  if (!keys(ledger, ['schema', 'spec', 'specSha256', 'campaignSha256', 'invocations']) ||
      ledger.schema !== 'crosscheck-resource-progress/1' || !same(ledger.spec, spec) ||
      ledger.specSha256 !== specDigest(spec) || !digest(ledger.campaignSha256) ||
      !Array.isArray(ledger.invocations) || !ledger.invocations.length || ledger.invocations.length > 1000)
    throw Error('Invalid resource ledger identity.');
  let previous;
  for (const entry of ledger.invocations) {
    validateInvocation(spec, entry);
    if (previous ? !same(previous, entry.before) : entry.before.some(value => value !== null && value !== 0))
      throw Error('Unrecorded campaign progress or discontinuous resource ledger.');
    previous = entry.after;
  }
  return ledger;
}

export function renderResources(ledger, spec, snapshot) {
  validateLedger(ledger, spec);
  validatePrefixes(spec, snapshot.completed);
  if (snapshot.completed.includes(null) || ledger.campaignSha256 !== snapshot.campaignSha256 ||
      !same(ledger.invocations.at(-1).after, snapshot.completed)) throw Error('Resource ledger does not match final checkpoints.');
  const completed = snapshot.completed.reduce((sum, count) => sum + count, 0);
  const sum = field => ledger.invocations.reduce((total, entry) => total + entry[field], 0);
  const caveats = [
    'Elapsed durations cover measured campaign driver calls, including the optional external adapter and verified reference/build startup. They exclude resource snapshot scans and ledger/report rendering.',
    'CPU deltas and maximum RSS describe only the Node wrapper process. They exclude child adapter CPU and memory. Maximum RSS is the process high-water mark since wrapper startup, not an invocation delta or total-process peak.',
    'Disk snapshots count logical file bytes under crosscheck/runtime and crosscheck/cache, including kernels. The after snapshot precedes writing that invocation to the resource ledger.',
    'Commands record the node program name, exact supplied program arguments and working directory relative to the repository root. Environment selectors are required for an enabled external instrument and are never copied into this receipt.',
    'Completed indices are checkpoint residue-class prefixes, not continuous coverage. A requested target is not a completed measurement. No throughput guarantee or unsampled accuracy bound is implied.'
  ];
  const report = sorted({ ...ledger, completed, requested: spec.total, complete: completed === spec.total,
    checkpointPrefixes: snapshot.completed, totals: { processed: sum('processed'), elapsedNanoseconds: sum('elapsedNanoseconds'),
      nodeUserCpuMicroseconds: sum('nodeUserCpuMicroseconds'), nodeSystemCpuMicroseconds: sum('nodeSystemCpuMicroseconds'),
      nodeMaxRssKiB: Math.max(...ledger.invocations.map(entry => entry.nodeMaxRssKiB)) }, caveats });
  const lines = ['# Campaign progress resource evidence', '',
    `Completed synthetic charts: ${completed}; requested: ${spec.total}. Status: ${report.complete ? 'complete' : 'partial'}.`, '',
    `Campaign SHA-256: \`${ledger.campaignSha256}\`.`, `Specification SHA-256: \`${ledger.specSha256}\`.`,
    `Specification: \`${JSON.stringify(sorted(spec))}\`.`, `Final per-shard completed prefixes: \`${JSON.stringify(snapshot.completed)}\`.`, '',
    '| Invocation | Processed | Elapsed ns | Node user CPU us | Node system CPU us | Node maximum RSS KiB | Disk bytes before | Disk bytes after |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...ledger.invocations.map((entry, index) => `| ${index + 1} | ${entry.processed} | ${entry.elapsedNanoseconds} | ${entry.nodeUserCpuMicroseconds} | ${entry.nodeSystemCpuMicroseconds} | ${entry.nodeMaxRssKiB} | ${entry.diskBefore.usedBytes} | ${entry.diskAfter.usedBytes} |`), '',
    ...ledger.invocations.flatMap((entry, index) => [`Invocation ${index + 1} wrapper argument vector: \`${JSON.stringify(entry.wrapperCommand)}\`.`,
      `Invocation ${index + 1} driver argument vector: \`${JSON.stringify(entry.driverCommand)}\`.`,
      `Working directory relative to repository root: \`${entry.workingDirectory}\`.`,
      `Checkpoint prefixes: \`${JSON.stringify(entry.before)}\` to \`${JSON.stringify(entry.after)}\`.`, '']),
    ...caveats.map(value => '- ' + value), ''];
  const outputs = { json: JSON.stringify(report, null, 2) + '\n', markdown: lines.join('\n') };
  if (Object.values(outputs).some(value => Buffer.byteLength(value) >= MAX_FILE_BYTES)) throw Error('Resource report exceeds file limit.');
  return outputs;
}

async function readStates(spec, directory) {
  return Promise.all(Array.from({ length: spec.shards }, async (_, shard) => {
    try { return await readRuntimeJson(resolve(directory, `shard-${shard}.json`)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }));
}
async function safeDirectory(directory) {
  const rel = relative(runtime, directory);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Resource directory must be below runtime.');
  let current = runtime;
  for (const part of ['', ...rel.split('/')]) {
    current = resolve(current, part);
    await mkdir(current, { recursive: true });
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Resource directory symlinks forbidden.');
  }
}
async function atomicLedger(path, ledger) {
  const bytes = JSON.stringify(sorted(ledger)) + '\n';
  if (Buffer.byteLength(bytes) >= MAX_FILE_BYTES) throw Error('Resource ledger exceeds file limit.');
  const usage = await measureDiskUsage(); checkDiskBudget(usage.usedBytes, Buffer.byteLength(bytes));
  const temporary = path + '.tmp', file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
}

export async function main(args) {
  const [input, action, ...options] = args;
  if (!input || !action || options.length > 1 || (['report', 'check'].includes(action) && options.length))
    throw Error('Usage: progress.mjs SPEC all|SHARD|report|check [MAX_CASES]');
  const spec = validateSpec(await readRuntimeJson(input)), directory = resolve(runtime, 'campaigns', spec.name);
  const workingDirectory = relative(repository, process.cwd()) || '.';
  if (!['.', 'crosscheck'].includes(workingDirectory)) throw Error('Run resource commands from the repository root or crosscheck.');
  const ledgerPath = resolve(directory, 'resource-progress.json');
  if (['report', 'check'].includes(action)) {
    const ledger = await readRuntimeJson(ledgerPath);
    const bundle = await readRuntimeJson(resolve(directory, 'progress-bundle.json'));
    const campaign = campaignIdentity(bundle.campaign.config, bundle.campaign.identities);
    if (!same(campaign, bundle.campaign) || campaign.identities.tooling !== await runnerToolingIdentity())
      throw Error('Resource report campaign or current tooling identity mismatch.');
    if ((await verifyBuild()).sha256 !== campaign.identities.build) throw Error('Resource report build identity mismatch.');
    const snapshot = checkpointSnapshot(spec, await readStates(spec, directory), { requireAll: true, campaign });
    if (!same(bundle.states, await readStates(spec, directory))) throw Error('Progress report bundle is stale.');
    const outputs = renderResources(ledger, spec, snapshot), name = spec.name + '-progress-resources';
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(name)) throw Error('Resource report name is too long.');
    const reportDirectory = await lstat(resolve(project, 'reports'));
    if (!reportDirectory.isDirectory() || reportDirectory.isSymbolicLink()) throw Error('Regular resource report directory required.');
    for (const [key, extension] of [['json', 'json'], ['markdown', 'md']]) {
      const path = resolve(project, 'reports', name + '.' + extension);
      try { if ((await lstat(path)).isSymbolicLink()) throw Error('Resource report symlinks forbidden.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (action === 'check') { if (await readFile(path, 'utf8') !== outputs[key]) throw Error('Resource report differs.'); }
      else await writeFile(path, outputs[key], { flag: 'wx' });
    }
    console.log('Campaign resource report ' + (action === 'check' ? 'verified.' : 'written.'));
    return;
  }
  // Validate command and budget before creating any campaign state.
  const programPrefix = workingDirectory === '.' ? 'crosscheck/tools/' : 'tools/';
  const command = ['node', programPrefix + 'campaign.mjs', ...args];
  validateCommand(command);
  if (action !== 'all' && (!/^(0|[1-9][0-9]*)$/.test(action) || Number(action) >= spec.shards)) throw Error('Invalid resource shard.');
  if (options.length && (!/^(0|[1-9][0-9]*)$/.test(options[0]) || !integer(Number(options[0])))) throw Error('Invalid resource case budget.');
  await safeDirectory(directory);
  const lock = resolve(directory, '.resource-progress.lock');
  await mkdir(lock);
  try {
    let ledger;
    try { ledger = validateLedger(await readRuntimeJson(ledgerPath), spec); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const before = checkpointSnapshot(spec, await readStates(spec, directory));
    if (ledger ? before.campaignSha256 !== ledger.campaignSha256 || !same(before.completed, ledger.invocations.at(-1).after) :
      before.completed.some(value => value !== null && value !== 0)) throw Error('Unrecorded campaign work; resource measurement refused.');
    const diskBefore = await measureDiskUsage(); checkDiskBudget(diskBefore.usedBytes, 0);
    const usageBefore = process.resourceUsage(), start = process.hrtime.bigint();
    await campaignMain(args);
    const elapsedNanoseconds = process.hrtime.bigint() - start, usageAfter = process.resourceUsage();
    const after = checkpointSnapshot(spec, await readStates(spec, directory));
    if (!after.campaignSha256 || (ledger && after.campaignSha256 !== ledger.campaignSha256)) throw Error('Resource campaign identity changed.');
    const diskAfter = await measureDiskUsage();
    const entry = measuredInvocation({ spec, before: before.completed, after: after.completed,
      wrapperCommand: ['node', programPrefix + 'progress.mjs', ...args], driverCommand: command,
      workingDirectory, elapsedNanoseconds, usageBefore, usageAfter, diskBefore, diskAfter });
    ledger ??= { schema: 'crosscheck-resource-progress/1', spec, specSha256: specDigest(spec),
      campaignSha256: after.campaignSha256, invocations: [] };
    ledger.invocations.push(entry);
    await atomicLedger(ledgerPath, validateLedger(ledger, spec));
    console.log(`Measured campaign progress: ${entry.processed} additional synthetic charts.`);
  } finally { await rm(lock, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
