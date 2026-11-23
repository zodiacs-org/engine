// From the repository root, on a fresh build: node docs/evidence/station-lunation-search/measure.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { judge, readSuite, runAdapter } from '../../../conformance/harness/lib.mjs';
import { searchLunations, searchStations } from '../../../dist/calc.js';
import { setDefaultEphemeris } from '../../../dist/index.js';

const vectors = readSuite().flatMap(({ file }) => file.vectors);
const cases = vectors.filter(({ kind }) => ['event.station', 'event.lunation'].includes(kind));
const rows = [];
for (const [source, option, name] of [
  ['jpl-de440', '', 'zodiacs-engine'],
  ['astronomy-engine', ' --ephemeris astronomy-engine', 'zodiacs-engine-astronomy-engine']
]) {
  // Preserve the call order of the full harness. The adapter receives only the protocol input.
  const { responses } = await runAdapter('node conformance/adapters/zodiacs-engine.mjs' + option, vectors);
  const recorded = JSON.parse(readFileSync(`conformance/results/${name}.json`, 'utf8'));
  const byId = new Map(recorded.results.map(row => [row.id, row]));
  for (const v of cases) {
    const response = responses.get(v.id);
    const result = judge(v, response);
    const saved = byId.get(v.id);
    assert.equal(result.verdict, saved.verdict, v.id);
    assert.deepEqual(result.residual, saved.residual, v.id);
    assert.equal(response.meta.ephemeris.name, source);
    const field = 'tt_s' in v.expected ? 'tt_s' : 'utc_s';
    const actual = response.output[field];
    const expected = v.expected[field];
    const signed = actual - expected;
    const tolerance = v.tolerance[field].abs;
    rows.push([source, v.id, field, v.input.body ?? v.input.phase_deg, expected, actual,
      signed, tolerance, Math.abs(signed) / tolerance, v.expected.direction ?? '',
      response.output.direction ?? '', result.verdict]);
  }
}
// Round-trip decimal strings for the actual binary64 values, ahead of the harness's display rounding.
const header = 'source,id,field,body_or_phase_deg,expected_s,actual_s,actual_minus_expected_s,tolerance_s,absolute_fraction,expected_direction,actual_direction,verdict';
writeFileSync(new URL('residuals.csv', import.meta.url), [header, ...rows.map(r => r.join(','))].join('\n') + '\n');

// The independent quarters and outer stations are outside the released vector set.
const reference = JSON.parse(readFileSync(new URL('reference.json', import.meta.url), 'utf8'));
const extra = ['source,body_or_phase_deg,direction,expected_tt_s,actual_minus_expected_ms,tolerance_s,estimated_timing_s'];
const tt = seconds => ({ jd: 2451545 + seconds / 86400, scale: 'tt' });
for (const source of ['de440', 'astronomy-engine']) {
  setDefaultEphemeris(source);
  for (const { selection, fromTtSeconds, toTtSeconds, events } of reference.cases) {
    const window = { from: tt(fromTtSeconds), to: tt(toTtSeconds) };
    const found = typeof selection === 'number' ? searchLunations({ ...window, phaseDegrees: selection })
      : searchStations({ ...window, body: selection });
    assert.equal(found.status, 'ok');
    assert.equal(found.ephemeris.name, source === 'de440' ? 'jpl-de440' : source);
    assert.equal(found.events.length, events.length);
    for (const [i, expected] of events.entries()) {
      const event = found.events[i];
      assert.equal(event.direction, expected.direction);
      const deltaMs = Math.round((event.jdTt - 2451545) * 86_400_000) - Math.round(expected.ttSeconds * 1000);
      assert.ok(Math.abs(deltaMs) <= 1000 * expected.toleranceSeconds);
      extra.push([found.ephemeris.name, selection, event.direction ?? '', expected.ttSeconds,
        deltaMs, expected.toleranceSeconds, event.bounds.timing.value].join(','));
    }
  }
}
writeFileSync(new URL('reference-residuals.csv', import.meta.url), extra.join('\n') + '\n');
