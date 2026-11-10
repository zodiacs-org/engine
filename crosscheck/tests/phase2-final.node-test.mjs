import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalHeadline, main, renderFinalCampaign } from '../reporting/final-campaign.mjs';
import { campaignIdentity } from '../lib/runner.mjs';
import { groupedChannels } from '../lib/wide-campaign.mjs';
import { addResidual, emptyStats } from '../lib/statistics.mjs';
import { renderReport } from '../lib/report.mjs';
import { checkpointSnapshot, measuredInvocation, renderResources, specDigest } from '../tools/progress.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(project, '..');
const bodies = ['Sun', 'Moon', 'Mercury', 'Venus'];
const missing = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const suffixes = ['.json', '.md', '.csv', '-resources.json', '-resources.md'];

function fixture({ swiss = true } = {}) {
  const spec = { name: 'phase2-measured-tt', profile: 'phase2', kernel: 'de440',
    seed: 'invented-final-arithmetic', total: 1_000_000, shards: 2 };
  const channels = groupedChannels();
  const config = { seed: spec.seed, total: spec.total, shards: spec.shards,
    startMs: Date.UTC(1800, 0, 1), endMs: Date.UTC(2200, 0, 1), channels,
    quantiles: Object.keys(channels).filter(name => /^(JPL|Convention|Swiss|SwissJPL)\.DE44[01]\./.test(name)).sort(),
    conventions: { input: 'Invented aggregate arithmetic only; no positional accuracy expectation.',
      unavailableBodies: Object.fromEntries(missing.map(body => [body, 'No invented exact-center measurement.'])),
      referenceGroups: {
        DE440: { status: 'available', reason: 'Invented full-span descriptor availability.',
          intervals: [{ startMs: Date.UTC(1800, 0, 1), endMs: Date.UTC(2200, 0, 1) }] },
        DE441: { status: 'empty', reason: 'No selected outside-span interval.', intervals: [] }
      } } };
  const identity = { adapterSha256: 'c'.repeat(64), bindingSha256: 'd'.repeat(64),
    engineVersion: '0.0.1', binding: 'pyswisseph 0.0.1', ephemerisFiles: { 'invented.se1': 'e'.repeat(64) } };
  const campaign = campaignIdentity(config, { build: 'a'.repeat(64), tooling: 'b'.repeat(64),
    references: { JPL: { name: 'de440.bsp', sha256: 'f'.repeat(64) }, Swiss: swiss ? identity : { status: 'unavailable' } } });
  const states = [0, 1].map(shard => ({ schema: 'crosscheck-checkpoint/1', campaign: campaign.sha256, shard, completed: 2,
    channels: Object.fromEntries(Object.entries(channels).map(([name, tolerance]) => {
      const [kind, group, body, axis] = name.split('.');
      const measured = group === 'DE440' && bodies.includes(body) &&
        (swiss || !['Swiss', 'SwissJPL'].includes(kind));
      let stats = emptyStats(tolerance, { quantiles: config.quantiles.includes(name) });
      // These invented residuals deliberately separate coordinates, units and comparison kinds.
      const residual = kind === 'Convention' ? 48 : kind === 'SwissJPL' ? 59 : axis === 'distance' ? 9999 :
        kind === 'Swiss' ? axis === 'lon' ? body === 'Sun' ? -8 : 1 : body === 'Moon' ? 1.5 : 0.5 :
          axis === 'lon' ? body === 'Mercury' ? -4 : 0.25 : body === 'Moon' ? -7 : 1 / 16;
      if (measured) for (let index = 0; index < 2; index++) stats = addResidual(stats, residual);
      return [name, { stats,
        verdicts: { pass: measured ? 2 : 0, fail: 0, error: 0, unsupported: measured ? 0 : 2, fallback: 0 },
        flags: measured && ['Swiss', 'SwissJPL'].includes(kind) ? { 2: 2 } : {} }];
    })) }));
  const metadata = { title: 'Invented final aggregate campaign',
    command: ['node', 'crosscheck/reporting/final-campaign.mjs', 'crosscheck/runtime/invented-final-bundle.json',
      'crosscheck/runtime/invented-final-ledger.json', 'phase2-measured-tt'],
    runtime: { node: 'v22.23.3', platform: 'linux', arch: 'x64' },
    units: Object.fromEntries(Object.keys(channels).map(name => [name, name.endsWith('.distance') ? 'km' : 'arcseconds'])),
    exclusions: ['Independent invented arithmetic only, without an external instrument.'] };
  const disk = { usedBytes: 100, fileCount: 2, limitBytes: 6_000_000_000 };
  const invocation = measuredInvocation({ spec, before: [null, null], after: [2, 2], workingDirectory: '.',
    wrapperCommand: ['node', 'crosscheck/tools/progress.mjs', 'crosscheck/runtime/invented-final.json', 'all', '2'],
    driverCommand: ['node', 'crosscheck/tools/campaign.mjs', 'crosscheck/runtime/invented-final.json', 'all', '2'],
    elapsedNanoseconds: 2_123_456_789n, usageBefore: { userCPUTime: 0, systemCPUTime: 0, maxRSS: 10 },
    usageAfter: { userCPUTime: 300, systemCPUTime: 200, maxRSS: 30 }, diskBefore: disk, diskAfter: disk });
  const ledger = { schema: 'crosscheck-resource-progress/1', spec, specSha256: specDigest(spec),
    campaignSha256: campaign.sha256, invocations: [invocation] };
  return { bundle: { campaign, states, metadata }, ledger };
}

