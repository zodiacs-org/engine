import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { verifyBuild } from './build.mjs';
import { openKernel } from '../lib/kernels.mjs';
import { loadNutationTerms, erfaCatalog } from '../lib/erfa.mjs';
import { createSpkReader } from '../lib/spk.mjs';
import { runShard, runnerToolingIdentity } from '../lib/runner.mjs';
import { CHANNELS, createEvaluator } from '../lib/campaign.mjs';
import { reportFile } from './report.mjs';
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--check')) throw Error('Usage: node crosscheck/tools/sample.mjs [--check]');
const root = fileURLToPath(new URL('../', import.meta.url));
const build = await verifyBuild();
const kernel = await openKernel(join(root, 'runtime/cache/de440s'), 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2');
const terms = await loadNutationTerms();
const { natalChart } = await import('../runtime/build/index.js');
const config = { seed: 'crosscheck-m9-tt-v1', startMs: Date.UTC(1950, 0, 1), endMs: Date.UTC(2050, 0, 1),
  total: 64, shards: 2, channels: CHANNELS,
  conventions: { input: 'synthetic ISO interpreted as TT; coordinates uniform sphere; houses sampled uniformly',
    time: 'NAIF-DELTET-periodic/naif0012 TT-to-TDB', center: 'Earth center 399',
    frame: 'IAU2006-bias-precession/IAU2000B-unadjusted true ecliptic/equinox of date',
    correction: 'Moon NONE; Sun Mercury Venus CN+S; no deflection',
    residual: 'engine minus JPL; signed shortest longitude and latitude differences in arcseconds',
    tolerance: '60 arcseconds screening threshold fixed before sample; not an accuracy guarantee' } };
const identities = { build: build.sha256, tooling: await runnerToolingIdentity(),
  references: { EngineBuild: { sourceCommit: build.sourceCommit, sourceSha256: build.inputs.source.sha256, outputSha256: build.output.sha256, dependency: { name: build.inputs.dependency.name, version: build.inputs.dependency.version, sha256: build.inputs.dependency.sha256 }, nodeExecutableSha256: build.inputs.runtime.executableSha256 }, JPL: { name: kernel.receipt.name, source: kernel.receipt.source, sha256: kernel.receipt.sha256 },
    ERFA: { tag: erfaCatalog.tag ?? 'v2.0.1', nutationSha256: erfaCatalog.files['nut00b.c'] },
    Swiss: { status: 'unavailable', reason: 'No user-provided external installation or ephemeris directory' } } };
const directory = join(root, 'runtime/m9-sample');
await mkdir(directory, { recursive: true });
const controller = new AbortController();
const stop = () => controller.abort();
process.on('SIGINT', stop); process.on('SIGTERM', stop);
const states = []; let campaign;
try {
  for (let shard = 0; shard < config.shards; shard++) {
    const result = await runShard({ config, identities, shard, directory, checkpointEvery: 8,
      signal: controller.signal, evaluate: createEvaluator({ natalChart, readState: createSpkReader([kernel]), terms }) });
    campaign = result.campaign; states.push(result.state);
  }
} finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
await verifyBuild();
const bundle = { campaign, states, metadata: { title: 'Bounded synthetic TT chart comparison against DE440s',
  command: ['node', 'crosscheck/tools/sample.mjs'], runtime: { node: process.version, platform: process.platform, arch: process.arch },
  units: Object.fromEntries(Object.keys(CHANNELS).map(name => [name, 'arcseconds'])),
  exclusions: ['Swiss unavailable: no user-provided external binding or ephemerides; unsupported counts are not measurements.',
    'DE440s is the compact DE440 kernel; no DE441 comparison was run in this campaign.',
    'Only Sun, Moon, Mercury and Venus exact centers compared. Other planets omitted; system barycenters never substitute for planet centers.',
    'Houses, nodes, angles, speeds and topocentric positions are not compared. Synthetic coordinates and house systems only exercise natalChart.',
    'TT inputs bypass UTC/UT1 conversion comparison. Sampling interval is interpreted as TT despite ISO Z labels.',
    'CN+S uses converged light-time and SPICE Newtonian stellar aberration; engine light-time/aberration algorithms differ. Residuals include these model differences and frame differences.',
    'Moon is geometric without aberration or light-time. No solar deflection. Truncated TT/TDB model and IAU2000B frame limitations apply.',
    'Screening threshold is not a certified accuracy bound. No million-chart throughput or unsampled error bound is established.'] } };
const input = join(directory, 'report-bundle.json');
await writeFile(input, JSON.stringify(bundle) + '\n');
if (controller.signal.aborted) throw Error('Sample interrupted; checkpoints saved. Resume with the same command.');
await reportFile(input, 'bounded-sample', { check: args.includes('--check') });
console.log('Bounded aggregate sample ' + (args.length ? 'reproduced.' : 'written.'));
