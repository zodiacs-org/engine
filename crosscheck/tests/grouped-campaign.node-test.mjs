import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { groupedChannels, createGroupedEvaluator, DISTANCE_SCREEN_KM } from '../lib/wide-campaign.mjs';
import { EXACT_TARGETS, createReferencePlan } from '../lib/reference-plan.mjs';
import { validateSpec, phase2Config, executeCampaign, swissSelection } from '../tools/campaign.mjs';
import { observation } from '../lib/campaign.mjs';
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
  assert.equal(Object.keys(config.channels).length, 182);
  assert.equal(config.quantiles.length, 180);
  assert.equal(config.channels['JPL.DE440.Sun.distance'], DISTANCE_SCREEN_KM);
  assert.equal(config.channels['Convention.DE441.Mars.lon'], 60);
  assert.equal(config.channels['Swiss.DE440.Sun.lon'], 60);
  assert.equal(config.channels['SwissJPL.DE441.Mars.lat'], 60);
  assert.equal(config.conventions.Swiss, 'unavailable');
  assert.match(phase2Config(spec, await plan(), { swiss: true }).conventions.Swiss, /engine minus Swiss/);
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
      const measured = /^(JPL|Convention)\./.test(name) && name.includes(`.${group}.`) && bodies.includes(name.split('.')[2]);
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
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { arithmetic: 'invented states only', Swiss: { status: 'unavailable' } } };
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

test('Swiss selection keeps absence explicit and rejects incomplete configuration', () => {
  assert.equal(swissSelection({}), null);
  assert.deepEqual(swissSelection({ SE_EPHE_PATH: '/external/test-data' }),
    { ephemerisPath: '/external/test-data', python: 'python3' });
  assert.deepEqual(swissSelection({ SE_EPHE_PATH: '/external/test-data', CROSSCHECK_PYTHON: '/external/python' }),
    { ephemerisPath: '/external/test-data', python: '/external/python' });
  for (const env of [{ CROSSCHECK_PYTHON: '/external/python' }, { SE_EPHE_PATH: '' },
    { CROSSCHECK_PYTHON: '' }, { SE_EPHE_PATH: '/external/test-data', CROSSCHECK_PYTHON: '' }]) {
    assert.throws(() => swissSelection(env), /Configured Swiss/);
  }
});

test('paired grouped comparison reuses one chart and reference and excludes every non-SWIEPH outcome', async () => {
  for (const group of ['DE440', 'DE441']) {
    let charts = 0;
    const requested = [], base = options(group);
    const swiss = { comparePositionPair: async request => {
      requested.push(request);
      assert.equal(request.jdTT, 2451545);
      assert.deepEqual(request.actual, { lon: 359, lat: 1 });
      assert.deepEqual(Object.keys(request.reference).sort(), ['lat', 'lon']);
      assert.equal(request.quantiles, true); assert.equal(request.toleranceArcsec, 60);
      // Cartesian x points along the independent test's J2000 mean ecliptic.
      assert.ok(request.reference.lon < 0.01 || request.reference.lon > 359.99);
      assert.ok(Math.abs(request.reference.lat) < 0.01);
      if (request.body === 'Moon') return { verdict: 'fallback', retflags: 4 };
      if (request.body === 'Mercury') return { verdict: 'error' };
      if (request.body === 'Venus') return { verdict: 'unsupported' };
      return { verdict: 'fail', retflags: 2, stats: {
        engineSwiss: { lon: observation(-61, 60, { quantiles: true }).stats,
          lat: observation(2, 60, { quantiles: true }).stats },
        swissJpl: { lon: observation(3, 60, { quantiles: true }).stats,
          lat: observation(-4, 60, { quantiles: true }).stats }
      } };
    } };
    const result = await createGroupedEvaluator({ ...base, swiss,
      natalChart: input => { charts++; return base.natalChart(input); } })(sample);
    assert.equal(charts, 1); assert.deepEqual(requested.map(r => r.body), bodies);
    for (const [kind, longitude, latitude] of [['Swiss', -61, 2], ['SwissJPL', 3, -4]]) {
      const lon = result[`${kind}.${group}.Sun.lon`], lat = result[`${kind}.${group}.Sun.lat`];
      assert.equal(lon.stats.mean, longitude); assert.equal(lat.stats.mean, latitude);
      assert.equal(lon.verdict, kind === 'Swiss' ? 'fail' : 'pass'); assert.equal(lat.verdict, 'pass');
      assert.equal(lon.stats.version, 2); assert.equal(lon.retflags, 2);
      for (const axis of ['lon', 'lat']) {
        assert.deepEqual(result[`${kind}.${group}.Moon.${axis}`], { verdict: 'fallback', retflags: 4 });
        assert.deepEqual(result[`${kind}.${group}.Mercury.${axis}`], { verdict: 'error' });
        assert.deepEqual(result[`${kind}.${group}.Venus.${axis}`], { verdict: 'unsupported' });
        assert.deepEqual(result[`${kind}.${group}.Mars.${axis}`], { verdict: 'unsupported' });
        assert.deepEqual(result[`${kind}.${group === 'DE440' ? 'DE441' : 'DE440'}.Sun.${axis}`], { verdict: 'unsupported' });
      }
    }
    assert(!JSON.stringify(result).includes('reference'));
  }
  assert.throws(() => createGroupedEvaluator({ ...options(), swiss: {} }), /instrument/);
});

