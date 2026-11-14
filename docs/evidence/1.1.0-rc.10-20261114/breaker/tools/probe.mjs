// Breaker probe: call everything that reads positions on the installed package and
// report what each result says about its ephemeris. Usage: node probe.mjs <label> [year]
import * as root from '@zodiacs/engine';
import * as calcE from '@zodiacs/engine/calc';
import * as win from '@zodiacs/engine/window';
import * as tech from '@zodiacs/engine/techniques';
import * as timing from '@zodiacs/engine/timing';
import * as sky from '@zodiacs/engine/sky';
import * as vedic from '@zodiacs/engine/vedic';
import * as internal from '@zodiacs/engine/internal';
import * as receipt from '@zodiacs/engine/receipt';

const label = process.argv[2] ?? 'run';
const year = Number(process.argv[3] ?? 1990);
const pre = process.argv[4];
if (pre === 'ae') root.setDefaultEphemeris('astronomy-engine');
const Y = (y, rest) => `${String(y).padStart(4, '0')}${rest}`;
const utc = Y(year, '-04-15T08:30:00Z');
const BIRTH = { utc, latitude: 51.5, longitude: -0.12 };
const B2 = { ...BIRTH, utc: Y(year - 2, '-11-02T17:05:00Z') };
const later = Y(year + 30, '-03-01T00:00:00Z');
const d0 = Y(year, '-04-15T00:00:00Z');
const d1 = Y(year, '-04-25T00:00:00Z');
const day = Y(year, '-04-15');
const obs = { latitude: 51.5, longitude: -0.12 };

const calls = {
  defaultEphemeris: () => root.defaultEphemeris(),
  natalChart: () => root.natalChart(BIRTH),
  natalChart_noTime: () => root.natalChart({ utc, timeKnown: false }),
  positions: () => root.positions(utc),
  transits: () => root.transits(BIRTH, later),
  synastry: () => root.synastry(BIRTH, B2),
  progressedBodies: () => root.progressedBodies(utc, later),
  moonPhase: () => root.moonPhase(utc),
  saturnReturn: () => root.saturnReturn(utc),
  searchLongitudeCrossings: () => root.searchLongitudeCrossings('Sun', 30, d0, Y(year + 1, '-04-15T00:00:00Z')),
  findLongitudeCrossings: () => root.findLongitudeCrossings('Sun', 30, d0, Y(year + 1, '-04-15T00:00:00Z')),
  chartPoints: () => root.chartPoints(root.natalChart(BIRTH)),
  chartDeclinations: () => root.chartDeclinations(root.natalChart(BIRTH)),
  'internal.bodyLongitude': () => internal.bodyLongitude('Moon', new Date(utc)),
  'internal.longitudeSpeed': () => internal.longitudeSpeed('Moon', new Date(utc)),
  'internal.computeBodies': () => internal.computeBodies(new Date(utc)),
  'internal.computeChart': () => internal.computeChart({ utc: new Date(utc), timeKnown: false }),
  'receipt.createNatalEnvelope': () => receipt.createNatalEnvelope(root.natalChart(BIRTH)),
  'calc.calc Sun': () => calcE.calc({ body: 'Sun', time: utc }),
  'calc.calc Moon equatorial': () => calcE.calc({ body: 'Moon', time: utc, frame: 'equatorial-true-of-date' }),
  'calc.calc NNode': () => calcE.calc({ body: 'North Node', time: utc }),
  'calc.calc Mars helio': () => calcE.calc({ body: 'Mars', time: utc, center: 'heliocentric' }),
  'calc.calc Mars topo': () => calcE.calc({ body: 'Mars', time: utc, center: { topocentric: { latitude: 51.5, longitude: -0.12 } } }),
  'calc.calc Mars ecliptic-j2000': () => calcE.calc({ body: 'Mars', time: utc, frame: 'ecliptic-j2000' }),
  'calc.chart': () => calcE.chart({ time: utc, place: obs }),
  'calc.events': () => calcE.events({ kind: 'longitude-crossing', body: 'Sun', longitude: 30, from: d0, to: Y(year + 1, '-04-15T00:00:00Z') }),
  'calc.houses': () => calcE.houses({ time: utc, place: obs }),
  'window.birthWindow': () => win.birthWindow({ start: Y(year, '-04-15T08:00:00Z'), end: Y(year, '-04-15T09:00:00Z'), ...obs }),
  'tech.solarReturn': () => tech.solarReturn(BIRTH, later),
  'tech.lunarReturn': () => tech.lunarReturn(BIRTH, later),
  'tech.solarReturnInstant': () => tech.solarReturnInstant(25, later),
  'tech.mostRecentSolarReturnInstant': () => tech.mostRecentSolarReturnInstant(25, later),
  'tech.lunarReturnInstant': () => tech.lunarReturnInstant(25, later),
  'tech.moonAspects': () => tech.moonAspects(d0, d1),
  'tech.moonIngresses': () => tech.moonIngresses(d0, d1),
  'tech.moonSignCandidates': () => tech.moonSignCandidates(day),
  'tech.moonSignsBetween': () => tech.moonSignsBetween(d0, d1),
  'tech.voidOfCourseAt': () => tech.voidOfCourseAt(utc),
  'tech.voidOfCourseWindows': () => tech.voidOfCourseWindows(d0, d1),
  'tech.compositeChart': () => tech.compositeChart(BIRTH, B2),
  'tech.davisonChart': () => tech.davisonChart(BIRTH, B2),
  'tech.chartAspectPatterns': () => tech.chartAspectPatterns(BIRTH),
  'timing.profectionAt': () => timing.profectionAt(BIRTH, later),
  'timing.profectionYear': () => timing.profectionYear(BIRTH, 30),
  'timing.firdaria': () => timing.firdaria(BIRTH),
  'timing.firdariaAt': () => timing.firdariaAt(BIRTH, later),
  'timing.planetaryReturns': () => timing.planetaryReturns(BIRTH, 'Jupiter', utc, later),
  'timing.solarArc': () => timing.solarArc(utc, later),
  'timing.solarArcDirections': () => timing.solarArcDirections(BIRTH, later),
  'timing.zodiacalReleasing': () => timing.zodiacalReleasing(BIRTH, 'Lot of Fortune', utc, later),
  'timing.zodiacalReleasingAt': () => timing.zodiacalReleasingAt(BIRTH, 'Lot of Fortune', later),
  'sky.skyEvents Sun': () => sky.skyEvents('Sun', obs, d0, d1),
  'sky.skyEventsOn Moon': () => sky.skyEventsOn('Moon', obs, day),
  'sky.planetaryHours': () => sky.planetaryHours(obs, day),
  'sky.planetaryHourAt': () => sky.planetaryHourAt(obs, utc),
  'vedic.ayanamsa lahiri': () => vedic.ayanamsa('lahiri', utc),
  'vedic.siderealChart': () => vedic.siderealChart(BIRTH, 'lahiri'),
  'vedic.vargaSensitivity': () => vedic.vargaSensitivity(BIRTH, 'lahiri'),
  'vedic.vimshottariDasha(sidereal moon)': () => {
    const c = vedic.siderealChart(BIRTH, 'lahiri');
    const moon = (c.bodies ?? c.chart?.bodies ?? []).find((b) => b.body === 'Moon');
    return vedic.vimshottariDasha(moon?.sidereal ?? moon?.siderealLongitude ?? moon);
  },
};