test('final summary selects independent invented angular maxima without mixing distances, conventions or Swiss/JPL', () => {
  const { bundle, ledger } = fixture();
  const originals = structuredClone({ bundle, ledger });
  const outputs = renderFinalCampaign(bundle, ledger);
  const base = renderReport(bundle, { allowPartial: true });
  assert.equal(outputs.json, base.json);
  assert.equal(outputs.csv, base.csv);
  const report = JSON.parse(outputs.json), resource = JSON.parse(outputs.resourcesJson);
  const headline = finalHeadline(report, resource);
  assert(outputs.markdown.startsWith('# Invented final aggregate campaign\n\n' + headline + '\nStatus: partial.'));
  assert(headline.includes('Measured 4 synthetic charts'));
  assert(headline.includes('[1800-01-01T00:00:00.000Z, 2200-01-01T00:00:00.000Z)'));
  assert(headline.includes('Sun, Moon, Mercury and Venus only'));
  assert(headline.includes('engine-versus-JPL differences were 4 arcseconds in longitude and 7 arcseconds in latitude'));
  assert(headline.includes('engine-versus-Swiss instrument differences were 8 arcseconds in longitude and 1.5 arcseconds in latitude'));
  assert(!headline.includes('48 arcseconds')); assert(!headline.includes('59 arcseconds')); assert(!headline.includes('9999 arcseconds'));
  assert(headline.includes('Swiss-minus-JPL results and JPL convention differences remain separate'));
  assert(headline.includes('4 of the requested 1000000'));
  assert(headline.includes('explicit budget of 2 additional charts per selected shard (all shards)'));
  assert(headline.includes('2.123456789 seconds'));
  assert(headline.includes('DE441 has no selected interval or measurements'));
  assert(headline.includes('Jupiter, Mars, Neptune, Pluto, Saturn, Uranus'));
  assert(!/[\u2013\u2014]/.test(headline));
  assert.equal(report.complete, false); assert.equal(resource.complete, false);
  assert.deepEqual({ bundle, ledger }, originals);
  assert.deepEqual(renderFinalCampaign(bundle, ledger), outputs);
  const renderedResource = renderResources(ledger, ledger.spec,
    checkpointSnapshot(ledger.spec, bundle.states, { requireAll: true, campaign: bundle.campaign }));
  assert.equal(outputs.resourcesJson, renderedResource.json);
  assert.equal(outputs.resourcesMarkdown, renderedResource.markdown);
});

test('final summary retains absent Swiss channels without inventing numerical comparisons', () => {
  const { bundle, ledger } = fixture({ swiss: false });
  const outputs = renderFinalCampaign(bundle, ledger);
  const report = JSON.parse(outputs.json), resources = JSON.parse(outputs.resourcesJson);
  const headline = finalHeadline(report, resources);
  assert(headline.includes('Swiss instrument was unavailable'));
  assert(!headline.includes('engine-versus-Swiss instrument differences were'));
  assert.equal(report.channels['Swiss.DE440.Sun.lon'].statistics.n, 0);
  assert.equal(report.channels['Swiss.DE440.Sun.lon'].statistics.maxAbs, null);
  assert.equal(report.swissInstrument.status, 'unavailable');
});

test('final exporter refuses changed campaign identities, malformed aggregates and discontinuous ledgers', () => {
  const original = fixture();
  const changedIdentity = structuredClone(original);
  changedIdentity.ledger.campaignSha256 = '0'.repeat(64);
  assert.throws(() => renderFinalCampaign(changedIdentity.bundle, changedIdentity.ledger), /final checkpoints/);
  const changedCheckpoint = structuredClone(original);
  changedCheckpoint.bundle.states[1].campaign = '0'.repeat(64);
  assert.throws(() => renderFinalCampaign(changedCheckpoint.bundle, changedCheckpoint.ledger), /mismatch/);
  const extraAggregate = structuredClone(original);
  extraAggregate.bundle.states[0].channels['JPL.DE440.Sun.lon'].stats.raw = 'invented forbidden field';
  assert.throws(() => renderFinalCampaign(extraAggregate.bundle, extraAggregate.ledger), /aggregate fields/);
  assert.throws(() => renderFinalCampaign({ ...original.bundle, extra: 'invented forbidden field' }, original.ledger), /bundle fields/);
  const discontinuous = structuredClone(original);
  discontinuous.ledger.invocations.push(structuredClone(discontinuous.ledger.invocations[0]));
  assert.throws(() => renderFinalCampaign(discontinuous.bundle, discontinuous.ledger), /discontinuous/);
  const differentSnapshot = structuredClone(original);
  differentSnapshot.ledger.invocations[0].after = [1, 1];
  differentSnapshot.ledger.invocations[0].processed = 2;
  assert.throws(() => renderFinalCampaign(differentSnapshot.bundle, differentSnapshot.ledger), /final checkpoints/);
  const unavailable = structuredClone(original);
  for (const state of unavailable.bundle.states) {
    state.channels['JPL.DE440.Mars.distance'] = structuredClone(state.channels['JPL.DE440.Sun.distance']);
  }
  assert.throws(() => renderFinalCampaign(unavailable.bundle, unavailable.ledger), /unavailable-center evidence/);
});

