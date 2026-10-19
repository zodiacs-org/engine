import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { groupedChannels, createGroupedEvaluator, DISTANCE_SCREEN_KM } from '../lib/wide-campaign.mjs';
import { EXACT_TARGETS, createReferencePlan } from '../lib/reference-plan.mjs';
import { validateSpec, phase2Config, executeCampaign } from '../tools/campaign.mjs';
import { renderReport } from '../lib/report.mjs';
import { campaignIdentity } from '../lib/runner.mjs';
const terms = Array.from({ length: 77 }, () => Array(11).fill(0));
const sample = { utc: '2000-01-01T12:00:00Z', latitude: 0, longitude: 0, houseSystem: 'whole' };
const bodies = ['Sun', 'Moon', 'Mercury', 'Venus'];
function options(group = 'DE440') {
  return { terms, natalChart: () => ({ bodies: bodies.map(body => ({ body, lon: 359, lat: 1 })) }),
    calc: () => ({ status: 'ok', dist: 1 }), referenceAt: async () => ({ group,
      readState: async request => ({ frame: 'J2000', timeScale: 'TDB', positionUnit: 'km', velocityUnit: 'km/s', corrections: 'geometric',
        position: request.target === 399 ? [0, 0, 0] : [149597000.7, 0, 0], velocity: [0, 0, 0] }) }) };
}
const spec = { name: 'phase2-invented', kernel: 'de440', seed: 'phase2-invented', total: 7, shards: 2, profile: 'phase2' };
async function plan() {
  // Descriptor availability is existing committed evidence; no position expectation is copied.
  const receipt = JSON.parse(await readFile(new URL('../reports/reference-plan.json', import.meta.url), 'utf8'));
  return createReferencePlan([{ receipt: receipt.kernel }]);
}
test('phase2 configuration binds the full TT span, grouped units, percentile channels and exact-center exclusions', async () => {
  assert.deepEqual(validateSpec(spec), spec);
  for (const change of [{ profile: 'other' }, { profile: null }, { kernel: 'de440s' }, { kernel: 'de441_part-2' }, { shards: 4 }]) {
    assert.throws(() => validateSpec({ ...spec, ...change }));
  }
  const config = phase2Config(spec, await plan());
  assert.equal(new Date(config.startMs).toISOString(), '1800-01-01T00:00:00.000Z');
  assert.equal(new Date(config.endMs).toISOString(), '2200-01-01T00:00:00.000Z');
  assert.equal(Object.keys(config.channels).length, 102);
  assert.equal(config.quantiles.length, 100);
  assert.equal(config.channels['JPL.DE440.Sun.distance'], DISTANCE_SCREEN_KM);
  assert.equal(config.channels['Convention.DE441.Mars.lon'], 60);
  assert.equal(config.conventions.referenceGroups.DE441.status, 'empty');
  assert.deepEqual(config.conventions.referenceGroups.DE441.intervals, []);
  assert.deepEqual(Object.keys(config.conventions.unavailableBodies), Object.keys(EXACT_TARGETS).slice(4));
  const broken = await plan(); broken.groups.DE440.status = 'unavailable';
  assert.throws(() => phase2Config(spec, broken), /reference plan/);
});
test('invented charts measure only selected group and exact centers; convention sensitivity stays separate', async () => {
  for (const group of ['DE440', 'DE441']) {
    const result = await createGroupedEvaluator(options(group))(sample);
    assert.deepEqual(Object.keys(result), Object.keys(groupedChannels()));
    for (const [name, outcome] of Object.entries(result)) {
      const measured = name.includes(`.${group}.`) && bodies.includes(name.split('.')[2]);
      assert.deepEqual(Object.keys(outcome).sort(), measured ? ['stats', 'verdict'] : ['verdict']);
      if (measured) {
        assert.equal(outcome.stats.n, 1); assert.equal(outcome.stats.version, 2);
        if (name.endsWith('.distance')) {
          // Independent decimal decimetre arithmetic for the declared au conversion.
          assert.equal(outcome.stats.mean, Number(1495978707n - 1495970007n) / 10);
        } else if (name.startsWith('Convention.')) {
          assert.equal(outcome.stats.maxAbs, 0); // Zero observer velocity makes both models identical.
        } else if (name.endsWith('.lon')) assert.ok(outcome.stats.mean < 0);
      } else assert.equal(outcome.verdict, 'unsupported');
    }
  }
  await assert.rejects(createGroupedEvaluator(options('DE440s'))(sample), /reference/);
});
test('grouped evaluator requests binary64 TT range, preserves lunar NONE and rejects distance refusals', async () => {
  const requested = [], read = [], at = [];
  const base = options();
  const epoch = { ...sample, utc: '1800-01-01T00:00:00.001Z' };
  const reader = (await base.referenceAt()).readState;
  await createGroupedEvaluator({ ...base, referenceAt: tdbSeconds => {
    at.push(tdbSeconds); return { group: 'DE440', readState: request => { read.push(request); return reader(request); } };
  }, calc: request => { requested.push(request); return { status: 'ok', dist: 1 }; } })(epoch);
  assert.equal(requested.length, 4);
  const ttDays = (Date.parse(epoch.utc) - Date.UTC(2000, 0, 1, 12)) / 86400000;
  for (const request of requested) {
    assert.deepEqual(request.time, { jd: ttDays + 2451545, scale: 'tt' });
    assert.deepEqual(request.flags, { correction: 'apparent', speeds: false, deflection: false });
    assert.equal(request.center, 'geocentric'); assert.equal(request.frame, 'ecliptic-true-of-date');
  }
  assert.equal(read.filter(request => request.target === 301).length, 1);
  assert.equal(read.find(request => request.target === 301).tdbSeconds, at[0]);
  for (const dist of [0, null, NaN, Infinity]) {
    await assert.rejects(createGroupedEvaluator({ ...base, calc: () => ({ status: 'ok', dist }) })(sample), /distances/);
  }
  await assert.rejects(createGroupedEvaluator({ ...base, calc: () => ({ status: 'refused' }) })(sample), /refused/);
});
test('grouped histograms survive budget stop and resume without filling empty spans', async t => {
  const root = new URL('../runtime/', import.meta.url);
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(new URL('grouped-test-', root));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = phase2Config(spec, await plan());
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { arithmetic: 'invented states only' } };
  const args = { spec, config, identities, directory, evaluate: createGroupedEvaluator(options()) };
  assert.equal((await executeCampaign({ ...args, maxCases: 1 })).complete, false);
  const resumed = await executeCampaign(args);
  const fresh = await executeCampaign({ ...args, directory: directory + '/fresh' });
  const states = dir => Promise.all([0, 1].map(shard => readFile(`${dir}/shard-${shard}.json`, 'utf8').then(JSON.parse)));
  assert.deepEqual(await states(directory), await states(directory + '/fresh'));
  const metadata = { title: 'Invented grouped arithmetic', command: ['node', 'invented'],
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    units: Object.fromEntries(Object.keys(config.channels).map(name => [name, name.endsWith('.distance') ? 'km' : 'arcseconds'])),
    exclusions: ['Invented arithmetic only; no physical accuracy measurement.'] };
  const rendered = renderReport({ campaign: resumed.campaign, states: await states(directory), metadata });
  assert.deepEqual(rendered, renderReport({ campaign: fresh.campaign, states: await states(directory + '/fresh'), metadata }));
  const report = JSON.parse(rendered.json);
  assert.equal(report.completed, 7);
  for (const [name, row] of Object.entries(report.channels)) {
    if (name.includes('.DE441.')) {
      assert.equal(row.statistics.n, 0); assert.equal(row.statistics.maxAbs, null);
      assert.equal(row.statistics.absoluteQuantiles.median, null);
    }
  }
});

