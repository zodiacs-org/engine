import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluator, CHANNELS, observation } from '../lib/campaign.mjs';

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
