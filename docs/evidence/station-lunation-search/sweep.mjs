// Run on a built checkout. Compare the public daily search with offset half-day
// windows on the same source. Both runs include every admissible endpoint.
import assert from 'node:assert/strict';
import { CALC_SPAN, calc, searchLunations, searchStations } from '../../../dist/calc.js';
import { shippedDe440Source } from '../../../dist/de440-pack.js';
import { setDefaultEphemeris } from '../../../dist/index.js';

const source = process.argv[2];
assert.ok(['de440', 'astronomy-engine'].includes(source), 'pass de440 or astronomy-engine');
setDefaultEphemeris(source);
const pack = source === 'de440' ? shippedDe440Source() : null;
const expectedName = pack ? 'jpl-de440' : source;
const dayMs = 86_400_000;
const hourMs = dayMs / 24;
const tt = jd => ({ jd, scale: 'tt' });
const jd = iso => 2440587.5 + Date.parse(iso) / dayMs;
const ttMs = event => Math.round((event.jdTt - 2451545) * dayMs);
// Both TT and UT1 must lie in CALC_SPAN. UT1 is the later constraint at the
// lower end. The upper end is exclusive, so stop at the preceding TT millisecond.
// Interior cuts are 06:00 and 18:00 TT.
const from = { jd: jd(CALC_SPAN.from), scale: 'ut1' };
const to = tt(jd(CALC_SPAN.to) - 1 / dayMs);
const bodies = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
const phases = [0, 90, 180, 270];

function compare(daily, dense) {
  const duplicates = events => events.length - new Set(events.map(ttMs)).size;
  const stats = { daily: daily.length, subdaily: dense.length, matched: 0, missedByDaily: 0, extraDaily: 0,
    duplicateDaily: duplicates(daily), duplicateSubdaily: duplicates(dense), directionDifferences: 0, maxDifferenceMs: 0 };
  let i = 0, j = 0;
  // Match in time order within one fine cell. Record a missing or extra event
  // separately so that a mismatch does not shift all later comparisons.
  while (i < daily.length && j < dense.length) {
    const delta = ttMs(daily[i]) - ttMs(dense[j]);
    if (delta < -dayMs / 2) { stats.extraDaily++; i++; }
    else if (delta > dayMs / 2) { stats.missedByDaily++; j++; }
    else {
      stats.matched++;
      stats.maxDifferenceMs = Math.max(stats.maxDifferenceMs, Math.abs(delta));
      if (daily[i].direction !== dense[j].direction) stats.directionDifferences++;
      i++;
      j++;
    }
  }
  stats.extraDaily += daily.length - i;
  stats.missedByDaily += dense.length - j;
  return stats;
}

// Re-solve with a 30 minute half-step at the lowest absolute curvature in
// each direction, keeping the same apparent longitudes and solar-disc rule.
function halfStep(event) {
  const centre = ttMs(event);
  function speed(ms) {
    const days = ms / dayMs;
    const behind = pack?.place(event.body, days).behindDisc;
    function longitude(offset) {
      if (pack) return pack.place(event.body, (ms + offset) / dayMs, behind).lon;
      const result = calc({ body: event.body, time: tt(2451545 + (ms + offset) / dayMs) });
      assert.equal(result.status, 'ok');
      return result.lon;
    }
    const delta = longitude(hourMs / 2) - longitude(-hourMs / 2);
    return (delta - 360 * Math.floor((delta + 180) / 360)) * 24;
  }
  const after = ms => event.direction === 'direct' ? speed(ms) >= 0 : speed(ms) <= 0;
  let lo = centre - hourMs, hi = centre + hourMs;
  assert.ok(!after(lo) && after(hi), event.at);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (after(mid)) hi = mid;
    else lo = mid;
  }
  const curvature = (speed(hi + hourMs / 2) - speed(hi - hourMs / 2)) * 24;
  assert.equal(Math.sign(curvature), Math.sign(event.curvatureDegPerDay2));
  return { at: event.at, direction: event.direction, shiftMs: hi - centre,
    oneHourDegPerDay2: event.curvatureDegPerDay2, halfHourDegPerDay2: curvature };
}

const rows = [];
for (const selection of [...bodies, ...phases]) {
  const station = typeof selection === 'string';
  function search(from, to) {
    const result = station ? searchStations({ from, to, body: selection })
      : searchLunations({ from, to, phaseDegrees: selection });
    assert.equal(result.status, 'ok', result.detail);
    assert.equal(result.ephemeris.name, expectedName);
    return result.events;
  }
  const daily = search(from, to);
  const dense = [];
  let left = from;
  for (let cut = from.jd + 0.25; cut < to.jd; cut += 0.5) {
    const right = tt(cut);
    dense.push(...search(left, right));
    left = right;
  }
  dense.push(...search(left, to));
  const stats = compare(daily, dense);
  const row = { selection, ...stats };
  if (station) {
    row.shallowest = ['direct', 'retrograde'].map(direction => halfStep(daily
      .filter(event => event.direction === direction)
      .reduce((a, b) => Math.abs(a.curvatureDegPerDay2) < Math.abs(b.curvatureDegPerDay2) ? a : b)));
  }
  rows.push(row);
  console.error(selection, JSON.stringify(stats));
  if (stats.extraDaily || stats.missedByDaily || stats.duplicateDaily || stats.duplicateSubdaily ||
      stats.directionDifferences || stats.maxDifferenceMs) {
    process.exitCode = 1;
  }
}
console.log(JSON.stringify({ source: expectedName, from, to, stepHours: 12, firstCutHourTt: 6, rows }, null, 2));
