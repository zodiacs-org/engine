import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { campaignIdentity, runShard } from '../lib/runner.mjs';
import { emptyStats, addResidual } from '../lib/statistics.mjs';
import { renderReport } from '../lib/report.mjs';
import { reportFile } from '../tools/report.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
async function fixture(t, partial = false, quantiles = false) {
  await mkdir(root + 'runtime', { recursive: true });
  const directory = await mkdtemp(root + 'runtime/report-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = { seed: 'invented-report', startMs: 0, endMs: 1000, total: 6, shards: 2,
    channels: { arithmetic: 1, missing: 1 }, conventions: { reference: 'invented arithmetic only' },
    ...(quantiles ? { quantiles: ['arithmetic', 'missing'] } : {}) };
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { invented: 'not an astronomical instrument' } };
  const states = []; let campaign;
  for (let shard = 0; shard < 2; shard++) {
    const result = await runShard({ config, identities, directory, shard, maxCases: partial ? 1 : 100,
      evaluate: async c => ({ arithmetic: c.index === 4 ? { verdict: 'fallback', retflags: 4 } :
        { verdict: c.index % 2 ? 'pass' : 'fail', stats: addResidual(emptyStats(1, { quantiles }), c.index % 2 ? 1 : -2), retflags: 2 },
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
test('historical report schemas retain their exact JSON, markdown and CSV bytes', async t => {
  const expected = [
    { json: '8fc35d2c4d15c328c563150d48b24de189fcbc1d336aea18814dc965a6ab8ac7',
      markdown: '3be57839e63cd7e8e5c99fb97f803ec2ab5f2956347af9ca6a8eaff42f861c78',
      csv: '032c60d38c782c8334caeb03283a0046d5e087e960eabaa94c2099007a20b605' },
    { json: 'bf27b90e2b5e393f616bded961ebbb344b09e4a51eb0a596d7cb6551e42bcf6f',
      markdown: '1c923e0e1c114c55b59c4caf512b647e362e1d8e562a60d8ab830df4eaec92bf',
      csv: '7605549c238668da81490eb48fa113742f405d32359b6e6d8d4eff9b061df080' }
  ];
  for (const quantiles of [false, true]) {
    const { bundle } = await fixture(t, false, quantiles);
    bundle.metadata.runtime = { node: 'v22-invented', platform: 'invented', arch: 'invented' };
    const hashes = Object.fromEntries(Object.entries(renderReport(bundle)).map(([name, bytes]) =>
      [name, createHash('sha256').update(bytes).digest('hex')]));
    assert.deepEqual(hashes, expected[Number(quantiles)]);
  }
});
async function groupedFixture(t) {
  await mkdir(root + 'runtime', { recursive: true });
  const directory = await mkdtemp(root + 'runtime/grouped-report-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const channels = Object.fromEntries(['DE440', 'DE441'].flatMap(group => ['Sun', 'Mars'].flatMap(body => [
    ...['lon', 'lat', 'distance'].map(axis => [`JPL.${group}.${body}.${axis}`, 1]),
    ...['lon', 'lat'].map(axis => [`Convention.${group}.${body}.${axis}`, 1])
  ])));
  const config = { seed: 'invented-grouped-report', startMs: 0, endMs: 1000, total: 4, shards: 2,
    channels, quantiles: Object.keys(channels).sort(), conventions: {
      reference: 'Invented arithmetic only; no physical reference values',
      unavailableBodies: { Mars: 'Invented absent exact-center fixture' },
      referenceGroups: {
        DE440: { status: 'available', intervals: [{ startMs: 0, endMs: 1000 }], reason: 'Invented selected group' },
        DE441: { status: 'empty', intervals: [], reason: 'No requested interval in this invented fixture' }
      } } };
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { invented: 'arithmetic only' } };
  const states = []; let campaign;
  for (let shard = 0; shard < config.shards; shard++) {
    const result = await runShard({ config, identities, directory, shard, evaluate: async sample =>
      Object.fromEntries(Object.keys(channels).map(name => {
        if (name.includes('.DE441.') || name.includes('.Mars.')) return [name, { verdict: 'unsupported' }];
        const residual = name.startsWith('Convention.') ? 0.125 :
          name.endsWith('.distance') ? (sample.index % 2 ? -0.25 : 0.25) :
          (sample.index % 2 ? 1 : -2) * (name.endsWith('.lat') ? 2 : 1);
        const stats = addResidual(emptyStats(1, { quantiles: true }), residual);
        return [name, { verdict: stats.passed ? 'pass' : 'fail', stats }];
      })) });
    states.push(result.state); campaign = result.campaign;
  }
  return { campaign, states, metadata: { title: 'Invented grouped arithmetic report',
    command: ['node', 'invented-grouped-report'], runtime: { node: process.version, platform: process.platform, arch: process.arch },
    units: Object.fromEntries(Object.keys(channels).map(name => [name, name.endsWith('.distance') ? 'km' : 'arcseconds'])),
    exclusions: ['No physical measurement performed; invented arithmetic only'] } };
}
test('grouped reports distinguish coverage, exact-center absence, units and convention differences', async t => {
  const bundle = await groupedFixture(t), outputs = renderReport(bundle), report = JSON.parse(outputs.json);
  assert.equal(report.schema, 'crosscheck-report/3');
  assert.equal(report.referenceGroups.DE440.numericalResiduals, 12);
  assert.equal(report.referenceGroups.DE440.conventionResiduals, 8);
  assert.equal(report.referenceGroups.DE441.numericalResiduals, 0);
  assert.equal(report.referenceGroups.DE441.status, 'empty');
  const numerical = report.channels['JPL.DE440.Sun.lon'];
  assert.equal(numerical.statistics.n, 4); assert.equal(numerical.statistics.maxAbs, 2);
  assert.equal(numerical.statistics.absoluteQuantiles.median.rank, 2);
  assert.deepEqual([numerical.comparisonKind, numerical.referenceGroup, numerical.body, numerical.coordinate, numerical.status],
    ['engine-minus-JPL', 'DE440', 'Sun', 'lon', 'measured']);
  const convention = report.channels['Convention.DE440.Sun.lon'];
  assert.equal(convention.statistics.maxAbs, 0.125);
  assert.equal(convention.comparisonKind, 'JPL-convention-difference');
  assert.equal(report.channels['JPL.DE440.Sun.distance'].unit, 'km');
  assert.equal(report.channels['JPL.DE440.Sun.distance'].statistics.maxAbs, 0.25);
  for (const name of ['JPL.DE441.Sun.lon', 'JPL.DE440.Mars.lon']) {
    const channel = report.channels[name];
    assert.equal(channel.statistics.n, 0); assert.equal(channel.statistics.maxAbs, null);
    assert.equal(channel.statistics.absoluteQuantiles.median, null);
    assert.equal(channel.verdicts.unsupported, 4);
    assert.equal(channel.status, name.includes('DE441') ? 'empty' : 'unavailable');
  }
  const primary = outputs.markdown.split('Engine minus JPL residuals:')[1].split('Separate JPL convention differences:')[0];
  assert(primary.includes('| JPL.DE440.Sun.lon |'));
  assert(!primary.includes('| Convention.DE440.Sun.lon |'));
  assert(outputs.markdown.includes('never subtracted from aggregate engine errors'));
  const percentiles = outputs.markdown.split('Engine minus JPL absolute-error percentiles:')[1]
    .split('Separate convention-difference absolute percentiles:')[0];
  assert(!percentiles.includes('| Convention.'));
  assert(outputs.csv.includes('comparison_kind,reference_group,body,coordinate,status'));
  assert(outputs.csv.includes('"JPL-convention-difference","DE440","Sun","lon","measured"'));
  assert(outputs.csv.includes('"engine-minus-JPL","DE441","Sun","lon","empty"'));
  assert.deepEqual(outputs, renderReport({ ...bundle, states: [...bundle.states].reverse() }));
});
test('grouped reports reject missing coverage metadata or measurements labelled empty or unavailable', async t => {
  const bundle = await groupedFixture(t);
  for (const change of [
    b => { delete b.campaign.config.conventions.referenceGroups; },
    b => { b.campaign.config.conventions.referenceGroups.DE440.status = 'empty'; b.campaign.config.conventions.referenceGroups.DE440.intervals = []; },
    b => { b.campaign.config.conventions.referenceGroups.DE440.status = 'unavailable'; },
    b => { b.campaign.config.conventions.referenceGroups.DE441.intervals = [{ startMs: 0, endMs: 10 }]; },
    b => { b.campaign.config.conventions.referenceGroups.DE440.intervals[0].endMs = 1001; },
    b => { b.campaign.config.conventions.referenceGroups.DE440.positions = [123]; }
  ]) {
    const changed = structuredClone(bundle); change(changed);
    changed.campaign = campaignIdentity(changed.campaign.config, changed.campaign.identities);
    for (const state of changed.states) state.campaign = changed.campaign.sha256;
    assert.throws(() => renderReport(changed), /reference group/);
  }
  const unavailable = structuredClone(bundle);
  Object.assign(unavailable.campaign.config.conventions.referenceGroups.DE441,
    { status: 'unavailable', intervals: [{ startMs: 0, endMs: 1000 }], reason: 'Invented unavailable reference' });
  unavailable.campaign = campaignIdentity(unavailable.campaign.config, unavailable.campaign.identities);
  for (const state of unavailable.states) state.campaign = unavailable.campaign.sha256;
  const report = JSON.parse(renderReport(unavailable).json);
  assert.equal(report.referenceGroups.DE441.status, 'unavailable');
  assert.equal(report.channels['JPL.DE441.Sun.lon'].status, 'unavailable');
  assert.equal(report.channels['JPL.DE441.Sun.lon'].statistics.maxAbs, null);
});
async function swissGroupedFixture(t, available = true) {
  await mkdir(root + 'runtime', { recursive: true });
  const directory = await mkdtemp(root + 'runtime/swiss-grouped-report-test-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const channels = Object.fromEntries(['DE440', 'DE441'].flatMap(group => ['Sun', 'Mars'].flatMap(body =>
    ['JPL', 'Convention', 'Swiss', 'SwissJPL'].flatMap(kind => ['lon', 'lat'].map(axis => [`${kind}.${group}.${body}.${axis}`, 1])))));
  const config = { seed: 'invented-swiss-grouped-report', startMs: 0, endMs: 1000, total: 4, shards: 2,
    channels, quantiles: Object.keys(channels).sort(), conventions: {
      reference: 'Invented arithmetic only; no physical reference values',
      referenceGroups: {
        DE440: { status: 'available', intervals: [{ startMs: 0, endMs: 1000 }], reason: 'Invented selected group' },
        DE441: { status: 'empty', intervals: [], reason: 'No requested interval in this invented fixture' }
      } } };
  const identity = available ? { engineVersion: '0.0', binding: 'pyswisseph 0.0',
    adapterSha256: 'c'.repeat(64), bindingSha256: 'd'.repeat(64), ephemerisFiles: { 'invented.se1': 'e'.repeat(64) } } :
    { status: 'unavailable' };
  const identities = { build: 'a'.repeat(64), tooling: 'b'.repeat(64), references: { Swiss: identity, invented: 'arithmetic only' } };
  const states = []; let campaign;
  for (let shard = 0; shard < config.shards; shard++) {
    const result = await runShard({ config, identities, directory, shard, evaluate: async sample =>
      Object.fromEntries(Object.keys(channels).map(name => {
        if (name.includes('.DE441.') || name.includes('.Mars.') || (!available && name.startsWith('Swiss')))
          return [name, { verdict: 'unsupported' }];
        if (name.startsWith('Swiss') && sample.index > 0) return [name, sample.index < 3 ?
          { verdict: 'fallback', retflags: sample.index === 1 ? 260 : 257 } : { verdict: 'error' }];
        const residual = name.startsWith('SwissJPL.') ? 0.25 : name.startsWith('Swiss.') ? -0.5 :
          name.startsWith('Convention.') ? 0.125 : 2;
        const stats = addResidual(emptyStats(1, { quantiles: true }), residual);
        return [name, { verdict: stats.passed ? 'pass' : 'fail', stats,
          ...(name.startsWith('Swiss') ? { retflags: 258 } : {}) }];
      })) });
    states.push(result.state); campaign = result.campaign;
  }
  return { campaign, states, metadata: { title: 'Invented grouped instrument arithmetic report',
    command: ['node', 'invented-grouped-instrument-report'], runtime: { node: process.version, platform: process.platform, arch: process.arch },
    units: Object.fromEntries(Object.keys(channels).map(name => [name, 'arcseconds'])),
    exclusions: ['No physical measurement performed; invented arithmetic only'] } };
}
test('grouped instrument reports separate comparisons, percentiles and unique returned-flag response totals', async t => {
  const bundle = await swissGroupedFixture(t), outputs = renderReport(bundle), report = JSON.parse(outputs.json);
  assert.equal(report.schema, 'crosscheck-report/4');
  assert.deepEqual([report.referenceGroups.DE440.numericalResiduals, report.referenceGroups.DE440.conventionResiduals,
    report.referenceGroups.DE440.engineSwissResiduals, report.referenceGroups.DE440.swissJplResiduals], [8, 8, 2, 2]);
  assert.equal(report.referenceGroups.DE441.engineSwissResiduals, 0);
  assert.equal(report.referenceGroups.DE441.swissJplResiduals, 0);
  for (const [prefix, kind, maximum] of [['Swiss', 'engine-minus-Swiss', 0.5], ['SwissJPL', 'Swiss-minus-JPL', 0.25]]) {
    const channel = report.channels[`${prefix}.DE440.Sun.lon`];
    assert.equal(channel.comparisonKind, kind); assert.equal(channel.statistics.n, 1);
    assert.equal(channel.statistics.maxAbs, maximum);
    for (const key of ['median', 'p99', 'p999']) {
      assert.equal(channel.statistics.absoluteQuantiles[key].rank, 1);
      assert(channel.statistics.absoluteQuantiles[key].lower <= maximum);
      assert(channel.statistics.absoluteQuantiles[key].upper >= maximum);
    }
    assert.deepEqual(channel.verdicts, { pass: 1, fail: 0, error: 1, unsupported: 0, fallback: 2 });
    assert.deepEqual(channel.flags, { 257: 1, 258: 1, 260: 1 });
    assert.equal(report.channels[`${prefix}.DE441.Sun.lon`].status, 'empty');
    assert.equal(report.channels[`${prefix}.DE440.Mars.lon`].status, 'unavailable');
  }
  const instrument = report.swissInstrument;
  assert.equal(instrument.status, 'available');
  assert.deepEqual(instrument.identity, bundle.campaign.identities.references.Swiss);
  assert.equal(instrument.longitudeChannelOutcomes, 16);
  assert.deepEqual(instrument.verdicts, { pass: 1, fail: 0, error: 1, unsupported: 12, fallback: 2 });
  assert.deepEqual(instrument.returnedFlags, { 257: 1, 258: 1, 260: 1 });
  assert.equal(instrument.swiephResponses, 1);
  assert.equal(instrument.moshierFallbackResponses, 1);
  assert.equal(instrument.otherBackendFallbackResponses, 1);
  assert.match(instrument.countBasis, /not instrument request counts/);
  assert(outputs.markdown.includes('Swiss instrument: available.'));
  assert(outputs.markdown.includes('Moshier fallback 1; other backend fallback 1.'));
  const primary = outputs.markdown.split('Engine minus JPL residuals:')[1].split('Separate JPL convention differences:')[0];
  assert(primary.includes('| JPL.DE440.Sun.lon |')); assert(!primary.includes('| Swiss'));
  const swiss = outputs.markdown.split('Engine minus Swiss instrument residuals:')[1].split('Swiss instrument minus JPL residuals:')[0];
  assert(swiss.includes('| Swiss.DE440.Sun.lon |')); assert(!swiss.includes('| SwissJPL.'));
  const swissQuantiles = outputs.markdown.split('Engine minus Swiss instrument absolute-error percentiles:')[1]
    .split('Swiss instrument minus JPL absolute-error percentiles:')[0];
  assert(swissQuantiles.includes('| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |'));
  assert(swissQuantiles.includes('| Swiss.DE440.Sun.lon | arcseconds | 0.5 |'));
  assert(!swissQuantiles.includes('| SwissJPL.'));
  assert(outputs.csv.includes('"engine-minus-Swiss","DE440","Sun","lon","measured"'));
  assert(outputs.csv.includes('"Swiss-minus-JPL","DE440","Sun","lon","measured"'));
  assert.deepEqual(outputs, renderReport({ ...bundle, states: [...bundle.states].reverse() }));
});
test('grouped reports explicitly retain unavailable Swiss without numerical claims', async t => {
  const bundle = await swissGroupedFixture(t, false), outputs = renderReport(bundle), report = JSON.parse(outputs.json);
  assert.equal(report.schema, 'crosscheck-report/4');
  assert.equal(report.swissInstrument.status, 'unavailable');
  assert.deepEqual(report.swissInstrument.identity, { status: 'unavailable' });
  assert.equal(report.swissInstrument.swiephResponses, 0);
  assert.equal(report.swissInstrument.moshierFallbackResponses, 0);
  assert.equal(report.swissInstrument.otherBackendFallbackResponses, 0);
  assert.deepEqual(report.swissInstrument.returnedFlags, {});
  assert.equal(report.swissInstrument.verdicts.unsupported, 16);
  assert(outputs.markdown.includes('Swiss instrument: unavailable. No engine-versus-Swiss or Swiss-versus-JPL residuals were recorded.'));
  for (const [name, channel] of Object.entries(report.channels).filter(([name]) => name.startsWith('Swiss'))) {
    assert.equal(channel.statistics.n, 0); assert.equal(channel.statistics.maxAbs, null);
    assert.equal(channel.statistics.absoluteQuantiles.median, null);
    assert.equal(channel.status, name.includes('DE441') ? 'empty' : 'unavailable');
  }
  const invalid = await swissGroupedFixture(t);
  invalid.campaign = campaignIdentity(invalid.campaign.config,
    { ...invalid.campaign.identities, references: { Swiss: { status: 'unavailable' } } });
  for (const state of invalid.states) state.campaign = invalid.campaign.sha256;
  assert.throws(() => renderReport(invalid), /Unavailable Swiss instrument/);
  for (const name of ['Swiss.DE440.Sun.lat', 'SwissJPL.DE440.Sun.lon', 'SwissJPL.DE440.Sun.lat']) {
    for (const kind of ['measurement', 'flag', 'error']) {
      const changed = structuredClone(bundle), channel = changed.states[0].channels[name];
      if (kind === 'measurement') {
        channel.stats = addResidual(emptyStats(1, { quantiles: true }), 0.125);
        channel.verdicts.unsupported--; channel.verdicts.pass++;
      } else if (kind === 'flag') channel.flags = { 2: 1 };
      else { channel.verdicts.unsupported--; channel.verdicts.error++; }
      assert.throws(() => renderReport(changed), /Unavailable Swiss instrument/);
    }
  }
});
test('grouped instrument reports reject incomplete identities, raw identity fields and non-hash ephemeris identities', async t => {
  const bundle = await swissGroupedFixture(t);
  for (const change of [identity => { delete identity.bindingSha256; },
    identity => { identity.positions = [123]; }, identity => { identity.binding = 'unknown'; },
    identity => { identity.engineVersion = 'unknown'; }, identity => { identity.ephemerisFiles['invented.se1'] = 'not a hash'; },
    identity => { identity.ephemerisFiles = []; }]) {
    const changed = structuredClone(bundle); change(changed.campaign.identities.references.Swiss);
    changed.campaign = campaignIdentity(changed.campaign.config, changed.campaign.identities);
    for (const state of changed.states) state.campaign = changed.campaign.sha256;
    assert.throws(() => renderReport(changed), /Invalid Swiss instrument identity/);
  }
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