const rows = [];
const dump = {};
const { createHash } = await import('node:crypto');
for (const [name, fn] of Object.entries(calls)) {
  let out;
  try {
    const value = fn();
    const text = JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? String(v) : v)) ?? String(value);
    dump[name] = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const kind = Array.isArray(value) ? `array[${value.length}]` : value instanceof Date ? 'Date' : typeof value;
    const status = value && typeof value === 'object' && 'status' in value ? `status=${value.status}${value.reason ? ':' + value.reason : ''} ` : '';
    out = {
      name,
      kind,
      status,
      unavailable: text.includes('de440-unavailable'),
      outside: text.includes('outside-de440-span'),
      namesAE: text.includes('astronomy-engine'),
      namesDE: text.includes('jpl-de440'),
      topFlags: value && typeof value === 'object' && Array.isArray(value.flags) ? value.flags.join(',') : undefined,
      sample: text.slice(0, 90),
    };
  } catch (error) {
    out = { name, threw: `${error?.name}: ${String(error?.message).slice(0, 140)}` };
  }
  rows.push(out);
}
console.log(`# ${label}: year ${year}${pre ? ', ' + pre : ''}; default ${JSON.stringify(root.defaultEphemeris())}`);
for (const r of rows) {
  if (r.threw) { console.log(`THREW   ${r.name}: ${r.threw}`); continue; }
  const says = [r.unavailable && 'de440-unavailable', r.outside && 'outside-de440-span', r.namesAE && 'names-AE', r.namesDE && 'names-DE440'].filter(Boolean).join(' ') || 'SAYS NOTHING';
  console.log(`${says.padEnd(48)} ${r.name} [${r.kind}] ${r.status}${r.topFlags !== undefined ? 'flags=[' + r.topFlags + '] ' : ''}${says === 'SAYS NOTHING' ? r.sample : ''}`);
}

if (process.argv[5]) (await import('node:fs')).writeFileSync(process.argv[5], JSON.stringify(dump, null, 1));
