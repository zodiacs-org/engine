import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEvaluator, CHANNELS, observation } from '../lib/campaign.mjs';
import { campaignIdentity } from '../lib/runner.mjs';

// Artifact consistency checks, not independent astronomical accuracy evidence.
test('committed bounded campaign is complete and labels unavailable comparisons', async () => {
  const report = JSON.parse(await readFile(new URL('../reports/bounded-sample.json', import.meta.url), 'utf8'));
  assert.deepEqual(report.campaign, campaignIdentity(report.campaign.config, report.campaign.identities));
  assert.equal(report.complete, true);
  assert.equal(report.completed, 64);
  assert.equal(report.campaign.config.total, report.completed);
  const indices = report.coverage.flatMap(shard => Array.from({ length: shard.completed },
    (_, i) => shard.firstIndex + i * shard.stride));
  assert.deepEqual(indices.sort((a, b) => a - b), Array.from({ length: report.completed }, (_, i) => i));
  assert.equal(report.campaign.identities.references.JPL.name, 'de440s.bsp');
  assert.equal(report.campaign.identities.references.Swiss.status, 'unavailable');
  assert.match(report.campaign.identities.references.Swiss.reason, /external installation/);
  const measured = Object.entries(report.channels).filter(([, channel]) => channel.statistics.n > 0);
  assert.equal(measured.length, 8);
  for (const [name, channel] of measured) {
    assert.match(name, /^JPL\.(Sun|Moon|Mercury|Venus)\.(lon|lat)$/);
    assert.equal(channel.statistics.n, report.completed);
    assert.equal(channel.verdicts.pass + channel.verdicts.fail, report.completed);
  }
  for (const name of ['Swiss.positions', 'JPL.otherBodies', 'JPL.housesNodesAngles']) {
    assert.equal(report.channels[name].statistics.n, 0);
    assert.equal(report.channels[name].statistics.maxAbs, null);
    assert.equal(report.channels[name].verdicts.unsupported, report.completed);
  }
  const exclusions = report.metadata.exclusions.join('\n');
  assert.match(exclusions, /Swiss unavailable/);
  assert.match(exclusions, /no DE441 comparison/);
  assert.match(exclusions, /Houses, nodes, angles, speeds and topocentric/);
});

test('screening arithmetic preserves signs and threshold equality', () => {
  assert.equal(observation(-60, 60).verdict, 'pass');
  assert.equal(observation(60.01, 60).verdict, 'fail');
  assert.equal(observation(-12, 60).stats.mean, -12);
});
test('invented-state campaign interprets TT and retains only aggregate outcomes', async () => {
  let birth;
  const requests = [];
  const evaluate = createEvaluator({ terms: Array.from({ length: 77 }, () => Array(11).fill(0)), natalChart: input => {
    birth = input;
    return { bodies: ['Sun', 'Moon', 'Mercury', 'Venus'].map(body => ({ body, lon: 359, lat: 1 })) };
  }, readState: async request => {
    requests.push(request);
    return { frame: 'J2000', timeScale: 'TDB', positionUnit: 'km', velocityUnit: 'km/s', corrections: 'geometric',
      position: request.target === 399 ? [0, 0, 0] : [100000, 0, 0], velocity: [0, 0, 0] };
  } });
  const outcome = await evaluate({ utc: '2000-01-01T12:00:00Z', latitude: 10, longitude: -20, houseSystem: 'equal' });
  assert.equal(birth.timeScale, 'tt');
  assert.equal(birth.latitude, 10);
  assert.equal(birth.houseSystem, 'equal');
  assert.deepEqual(Object.keys(outcome).sort(), Object.keys(CHANNELS).sort());
  assert.equal(outcome['Swiss.positions'].verdict, 'unsupported');
  assert(!Object.hasOwn(outcome['Swiss.positions'], 'stats'));
  assert(outcome['JPL.Sun.lon'].stats.mean < 0); // Wrap gives about -1 degree, not +359.
  assert(requests.some(r => r.target === 10 && r.tdbSeconds < 0)); // Reception light-time.
  const lunar = requests.filter(r => r.target === 301);
  assert.equal(lunar.length, 1); // Moon NONE does not iterate emission.
  for (const value of Object.values(outcome)) {
    assert.deepEqual(Object.keys(value).sort(), value.stats ? ['stats', 'verdict'] : ['verdict']);
  }
});