test('committed bounded phase2 pilot records completed charts, grouped measurements and unavailable centers', async () => {
  const report = JSON.parse(await readFile(new URL('../reports/phase2-pilot.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.campaign, campaignIdentity(report.campaign.config, report.campaign.identities));
  assert.equal(report.schema, 'crosscheck-report/3');
  assert.equal(report.complete, true); assert.equal(report.completed, 64);
  assert.equal(report.campaign.config.total, report.completed);
  assert.equal(report.campaign.config.seed, 'synthetic-phase2-pilot-v1');
  assert.equal(report.span.startMsInclusive, Date.UTC(1800, 0, 1));
  assert.equal(report.span.endMsExclusive, Date.UTC(2200, 0, 1));
  assert.equal(report.campaign.identities.references.JPL.name, 'de440.bsp');
  assert.match(report.campaign.identities.references.JPL.sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.campaign.identities.references.Swiss.status, 'unavailable');
  assert.equal(report.referenceGroups.DE441.status, 'empty');
  assert.equal(report.referenceGroups.DE441.numericalResiduals, 0);
  assert.deepEqual(report.metadata.command, ['node', 'crosscheck/tools/campaign.mjs', 'crosscheck/runtime/p4-pilot.json', 'report']);
  const measured = Object.entries(report.channels).filter(([, row]) => row.statistics.n);
  assert.equal(measured.length, 20);
  for (const [name, row] of Object.entries(report.channels)) {
    if (row.statistics.n) {
      assert.equal(row.statistics.n, 64);
      assert.equal(row.status, 'measured');
      assert.equal(row.referenceGroup, 'DE440');
      assert(bodies.includes(row.body));
      assert.equal(row.unit, name.endsWith('.distance') ? 'km' : 'arcseconds');
      for (const key of ['median', 'p99', 'p999']) {
        const q = row.statistics.absoluteQuantiles[key];
        assert(q.lower <= q.upper && q.upper <= row.statistics.maxAbs);
      }
    } else {
      assert.equal(row.statistics.maxAbs, null);
      assert.equal(row.verdicts.unsupported, 64);
    }
  }
  assert.equal(report.referenceGroups.DE440.numericalResiduals, 64 * 12);
  assert.equal(report.referenceGroups.DE440.conventionResiduals, 64 * 8);
});
