import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { campaignIdentity } from '../lib/runner.mjs';
import { renderResources } from '../tools/progress.mjs';
import { finalHeadline } from '../reporting/final-campaign.mjs';

const base = new URL('../reports/phase2-measured-tt', import.meta.url);
const artifact = suffix => readFile(new URL(base.href + suffix), 'utf8');
const bodies = ['Sun', 'Moon', 'Mercury', 'Venus'];

test('retained phase2 measurement continues the earlier identities, prefixes and resource ledger', async () => {
  const report = JSON.parse(await artifact('.json'));
  const resources = JSON.parse(await artifact('-resources.json'));
  const earlier = JSON.parse(await readFile(new URL('../reports/phase2-million-tt-progress.json', import.meta.url), 'utf8'));
  const earlierResources = JSON.parse(await readFile(new URL('../reports/phase2-million-tt-progress-resources.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.campaign, campaignIdentity(report.campaign.config, report.campaign.identities));
  assert.deepEqual(report.campaign, earlier.campaign);
  assert.equal(report.completed, 15360);
  assert.equal(report.complete, false);
  assert.equal(report.campaign.config.total, 1000000);
  assert.equal(report.campaign.config.seed, 'synthetic-phase2-million-v1');
  assert.equal(report.span.startMsInclusive, Date.UTC(1800, 0, 1));
  assert.equal(report.span.endMsExclusive, Date.UTC(2200, 0, 1));
  assert.deepEqual(report.coverage.map(row => [row.completed, row.firstIndex, row.lastIndex, row.stride]),
    [[5120, 0, 15357, 3], [5120, 1, 15358, 3], [5120, 2, 15359, 3]]);
  assert.deepEqual(report.metadata.command, ['node', 'crosscheck/reporting/final-campaign.mjs',
    'crosscheck/runtime/campaigns/phase2-million-tt/final-bundle.json',
    'crosscheck/runtime/campaigns/phase2-million-tt/resource-progress.json', 'phase2-measured-tt']);
  assert.equal(resources.campaignSha256, report.campaign.sha256);
  assert.equal(resources.completed, report.completed);
  assert.equal(resources.complete, false);
  assert.equal(resources.requested, report.campaign.config.total);
  assert.deepEqual(resources.invocations.slice(0, 3), earlierResources.invocations);
  assert.equal(resources.invocations.length, 4);
  assert.deepEqual(resources.invocations.map(row => row.processed), [0, 3, 3069, 12288]);
  assert.deepEqual(resources.invocations.at(-1).before, [1024, 1024, 1024]);
  assert.deepEqual(resources.checkpointPrefixes, [5120, 5120, 5120]);
  assert.deepEqual(resources.invocations.at(-1).driverCommand,
    ['node', 'crosscheck/tools/campaign.mjs', 'crosscheck/runtime/p5-million.json', 'all', '4096']);
  assert(resources.invocations.every(row => row.elapsedNanoseconds > 0 &&
    row.diskBefore.usedBytes <= row.diskBefore.limitBytes && row.diskAfter.usedBytes <= row.diskAfter.limitBytes));
  const ledger = Object.fromEntries(['schema', 'spec', 'specSha256', 'campaignSha256', 'invocations']
    .map(key => [key, resources[key]]));
  const rendered = renderResources(ledger, resources.spec, {
    campaignSha256: report.campaign.sha256, completed: report.coverage.map(row => row.completed)
  });
  assert.equal(rendered.json, await artifact('-resources.json'));
  assert.equal(rendered.markdown, await artifact('-resources.md'));
  const markdown = await artifact('.md');
  assert(markdown.startsWith('# ' + report.metadata.title + '\n\n' + finalHeadline(report, resources) + '\n'));
});

test('retained paired statistics keep chart counts, units, percentiles and unavailable comparisons explicit', async () => {
  const report = JSON.parse(await artifact('.json'));
  const total = report.completed;
  assert.equal(report.referenceGroups.DE440.numericalResiduals, total * 12);
  assert.equal(report.referenceGroups.DE440.conventionResiduals, total * 8);
  assert.equal(report.referenceGroups.DE440.engineSwissResiduals, total * 8);
  assert.equal(report.referenceGroups.DE440.swissJplResiduals, total * 8);
  assert.equal(report.referenceGroups.DE441.status, 'empty');
  assert.deepEqual(report.referenceGroups.DE441.intervals, []);
  assert.equal(report.referenceGroups.DE441.numericalResiduals, 0);
  assert.equal(report.swissInstrument.status, 'available');
  assert.equal(report.swissInstrument.swiephResponses, total * bodies.length);
  assert.equal(report.swissInstrument.moshierFallbackResponses, 0);
  assert.equal(report.swissInstrument.otherBackendFallbackResponses, 0);
  assert.deepEqual(report.swissInstrument.returnedFlags, { 2: total * bodies.length });
  for (const [name, row] of Object.entries(report.channels)) {
    if (!/^(JPL|Convention|Swiss|SwissJPL)\.DE44[01]\./.test(name)) continue;
    const measured = row.referenceGroup === 'DE440' && bodies.includes(row.body);
    assert.equal(row.statistics.n, measured ? total : 0);
    assert.equal(row.status, measured ? 'measured' : row.referenceGroup === 'DE441' ? 'empty' : 'unavailable');
    assert.equal(row.unit, name.endsWith('.distance') ? 'km' : 'arcseconds');
    if (measured) {
      for (const [key, probability] of [['median', 0.5], ['p99', 0.99], ['p999', 0.999]]) {
        const interval = row.statistics.absoluteQuantiles[key];
        assert.equal(interval.rank, Math.ceil(total * probability));
        assert(interval.lower <= interval.upper && interval.upper <= row.statistics.maxAbs);
      }
      if (/^Swiss/.test(name)) assert.deepEqual(row.flags, { 2: total });
    } else {
      assert.equal(row.statistics.maxAbs, null);
      assert.equal(row.statistics.absoluteQuantiles.median, null);
      assert.equal(row.statistics.absoluteQuantiles.p99, null);
      assert.equal(row.statistics.absoluteQuantiles.p999, null);
      assert.equal(row.verdicts.unsupported, total);
    }
  }
  // Retention evidence only. No instrument-derived position is a test expectation.
  for (const suffix of ['.json', '.csv', '.md', '-resources.json', '-resources.md']) {
    const bytes = await artifact(suffix);
    assert(Buffer.byteLength(bytes) < 2000000);
    assert(!bytes.includes('/workspace/'));
    assert(!bytes.includes('/home/'));
    assert(!/[\u2013\u2014]/.test(bytes));
    assert(!/"(?:actual|output|perCase|positions|stdout|stderr)"\s*:/.test(bytes));
  }
});
