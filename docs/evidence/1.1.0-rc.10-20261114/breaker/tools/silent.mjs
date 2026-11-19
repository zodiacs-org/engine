// Breaker: results that move when the pack cannot be opened and carry nothing that says so.
// Run in the clean install and in a damaged one; prints one JSON line per call.
import * as root from '@zodiacs/engine';
import * as tech from '@zodiacs/engine/techniques';
import * as internal from '@zodiacs/engine/internal';
const BIRTH = { utc: '1990-04-15T08:30:00Z', latitude: 51.5, longitude: -0.12 };
const B2 = { ...BIRTH, utc: '1988-11-02T17:05:00Z' };
const d0 = '1990-04-15T00:00:00Z', d1 = '1990-04-25T00:00:00Z';
const calls = {
  'findLongitudeCrossings(Sun, 30)': () => root.findLongitudeCrossings('Sun', 30, d0, '1991-04-15T00:00:00Z'),
  'techniques.solarReturnInstant(25, 2020-03-01)': () => tech.solarReturnInstant(25, '2020-03-01T00:00:00Z'),
  'techniques.mostRecentSolarReturnInstant(25, 2020-03-01)': () => tech.mostRecentSolarReturnInstant(25, '2020-03-01T00:00:00Z'),
  'techniques.lunarReturnInstant(25, 2020-03-01)': () => tech.lunarReturnInstant(25, '2020-03-01T00:00:00Z'),
  'techniques.moonIngresses': () => tech.moonIngresses(d0, d1),
  'techniques.moonAspects': () => tech.moonAspects(d0, d1),
  'techniques.voidOfCourseAt': () => tech.voidOfCourseAt(BIRTH.utc),
  'techniques.voidOfCourseWindows': () => tech.voidOfCourseWindows(d0, d1),
  'techniques.moonSignsBetween': () => tech.moonSignsBetween(d0, d1),
  'techniques.compositeChart(birth, birth)': () => tech.compositeChart(BIRTH, B2),
  'techniques.chartAspectPatterns(birth)': () => tech.chartAspectPatterns(BIRTH),
  'internal.bodyLongitude(Moon)': () => internal.bodyLongitude('Moon', new Date(BIRTH.utc)),
  'internal.longitudeSpeed(Moon)': () => internal.longitudeSpeed('Moon', new Date(BIRTH.utc)),
  // controls: these do say so
  'control techniques.solarReturn(birth).flags': () => tech.solarReturn(BIRTH, '2020-03-01T00:00:00Z').flags,
  'control techniques.moonSignCandidates.flags': () => tech.moonSignCandidates('1990-04-15').flags,
  'control searchLongitudeCrossings.flags': () => root.searchLongitudeCrossings('Sun', 30, d0, '1991-04-15T00:00:00Z').flags,
};
const opened = root.defaultEphemeris().de440.opened;
for (const [name, fn] of Object.entries(calls)) {
  const text = JSON.stringify(fn());
  console.log(JSON.stringify({ call: name, packOpened: opened, says: /de440-unavailable|astronomy-engine|jpl-de440/.test(text) ? text.match(/de440-unavailable|astronomy-engine|jpl-de440/)[0] : null, keys: (() => { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : Array.isArray(v) && v[0] && typeof v[0] === 'object' ? ['[]', ...Object.keys(v[0])] : typeof v; })(), head: text.slice(0, 150) }));
}