test('paired aggregates resume with bound Swiss identity and deterministic report counts', async t => {
  const root = new URL('../runtime/', import.meta.url);
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(new URL('paired-campaign-test-', root));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = phase2Config(spec, await plan(), { swiss: true });
  const identity = { engineVersion: '0.0.1', binding: 'pyswisseph 0.0.1', adapterSha256: 'c'.repeat(64),
    bindingSha256: 'd'.repeat(64), ephemerisFiles: { 'invented.se1': 'e'.repeat(64) } };
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { Swiss: identity } };
  const swiss = { comparePositionPair: async () => ({ verdict: 'pass', retflags: 2, stats:
    Object.fromEntries(['engineSwiss', 'swissJpl'].map(kind => [kind, Object.fromEntries(['lon', 'lat'].map(axis =>
      [axis, observation(axis === 'lon' ? 1 : -2, 60, { quantiles: true }).stats]))])) }) };
  const args = { spec, config, identities, directory, evaluate: createGroupedEvaluator({ ...options(), swiss }) };
  assert.equal((await executeCampaign({ ...args, maxCases: 1 })).complete, false);
  const resumed = await executeCampaign(args);
  const fresh = await executeCampaign({ ...args, directory: directory + '/fresh' });
  const states = dir => Promise.all([0, 1].map(shard => readFile(`${dir}/shard-${shard}.json`, 'utf8').then(JSON.parse)));
  assert.deepEqual(await states(directory), await states(directory + '/fresh'));
  const metadata = { title: 'Invented paired arithmetic', command: ['node', 'invented'],
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    units: Object.fromEntries(Object.keys(config.channels).map(name => [name, name.endsWith('.distance') ? 'km' : 'arcseconds'])),
    exclusions: ['Invented protocol arithmetic only; no instrument accuracy expectation.'] };
  const rendered = renderReport({ campaign: resumed.campaign, states: await states(directory), metadata });
  assert.deepEqual(rendered, renderReport({ campaign: fresh.campaign, states: await states(directory + '/fresh'), metadata }));
  const report = JSON.parse(rendered.json);
  for (const kind of ['Swiss', 'SwissJPL']) for (const body of bodies) for (const axis of ['lon', 'lat']) {
    const row = report.channels[`${kind}.DE440.${body}.${axis}`];
    assert.equal(row.statistics.n, spec.total); assert.equal(row.unit, 'arcseconds');
    assert.deepEqual(row.flags, { 2: spec.total });
    assert.equal(row.statistics.absoluteQuantiles.median.rank, 4);
  }
  for (const change of [{ engineVersion: '0.0.2' }, { ephemerisFiles: { 'invented.se1': 'f'.repeat(64) } },
    { bindingSha256: 'f'.repeat(64) }, { adapterSha256: 'f'.repeat(64) }]) {
    await assert.rejects(executeCampaign({ ...args, identities: { ...identities,
      references: { Swiss: { ...identity, ...change } } } }), /mismatch/);
  }
  await assert.rejects(executeCampaign({ ...args, identities: { ...identities,
    references: { Swiss: { status: 'unavailable' } } } }), /mismatch/);
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

test('retained Swiss pilot binds completed paired aggregates without per-case values or installation paths', async () => {
  const report = JSON.parse(await readFile(new URL('../reports/phase2-swiss-pilot.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.campaign, campaignIdentity(report.campaign.config, report.campaign.identities));
  assert.equal(report.schema, 'crosscheck-report/4');
  assert.equal(report.complete, true); assert.equal(report.completed, 32);
  assert.equal(report.campaign.config.total, report.completed);
  assert.equal(report.campaign.config.seed, 'synthetic-phase2-swiss-pilot-v1');
  assert.equal(report.span.startMsInclusive, Date.UTC(1800, 0, 1));
  assert.equal(report.span.endMsExclusive, Date.UTC(2200, 0, 1));
  assert.deepEqual(report.metadata.command, ['node', 'crosscheck/tools/campaign.mjs', 'crosscheck/runtime/s3-pilot.json', 'report']);
  assert.equal(report.campaign.identities.references.JPL.name, 'de440.bsp');
  assert.match(report.campaign.identities.references.JPL.sha256, /^[a-f0-9]{64}$/);
  const swiss = report.swissInstrument;
  assert.equal(swiss.status, 'available'); assert.equal(swiss.identity.engineVersion, '2.10.03');
  assert.deepEqual(swiss.identity, report.campaign.identities.references.Swiss);
  assert.deepEqual(Object.keys(swiss.identity).sort(), ['adapterSha256', 'binding', 'bindingSha256', 'engineVersion', 'ephemerisFiles']);
  assert.match(swiss.identity.binding, /^pyswisseph [0-9.]+$/);
  for (const digest of [swiss.identity.adapterSha256, swiss.identity.bindingSha256, ...Object.values(swiss.identity.ephemerisFiles)])
    assert.match(digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(swiss.identity.ephemerisFiles).sort(), ['seas_18.se1', 'semo_18.se1', 'sepl_18.se1']);
  assert.equal(swiss.swiephResponses, report.completed * bodies.length);
  assert.equal(swiss.moshierFallbackResponses, 0); assert.equal(swiss.otherBackendFallbackResponses, 0);
  assert.deepEqual(swiss.returnedFlags, { 2: report.completed * bodies.length });
  assert.equal(report.referenceGroups.DE440.engineSwissResiduals, report.completed * bodies.length * 2);
  assert.equal(report.referenceGroups.DE440.swissJplResiduals, report.completed * bodies.length * 2);
  assert.equal(report.referenceGroups.DE440.numericalResiduals, report.completed * bodies.length * 3);
  assert.equal(report.referenceGroups.DE441.status, 'empty');
  assert.equal(report.referenceGroups.DE441.engineSwissResiduals, 0);
  assert.equal(report.referenceGroups.DE441.swissJplResiduals, 0);
  for (const [name, row] of Object.entries(report.channels)) {
    if (/^(Swiss|SwissJPL)\./.test(name) && name !== 'Swiss.positions') {
      assert.equal(row.unit, 'arcseconds');
      const measured = row.referenceGroup === 'DE440' && bodies.includes(row.body);
      assert.equal(row.statistics.n, measured ? report.completed : 0);
      assert.deepEqual(row.flags, measured ? { 2: report.completed } : {});
      assert.equal(row.status, row.referenceGroup === 'DE441' ? 'empty' : measured ? 'measured' : 'unavailable');
      if (measured) for (const [key, probability] of [['median', 0.5], ['p99', 0.99], ['p999', 0.999]]) {
        const q = row.statistics.absoluteQuantiles[key];
        assert.equal(q.rank, Math.ceil(report.completed * probability));
        assert(q.lower <= q.upper && q.upper <= row.statistics.maxAbs);
      }
      else assert.equal(row.statistics.maxAbs, null);
    }
  }
  // This is a retention/count receipt check, never a Swiss numerical expectation.
  for (const output of ['json', 'csv', 'md']) {
    const bytes = await readFile(new URL(`../reports/phase2-swiss-pilot.${output}`, import.meta.url), 'utf8');
    assert(!bytes.includes('/workspace/')); assert(!bytes.includes('/home/'));
    assert(!/"(?:actual|output|perCase|positions)"\s*:/.test(bytes));
  }
});

test('retained million-target progress binds measured prefixes, paired counts and resource evidence', async () => {
  const base = new URL('../reports/phase2-million-tt-progress', import.meta.url);
  const report = JSON.parse(await readFile(new URL(base.href + '.json'), 'utf8'));
  const resourceBytes = await readFile(new URL(base.href + '-resources.json'), 'utf8');
  const resources = JSON.parse(resourceBytes);
  assert.deepEqual(report.campaign, campaignIdentity(report.campaign.config, report.campaign.identities));
  assert.equal(report.complete, false); assert.equal(report.completed, 3072);
  assert.equal(report.campaign.config.total, 1000000);
  assert.equal(report.campaign.config.seed, 'synthetic-phase2-million-v1');
  assert.equal(report.span.startMsInclusive, Date.UTC(1800, 0, 1));
  assert.equal(report.span.endMsExclusive, Date.UTC(2200, 0, 1));
  assert.deepEqual(report.coverage.map(item => [item.completed, item.firstIndex, item.lastIndex, item.stride]),
    [[1024, 0, 3069, 3], [1024, 1, 3070, 3], [1024, 2, 3071, 3]]);
  assert.deepEqual(report.metadata.command, ['node', 'crosscheck/tools/campaign.mjs', 'crosscheck/runtime/p5-million.json', 'snapshot']);
  assert.equal(report.referenceGroups.DE441.status, 'empty');
  assert.equal(report.referenceGroups.DE441.numericalResiduals, 0);
  assert.equal(report.swissInstrument.status, 'available');
  assert.equal(report.swissInstrument.swiephResponses, report.completed * bodies.length);
  assert.equal(report.swissInstrument.moshierFallbackResponses, 0);
  assert.equal(report.swissInstrument.otherBackendFallbackResponses, 0);
  assert.deepEqual(report.swissInstrument.returnedFlags, { 2: report.completed * bodies.length });
  for (const [name, channel] of Object.entries(report.channels)) {
    if (!/^(JPL|Convention|Swiss|SwissJPL)\.DE44[01]\./.test(name)) continue;
    const measured = channel.referenceGroup === 'DE440' && bodies.includes(channel.body);
    assert.equal(channel.statistics.n, measured ? report.completed : 0);
    if (!measured) assert.equal(channel.statistics.maxAbs, null);
    else for (const [key, probability] of [['median', 0.5], ['p99', 0.99], ['p999', 0.999]])
      assert.equal(channel.statistics.absoluteQuantiles[key].rank, Math.ceil(report.completed * probability));
  }
  assert.equal(resources.campaignSha256, report.campaign.sha256);
  assert.equal(resources.completed, report.completed); assert.equal(resources.complete, false);
  assert.equal(resources.requested, report.campaign.config.total);
  assert.equal(resources.invocations.length, 3);
  assert.deepEqual(resources.invocations.map(entry => entry.processed), [0, 3, 3069]);
  assert.deepEqual(resources.checkpointPrefixes, [1024, 1024, 1024]);
  assert(resources.invocations.every(entry => entry.elapsedNanoseconds > 0 &&
    entry.diskBefore.usedBytes < entry.diskBefore.limitBytes && entry.diskAfter.usedBytes < entry.diskAfter.limitBytes));
  const { renderResources } = await import('../tools/progress.mjs');
  const ledger = Object.fromEntries(['schema', 'spec', 'specSha256', 'campaignSha256', 'invocations'].map(key => [key, resources[key]]));
  const rendered = renderResources(ledger, resources.spec, {
    campaignSha256: report.campaign.sha256, completed: report.coverage.map(item => item.completed) });
  assert.equal(rendered.json, resourceBytes);
  assert.equal(rendered.markdown, await readFile(new URL(base.href + '-resources.md'), 'utf8'));
  // Retention and count evidence only; no instrument-derived numerical expectation.
  for (const suffix of ['.json', '.csv', '.md', '-resources.json', '-resources.md']) {
    const bytes = await readFile(new URL(base.href + suffix), 'utf8');
    assert(!bytes.includes('/workspace/')); assert(!bytes.includes('/home/'));
    assert(!/[\u2013\u2014]/.test(bytes));
    assert(!/"(?:actual|output|perCase|positions|stdout|stderr)"\s*:/.test(bytes));
  }
});
