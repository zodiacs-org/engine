/* Synthetic packed-consumer boundary checks for the owner's F-80 decision.
 * Pinned zero Delta-T makes the TT, UT1 and UTC Julian-date endpoint requests
 * share the same TT, so conversion rounding cannot hide an omitted scale.
 * These are contract/regression checks, not accuracy evidence. */
import assert from 'node:assert/strict';
import { ENGINE_VERSION, EPHEMERIS_SPAN } from '@zodiacs/engine';
import { calc, houses, events, chart } from '@zodiacs/engine/calc';

assert.equal(ENGINE_VERSION, '1.0.0-rc.2');
const TIME = '2026-03-20T12:00:00Z';
const PLACE = { latitude: 40, longitude: -3.7 };
const failures = [];
const counts = { inclusive: 0, beyond: 0 };
const ends = [EPHEMERIS_SPAN.daysFromJ2000.from, EPHEMERIS_SPAN.daysFromJ2000.to];
function run(zodiac) {
  return {
    calc: calc({ body: 'Sun', time: TIME, zodiac }),
    houses: houses({ time: TIME, place: PLACE, houseSystem: 'placidus', zodiac }),
    events: events({ kind: 'longitude-crossing', body: 'Sun', longitude: 0,
      from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z', zodiac }),
    chart: chart({ time: TIME, place: PLACE, houseSystem: 'placidus', zodiac }),
  };
}
for (const model of ['engine', 'newcomb', 'iau1976']) {
  for (const scale of ['tt', 'ut1', 'utc']) {
    for (const [index, end] of ends.entries()) {
      for (const beyond of [false, true]) {
        const jd = 2451545 + end + (beyond ? (index === 0 ? -1 : 1) : 0);
        const results = run({ sidereal: { epoch: { jd, scale, deltaT: 0 }, value: 18, model } });
        for (const [fn, result] of Object.entries(results)) {
          const label = `${model}/${scale}/${index}/${beyond}/${fn}`;
          try {
            if (beyond) {
              assert.equal(result.status, 'refused');
              assert.equal(result.reason, 'epoch-out-of-range');
              assert.deepEqual(result.epochSpan, EPHEMERIS_SPAN);
              assert.match(result.detail, /epoch/i);
              counts.beyond += 1;
            } else {
              assert.equal(result.status, 'ok');
              assert.ok(result.receipt);
              counts.inclusive += 1;
            }
          } catch {
            failures.push(label);
          }
        }
      }
    }
  }
}
console.log(JSON.stringify({
  schema: 'zodiacs.calc-epoch-refusals.v1', engine: ENGINE_VERSION,
  epochSpan: EPHEMERIS_SPAN, scales: ['tt', 'ut1', 'utc'],
  deltaT: 0, counts, failures,
}, null, 2));
if (failures.length || counts.inclusive !== 72 || counts.beyond !== 72) process.exitCode = 1;
