// Evaluators return aggregates only. Checkpoints never contain charts or raw diagnostics.
import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm, lstat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleCase, SAMPLER_VERSION } from './sampling.mjs';
import { emptyStats, mergeStats, validateStats } from './statistics.mjs';
import { MAX_FILE_BYTES } from '../tools/check.mjs';

const runtime = fileURLToPath(new URL('../runtime/', import.meta.url));
const verdicts = ['pass', 'fail', 'error', 'unsupported', 'fallback'];
const hash = value => createHash('sha256').update(value).digest('hex');
const integer = n => Number.isSafeInteger(n) && n >= 0;
const keys = (object, expected) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).sort().join(',') === [...expected].sort().join(',');
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error('Invalid campaign identity.');
}
export function campaignIdentity(config, identities) {
  if (!keys(config, ['seed', 'startMs', 'endMs', 'total', 'shards', 'channels', 'conventions',
    ...(Object.hasOwn(config ?? {}, 'quantiles') ? ['quantiles'] : [])]) ||
      !integer(config.total) || !integer(config.shards) || !config.shards || config.shards > 1000000 ||
      !config.channels || !Object.keys(config.channels).length || Object.keys(config.channels).length > 256 ||
      Object.keys(config.channels).some(k => !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(k)) ||
      !keys(identities, ['build', 'tooling', 'references']) ||
      !/^[a-f0-9]{64}$/.test(identities.build) || !/^[a-f0-9]{64}$/.test(identities.tooling) ||
      !identities.references || !Object.keys(identities.references).length) throw new Error('Invalid campaign configuration.');
  sampleCase(config, 0);
  for (const tolerance of Object.values(config.channels)) emptyStats(tolerance);
  if (Object.hasOwn(config, 'quantiles') && (!Array.isArray(config.quantiles) || !config.quantiles.length ||
      config.quantiles.length > Object.keys(config.channels).length ||
      config.quantiles.some((name, i) => typeof name !== 'string' || !Object.hasOwn(config.channels, name) ||
        (i > 0 && config.quantiles[i - 1] >= name)))) throw new Error('Invalid quantile channels; use unique sorted channel names.');
  const payload = { schema: 'crosscheck-campaign/1', sampler: SAMPLER_VERSION, config, identities };
  const bytes = canonical(payload);
  if (Buffer.byteLength(bytes) > 100000) throw new Error('Campaign identity too large.');
  return { ...JSON.parse(bytes), sha256: hash(bytes) };
}
function capacity(campaign, shard) {
  if (!integer(shard) || shard >= campaign.config.shards) throw new Error('Invalid shard.');
  return shard >= campaign.config.total ? 0 : Math.floor((campaign.config.total - 1 - shard) / campaign.config.shards) + 1;
}
function initial(campaign, shard) {
  capacity(campaign, shard);
  return { schema: 'crosscheck-checkpoint/1', campaign: campaign.sha256, shard, completed: 0,
    channels: Object.fromEntries(Object.entries(campaign.config.channels).map(([name, tolerance]) => [name,
      { stats: emptyStats(tolerance, { quantiles: campaign.config.quantiles?.includes(name) ?? false }),
        verdicts: Object.fromEntries(verdicts.map(v => [v, 0])), flags: {} }])) };
}
export function validateCheckpoint(state, campaign, shard) {
  const count = capacity(campaign, shard);
  if (!keys(state, ['schema', 'campaign', 'shard', 'completed', 'channels']) ||
      state.schema !== 'crosscheck-checkpoint/1' || state.campaign !== campaign.sha256 || state.shard !== shard ||
      !integer(state.completed) || state.completed > count || !keys(state.channels, Object.keys(campaign.config.channels))) throw new Error('Checkpoint identity or progress mismatch.');
  for (const [name, channel] of Object.entries(state.channels)) {
    if (!keys(channel, ['stats', 'verdicts', 'flags']) || !keys(channel.verdicts, verdicts)) throw new Error('Invalid checkpoint fields.');
    validateStats(channel.stats);
    if (channel.stats.tolerance !== campaign.config.channels[name] ||
        channel.stats.version !== (campaign.config.quantiles?.includes(name) ? 2 : 1) ||
        Object.values(channel.verdicts).some(n => !integer(n)) ||
        Object.values(channel.verdicts).reduce((a, b) => a + b, 0) !== state.completed ||
        channel.stats.n !== channel.verdicts.pass + channel.verdicts.fail ||
        channel.stats.passed !== channel.verdicts.pass || !channel.flags || Array.isArray(channel.flags) ||
        Object.keys(channel.flags).length > 1024 || Object.entries(channel.flags).some(([f, n]) =>
          !/^(0|[1-9][0-9]*)$/.test(f) || Number(f) > 0x7fffffff || !integer(n) || !n) ||
        Object.values(channel.flags).reduce((a, b) => a + b, 0) > state.completed) throw new Error('Invalid checkpoint aggregates.');
  }
  return state;
}
function apply(state, outcomes, campaign) {
  if (!keys(outcomes, Object.keys(state.channels))) throw new Error('Invalid evaluator channels.');
  const next = structuredClone(state);
  for (const [name, result] of Object.entries(outcomes)) {
    const allowed = ['verdict', ...(Object.hasOwn(result ?? {}, 'stats') ? ['stats'] : []), ...(Object.hasOwn(result ?? {}, 'retflags') ? ['retflags'] : [])];
    if (!keys(result, allowed) || !verdicts.includes(result.verdict)) throw new Error('Invalid evaluator outcome.');
    const channel = next.channels[name];
    if (['pass', 'fail'].includes(result.verdict)) {
      validateStats(result.stats);
      if (result.stats.n !== 1 || result.stats.passed !== Number(result.verdict === 'pass')) throw new Error('Expected one aggregate observation.');
      channel.stats = mergeStats(channel.stats, result.stats);
    } else if (result.stats !== undefined) throw new Error('Excluded outcome must have no positions.');
    channel.verdicts[result.verdict]++;
    if (result.retflags !== undefined) {
      if (!integer(result.retflags) || result.retflags > 0x7fffffff) throw new Error('Invalid returned flags.');
      channel.flags[result.retflags] = (channel.flags[result.retflags] ?? 0) + 1;
    }
  }
  next.completed++;
  return validateCheckpoint(next, campaign, state.shard);
}
async function atomicSave(path, state) {
  const bytes = JSON.stringify(state) + '\n';
  if (Buffer.byteLength(bytes) >= MAX_FILE_BYTES) throw new Error('Checkpoint exceeds file limit.');
  const temp = path + '.tmp';
  // Exclusive shard lock makes an abandoned temporary file safe to replace.
  await rm(temp, { force: true });
  const file = await open(temp, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temp, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
async function readCheckpoint(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.size >= MAX_FILE_BYTES) throw new Error('Invalid checkpoint file.');
  const file = await open(path, 'r');
  try { return JSON.parse(await file.readFile('utf8')); } finally { await file.close(); }
}
export async function runShard({ config, identities, shard, directory, evaluate, checkpointEvery = 100,
  maxCases = Number.MAX_SAFE_INTEGER, signal }) {
  const campaign = campaignIdentity(config, identities);
  config = campaign.config; // Snapshot caller configuration before asynchronous work.
  const count = capacity(campaign, shard);
  if (typeof evaluate !== 'function' || !integer(checkpointEvery) || !checkpointEvery || !integer(maxCases)) throw new Error('Invalid runner options.');
  // Only ignored runtime directories may contain generated state.
  directory = resolve(directory);
  const rel = relative(runtime, directory);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Checkpoint directory must be below crosscheck/runtime.');
  await mkdir(runtime, { recursive: true });
  if (!(await lstat(runtime)).isDirectory()) throw new Error('Runtime directory must not be a symlink.');
  let parent = runtime;
  for (const part of rel.split('/')) {
    parent = resolve(parent, part);
    await mkdir(parent, { recursive: true });
    if (!(await lstat(parent)).isDirectory()) throw new Error('Checkpoint directory must not contain symlinks.');
  }
  const path = resolve(directory, `shard-${shard}.json`);
  const lock = path + '.lock';
  await mkdir(lock); // Never steal a lock from another process, even after a crash.
  try {
    let state;
    try { state = validateCheckpoint(await readCheckpoint(path), campaign, shard); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = initial(campaign, shard); }
    let processed = 0;
    while (state.completed < count && processed < maxCases && !signal?.aborted) {
      const index = shard + state.completed * config.shards;
      let outcomes;
      try { outcomes = await evaluate(sampleCase(config, index)); }
      catch { throw new Error('Evaluator failed; uncheckpointed work will be repeated. Raw diagnostics discarded.'); }
      state = apply(state, outcomes, campaign);
      processed++;
      if (processed % checkpointEvery === 0) await atomicSave(path, state);
    }
    await atomicSave(path, state);
    return { campaign, state, complete: state.completed === count };
  } finally { await rm(lock, { recursive: true, force: true }); }
}

// Production callers verify the engine and reference receipts before supplying identities.
// This helper binds the entire authored executable harness, including the permitted adapter.
export async function runnerToolingIdentity() {
  const { fingerprintTree, fileDigest } = await import('../tools/build.mjs');
  const project = fileURLToPath(new URL('../', import.meta.url));
  const lib = await fingerprintTree(resolve(project, 'lib'));
  const tools = await fingerprintTree(resolve(project, 'tools'));
  const adapter = await fileDigest(fileURLToPath(new URL('../../conformance/adapters/pyswisseph.py', import.meta.url)));
  return hash(canonical({ lib: lib.sha256, tools: tools.sha256, adapter }));
}

export function mergeShards(campaign, states, { requireComplete = true } = {}) {
  if (states.length !== campaign.config.shards) throw new Error('Missing shards.');
  const ordered = [...states].sort((a, b) => a.shard - b.shard);
  const channels = initial(campaign, 0).channels;
  let completed = 0;
  for (let shard = 0; shard < ordered.length; shard++) {
    const state = validateCheckpoint(ordered[shard], campaign, shard);
    if (requireComplete && state.completed !== capacity(campaign, shard)) throw new Error('Incomplete shard.');
    completed += state.completed;
    for (const [name, channel] of Object.entries(state.channels)) {
      channels[name].stats = mergeStats(channels[name].stats, channel.stats);
      for (const v of verdicts) channels[name].verdicts[v] += channel.verdicts[v];
      for (const [flag, n] of Object.entries(channel.flags)) channels[name].flags[flag] = (channels[name].flags[flag] ?? 0) + n;
    }
  }
  return { campaign: campaign.sha256, completed, channels };
}