test('partial summary claims a case-budget stop only when selected shard deltas exhaust that budget', () => {
  const { bundle, ledger } = fixture();
  const short = structuredClone(ledger);
  for (const command of ['wrapperCommand', 'driverCommand']) short.invocations[0][command][4] = '3';
  assert.throws(() => renderFinalCampaign(bundle, short), /did not complete.*budget/);
  const unbounded = structuredClone(ledger);
  for (const command of ['wrapperCommand', 'driverCommand']) unbounded.invocations[0][command].pop();
  assert.throws(() => renderFinalCampaign(bundle, unbounded), /requires.*explicit case budget/);
  const outputs = renderFinalCampaign(bundle, ledger);
  const report = JSON.parse(outputs.json), resources = JSON.parse(outputs.resourcesJson);
  assert.throws(() => finalHeadline(report, { ...resources, completed: 5 }), /identities differ/);
  assert.throws(() => finalHeadline(report, { ...resources, totals: { ...resources.totals, elapsedNanoseconds: Infinity } }), /elapsed/);
});

test('final CLI refuses unsafe paths, names and command provenance before writing', async () => {
  await assert.rejects(main(['outside.json', 'ledger.json', '../outside']), /Usage/);
  await assert.rejects(main(['/absolute/bundle.json', 'ledger.json', 'phase2-measured-tt']), /Usage/);
  await assert.rejects(main(['bundle.json', 'ledger.json', 'a'.repeat(71)]), /Usage/);
  await assert.rejects(main(['bundle.json', 'ledger.json', 'phase2-measured-tt', '--check', '--check']), /Usage/);
  await assert.rejects(main(['../outside.json', '../ledger.json', 'phase2-measured-tt']), /below crosscheck\/runtime/);
});

test('final CLI writes new files exclusively, reproduces them and refuses symlinks or stale output', async t => {
  const runtime = resolve(project, 'runtime');
  await mkdir(runtime, { recursive: true });
  const directory = await mkdtemp(resolve(runtime, 'final-export-test-'));
  const name = 'phase2-measured-tt-fixture-' + directory.split('-').at(-1).toLowerCase();
  const paths = suffixes.map(suffix => resolve(project, 'reports', name + suffix));
  t.after(async () => {
    for (const path of paths) await rm(path, { force: true });
    await rm(directory, { recursive: true, force: true });
  });
  const { bundle, ledger } = fixture();
  const inputPath = resolve(directory, 'bundle.json'), ledgerPath = resolve(directory, 'ledger.json');
  const input = relative(process.cwd(), inputPath), ledgerInput = relative(process.cwd(), ledgerPath);
  const prefix = process.cwd() === root ? 'crosscheck/' : '';
  bundle.metadata.command = ['node', prefix + 'reporting/final-campaign.mjs', input, ledgerInput, name];
  await writeFile(inputPath, JSON.stringify(bundle));
  await writeFile(ledgerPath, JSON.stringify(ledger));
  const args = [input, ledgerInput, name];
  await writeFile(paths[2], 'existing receipt');
  await assert.rejects(main(args), /already exists/);
  await assert.rejects(lstat(paths[0]), { code: 'ENOENT' });
  assert.equal(await readFile(paths[2], 'utf8'), 'existing receipt');
  await rm(paths[2]);
  await symlink(ledgerPath, paths[2]);
  await assert.rejects(main(args), /Regular final report file/);
  await rm(paths[2]);
  const wrongCommand = structuredClone(bundle);
  wrongCommand.metadata.command[4] = name + '-other';
  await writeFile(inputPath, JSON.stringify(wrongCommand));
  await assert.rejects(main(args), /command differs/);
  await writeFile(inputPath, JSON.stringify(bundle));
  const inputLink = resolve(directory, 'input-link.json');
  await symlink(inputPath, inputLink);
  await assert.rejects(main([relative(process.cwd(), inputLink), ledgerInput, name]), /symlinks forbidden/);
  await main(args);
  await main([...args, '--check']);
  await assert.rejects(main(args), /already exists/);
  const originalCsv = await readFile(paths[2], 'utf8');
  await writeFile(paths[2], originalCsv + 'changed\n');
  await assert.rejects(main([...args, '--check']), /differs/);
  await writeFile(paths[2], originalCsv);
  await main([...args, '--check']);
});
