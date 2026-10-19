// Operational driver. Raw instrument values remain inside transient evaluators.
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBuild } from './build.mjs';
import { MAX_FILE_BYTES } from './check.mjs';
import { reportFile } from './report.mjs';
import { openKernel } from '../lib/kernels.mjs';
import { loadNutationTerms, erfaCatalog } from '../lib/erfa.mjs';
import { createSpkReader } from '../lib/spk.mjs';
import { CHANNELS, TARGETS, createEvaluator } from '../lib/campaign.mjs';
import { campaignIdentity, runShard, validateCheckpoint } from '../lib/runner.mjs';
import { runnerToolingIdentity } from '../lib/runner.mjs';
import { openSwiss } from '../lib/swiss.mjs';
import { SAMPLE_SPAN, createReferencePlan, selectReference } from '../lib/reference-plan.mjs';
import { groupedChannels, createGroupedEvaluator, DISTANCE_SCREEN_KM } from '../lib/wide-campaign.mjs';
import { assertDiskBudget } from '../lib/disk-budget.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const runtime = resolve(project, 'runtime');
export async function readRuntimeJson(path) {
  path = resolve(path);
  const rel = relative(runtime, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw Error('Input must be below crosscheck/runtime.');
  let current = runtime;
  for (const part of ['', ...rel.split('/')]) {
    current = resolve(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw Error('Input symlinks forbidden.');
  }
  const info = await lstat(path);
  if (!info.isFile() || info.size >= MAX_FILE_BYTES) throw Error('Invalid input file size or type.');
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { throw Error('Invalid input JSON; raw diagnostics discarded.'); }
}

export function validateSpec(spec) {
  if (!spec || Object.keys(spec).sort().join(',') !== (Object.hasOwn(spec, 'profile') ? 'kernel,name,profile,seed,shards,total' : 'kernel,name,seed,shards,total') ||
      typeof spec.name !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(spec.name) ||
      !['de440s', 'de440', 'de441_part-2'].includes(spec.kernel) ||
      !Number.isSafeInteger(spec.total) || spec.total < 1 ||
      !Number.isSafeInteger(spec.shards) || spec.shards < 1 || spec.shards > 64 ||
      typeof spec.seed !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(spec.seed) ||
      (Object.hasOwn(spec, 'profile') && (spec.profile !== 'phase2' || spec.kernel !== 'de440' || spec.shards > 3))) throw Error('Invalid campaign specification.');
  return { ...spec };
}

export function phase2Config(spec, plan, { swiss = false } = {}) {
  if (spec.profile !== 'phase2' || plan.groups.DE440.status !== 'available' ||
      plan.groups.DE441.status !== 'empty') throw Error('Verified full-span reference plan required.');
  const channels = groupedChannels();
  return { seed: spec.seed, total: spec.total, shards: spec.shards,
    startMs: SAMPLE_SPAN.startMs, endMs: SAMPLE_SPAN.endMs, channels,
    quantiles: Object.keys(channels).filter(name => /^(JPL|Convention|Swiss|SwissJPL)\.DE44[01]\./.test(name)).sort(),
    conventions: { input: 'Synthetic TT; uniform sphere; random house systems; half-open 1800-01-01 to 2200-01-01',
      frame: 'IAU2006 bias/precession and unadjusted IAU2000B true ecliptic/equinox of date',
      correction: 'JPL Moon NONE; Sun Mercury Venus CN+REL with no deflection; Earth center 399; NAIF periodic TT/TDB',
      residual: 'JPL channels: engine minus relativistic JPL direction in arcseconds; distance in km',
      conventionDifference: 'Convention channels: CN+REL minus CN+S direction using the same JPL kernel, TT/TDB and frame; Moon zero. Separate model sensitivity, not engine error or a correction to aggregate maxima.',
      distance: 'Engine calc apparent geocentric light path in au converted to km minus JPL converged light path; geometric Moon. calc uses binary64 JD = TT days since J2000 + 2451545; chart uses original millisecond instant.',
      limitations: 'Engine backdated-observer aberration, light-time, frame and truncated TT/TDB differences remain in residuals. No solar deflection or moving-body ray integration; convention delta isolates only the selected aberration models.',
      tolerance: `60 arcseconds and ${DISTANCE_SCREEN_KM} km screening only; fixed before pilot, not accuracy bounds`,
      referenceGroups: Object.fromEntries(Object.entries(plan.groups).map(([group, item]) => [group,
        { status: item.status, intervals: item.intervals, reason: item.reason }])),
      unavailableBodies: Object.fromEntries(Object.entries(plan.bodies).filter(([, item]) => item.status === 'unavailable')
        .map(([body, item]) => [body, item.reason])),
      Swiss: swiss ? 'Optional external apparent geocentric true-of-date instrument; SWIEPH responses only. Swiss channels: engine minus Swiss; SwissJPL channels: Swiss minus JPL, in arcseconds. Same chart and a single adapter response per exact body.' : 'unavailable',
      SwissConventionDifference: 'Swiss apparent places include its deflection model and lunar apparent corrections; JPL has no deflection and uses geometric Moon. Frame, ephemeris and TT Julian-date rounding differences remain. Instrument comparisons are separate from JPL accuracy and convention channels; never subtract aggregate maxima.' } };
}

export function swissSelection(env) {
  const python = env.CROSSCHECK_PYTHON, ephemerisPath = env.SE_EPHE_PATH;
  if ((python !== undefined && !python) || (ephemerisPath !== undefined && !ephemerisPath) || (python && !ephemerisPath))
    throw Error('Configured Swiss instrument requires a nonempty external SE_EPHE_PATH; CROSSCHECK_PYTHON must be nonempty when supplied.');
  return ephemerisPath ? { ephemerisPath, python: python || 'python3' } : null;
}

export function swissChannels() {
  return Object.fromEntries(Object.keys(TARGETS).flatMap(body => ['lon', 'lat'].map(axis => [`Swiss.${body}.${axis}`, 60])));
}
export function withSwiss(evaluate, natalChart, swiss) {
  return async sample => {
    const outcomes = await evaluate(sample);
    const chart = natalChart({ utc: sample.utc, timeScale: 'tt', latitude: sample.latitude,
      longitude: sample.longitude, houseSystem: sample.houseSystem });
    const jdTT = Date.parse(sample.utc) / 86400000 + 2440587.5;
    for (const body of Object.keys(TARGETS)) {
      const result = await swiss.comparePosition({ body, jdTT,
        actual: chart.bodies.find(value => value.body === body), toleranceArcsec: 60 });
      for (const axis of ['lon', 'lat']) {
        const stats = result.stats?.[axis];
        outcomes[`Swiss.${body}.${axis}`] = { verdict: stats ? (stats.passed ? 'pass' : 'fail') : result.verdict,
          ...(stats ? { stats } : {}), ...(result.retflags === undefined ? {} : { retflags: result.retflags }) };
      }
    }
    return outcomes;
  };
}

// Injection permits end-to-end operational tests using invented arithmetic only.
export async function executeCampaign({ spec, config, identities, evaluate, directory,
  shard = 'all', maxCases = Number.MAX_SAFE_INTEGER, signal }) {
  validateSpec(spec);
  const campaign = campaignIdentity(config, identities);
  const selected = shard === 'all' ? Array.from({ length: spec.shards }, (_, i) => i) : [shard];
  if (config.total !== spec.total || config.shards !== spec.shards ||
      selected.some(i => !Number.isSafeInteger(i) || i < 0 || i >= spec.shards)) throw Error('Invalid campaign shard or configuration.');
  const results = [];
  for (const index of selected) results.push(await runShard({ config, identities, evaluate, directory,
    shard: index, maxCases, checkpointEvery: 100, signal }));
  return { campaign, complete: results.every(result => result.complete) };
}

export async function main(args) {
  const [input, action, ...options] = args;
  if (!input || !action || options.length > 1) throw Error('Usage: campaign.mjs SPEC all|SHARD|report|check [MAX_CASES]');
  const spec = validateSpec(await readRuntimeJson(input));
  const reporting = ['report', 'check'].includes(action);
  if (reporting && options.length) throw Error('Report takes no budget.');
  const shard = action === 'all' ? 'all' : Number(action);
  const maxCases = options.length ? Number(options[0]) : Number.MAX_SAFE_INTEGER;
  if (!reporting && ((action !== 'all' && (!/^(0|[1-9][0-9]*)$/.test(action) || shard >= spec.shards)) ||
      !Number.isSafeInteger(maxCases) || maxCases < 0)) throw Error('Invalid shard or budget.');
  const build = await verifyBuild();
  // Reserve bounded shard checkpoints, temporary writes and report artifacts.
  await assertDiskBudget((spec.shards + 4) * MAX_FILE_BYTES * 2);
  const kernel = await openKernel(resolve(runtime, 'cache', spec.kernel));
  const terms = await loadNutationTerms();
  const { natalChart } = await import('../runtime/build/index.js');
  const wide = spec.profile === 'phase2';
  const plan = wide ? createReferencePlan([kernel]) : null;
  const { calc } = wide ? await import('../runtime/build/calc.js') : {};
  // Swiss is enabled explicitly via external environment selectors, never auto-installed.
  let swiss;
  try {
    const selection = swissSelection(process.env);
    if (selection) swiss = await openSwiss(selection);
    const config = wide ? phase2Config(spec, plan, { swiss: Boolean(swiss) }) : { seed: spec.seed, total: spec.total, shards: spec.shards,
      startMs: Date.UTC(1950, 0, 1), endMs: Date.UTC(2050, 0, 1),
      channels: { ...CHANNELS, ...(swiss ? swissChannels() : {}) },
      conventions: { input: 'synthetic TT; uniform sphere; random house systems',
        frame: 'IAU2006 precession/unadjusted IAU2000B true ecliptic/equinox of date',
        correction: 'JPL Moon NONE; other exact centers CN+S; no deflection; NAIF periodic TT/TDB',
        Swiss: swiss ? 'external adapter apparent geocentric true-of-date; SWIEPH only' : 'unavailable',
        tolerance: '60 arcseconds screening only; engine minus reference; no accuracy bound' } };
    const identities = { build: build.sha256, tooling: await runnerToolingIdentity(), references: {
      EngineBuild: { sourceSha256: build.inputs.source.sha256, outputSha256: build.output.sha256,
        dependencySha256: build.inputs.dependency.sha256, nodeExecutableSha256: build.inputs.runtime.executableSha256 },
      JPL: { name: kernel.receipt.name, source: kernel.receipt.source, sha256: kernel.receipt.sha256 },
      ERFA: { nutationSha256: erfaCatalog.files['nut00b.c'] },
      ...(wide ? { ReferencePlan: { selection: plan.selection, paddingSeconds: plan.paddingSeconds,
        sampling: plan.sampling, bodies: plan.bodies, groups: plan.groups, kernelCoverage: kernel.receipt.coverage } } : {}),
      Swiss: swiss ? swiss.identity : { status: 'unavailable' } } };
    const directory = resolve(runtime, 'campaigns', spec.name);
    if (!reporting) {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
      try {
        const readState = createSpkReader([kernel]);
        let evaluate = wide ? createGroupedEvaluator({ natalChart, calc, terms, swiss,
          referenceAt: tdbSeconds => ({ ...selectReference([kernel], tdbSeconds), readState }) }) :
          createEvaluator({ natalChart, readState, terms });
        if (swiss && !wide) evaluate = withSwiss(evaluate, natalChart, swiss);
        const result = await executeCampaign({ spec, config, identities, evaluate, directory, shard, maxCases, signal: controller.signal });
        await verifyBuild();
        console.log(result.complete ? 'Selected shards complete.' : 'Budget or signal stop; resume with the same specification.');
      } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
      return;
    }
    const campaign = campaignIdentity(config, identities);
    const states = [];
    for (let index = 0; index < spec.shards; index++) states.push(validateCheckpoint(
      await readRuntimeJson(resolve(directory, `shard-${index}.json`)), campaign, index));
    const bundle = { campaign, states, metadata: { title: 'Synthetic TT chart campaign',
      command: ['node', 'crosscheck/tools/campaign.mjs', input, 'report'],
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
      units: Object.fromEntries(Object.keys(config.channels).map(name => [name, name.endsWith('.distance') ? 'km' : 'arcseconds'])),
      exclusions: [
        `Reproduction: node crosscheck/tools/campaign.mjs ${input} all, then report. Specification: ${JSON.stringify(spec)}. Preserve external Swiss environment selectors if enabled.`,
        'Only exact Sun/Moon/Mercury/Venus centers compared; no other planets, houses, nodes, angles, speeds or topocentric checks. No UTC/UT1 validation.',
        ...(wide ? [
          'Full DE440 covers the entire requested TT span; DE441 has no selected interval or measurements. Inactive group and missing exact-center verdicts are unsupported, never zero-error observations.',
          'JPL residuals use Moon NONE and other exact centers CN+REL without deflection. They retain backdated-observer aberration, light-time, frame and periodic TT/TDB model differences. Convention channels isolate CN+REL minus CN+S on the same independent states, not total model error.',
          'Distances use binary64 TT Julian dates in calc, which can round relative to natalChart millisecond inputs; JPL uses TT seconds converted to TDB. Distance maxima are in km and angular maxima in arcseconds.'
        ] : ['JPL residuals include model differences: CN+S Newtonian aberration, no deflection, periodic TT/TDB and unadjusted IAU2000B frames. Sampling interval is TT despite ISO Z labels.']),
        ...(wide ? [
          swiss ? 'Swiss and SwissJPL channels use the same synthetic chart, TT Julian date and one adapter response per compared body. Swiss is a second instrument, not the accuracy arbiter. The receipt records version, adapter/binding hashes, ephemeris SHA-256 identities and returned-flag counts.' : 'Swiss is unavailable: no external instrument was configured. Swiss and SwissJPL channels retain unsupported verdicts without numerical observations.',
          'Swiss apparent places include its deflection model and lunar apparent corrections, unlike JPL without deflection and geometric Moon. Frame and TT Julian-date rounding differences also remain in these separate instrument comparisons.'
        ] : []),
        'Swiss.positions is the legacy unavailable channel; per-body Swiss channels carry measurements only when configured. Non-SWIEPH responses, including Moshier fallback, error and unsupported verdicts contain no residuals.',
        'Sample maxima are not unsampled bounds; no throughput guarantee. Command records report invocation; reproduction command above runs all shards from scratch with identical inputs.'
      ] } };
    const bytes = JSON.stringify(bundle) + '\n';
    if (Buffer.byteLength(bytes) >= MAX_FILE_BYTES) throw Error('Bundle exceeds file limit.');
    const bundlePath = resolve(directory, 'report-bundle.json');
    try { if ((await lstat(bundlePath)).isSymbolicLink()) throw Error('Bundle symlink forbidden.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(bundlePath, bytes);
    await reportFile(bundlePath, spec.name, { check: action === 'check' });
    console.log('Campaign aggregate report verified.');
  } finally { swiss?.close(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
