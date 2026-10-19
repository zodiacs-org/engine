// Grouped aggregate measurements. Transient positions never leave this evaluator.
import { EXACT_TARGETS } from './reference-plan.mjs';
import { TARGETS, observation, distanceResidualKm } from './campaign.mjs';
import { ttToTdb, reduceJpl, C_KM_S } from './reduction.mjs';
import { apparentJpl } from './apparent.mjs';
import { trueOfDate, rotate } from './frames.mjs';

export const REFERENCE_GROUPS = Object.freeze(['DE440', 'DE441']);
export const DISTANCE_SCREEN_KM = 10000;
export function groupedChannels() {
  return Object.fromEntries([
    ...REFERENCE_GROUPS.flatMap(group => Object.keys(EXACT_TARGETS).flatMap(body => [
      ...['lon', 'lat', 'distance'].map(axis => [`JPL.${group}.${body}.${axis}`, axis === 'distance' ? DISTANCE_SCREEN_KM : 60]),
      ...['lon', 'lat'].map(axis => [`Convention.${group}.${body}.${axis}`, 60])
    ])), ['Swiss.positions', 60], ['JPL.housesNodesAngles', 60]
  ]);
}
function spherical([x, y, z]) {
  return { lon: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360,
    lat: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI };
}
const angular = (a, b) => ((a - b + 540) % 360) - 180;

export function createGroupedEvaluator({ natalChart, calc, terms, referenceAt }) {
  if (![natalChart, calc, referenceAt].every(fn => typeof fn === 'function')) throw Error('Explicit chart, calculation and reference functions required.');
  const channels = groupedChannels();
  return async sample => {
    const chart = natalChart({ utc: sample.utc, timeScale: 'tt', latitude: sample.latitude,
      longitude: sample.longitude, houseSystem: sample.houseSystem });
    const ttDays = (Date.parse(sample.utc) - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const { tdbSeconds } = ttToTdb(ttDays * 86400);
    const { group, readState } = await referenceAt(tdbSeconds);
    if (!REFERENCE_GROUPS.includes(group) || typeof readState !== 'function') throw Error('Invalid selected reference.');
    const rotation = trueOfDate(ttDays, terms, 'true-ecliptic-equinox-date');
    // Repeated light-time reductions share only this chart's bounded transient states.
    const states = new Map();
    const read = request => {
      const key = JSON.stringify(request);
      if (!states.has(key)) {
        if (states.size >= 256) throw Error('Transient state budget exceeded.');
        states.set(key, Promise.resolve(readState(request)));
      }
      return states.get(key);
    };
    const outcomes = Object.fromEntries(Object.keys(channels).map(name => [name, { verdict: 'unsupported' }]));
    function record(name, residual) {
      outcomes[name] = observation(residual, channels[name], { quantiles: true });
    }
    for (const [body, target] of Object.entries(TARGETS)) {
      const baseline = await reduceJpl(read, { target, center: 399, tdbSeconds,
        correction: body === 'Moon' ? 'NONE' : 'CN+S' });
      const historical = spherical(rotate(rotation.matrix, baseline.direction));
      const reference = body === 'Moon' ? historical : spherical((await apparentJpl(read, {
        target, center: 399, tdbSeconds, ttDays, correction: 'CN+REL',
        frame: 'true-ecliptic-equinox-date', terms })).direction);
      const actual = chart.bodies.find(row => row.body === body);
      if (!actual || ![actual.lon, actual.lat].every(Number.isFinite)) throw Error('Invalid chart position.');
      record(`JPL.${group}.${body}.lon`, angular(actual.lon, reference.lon) * 3600);
      record(`JPL.${group}.${body}.lat`, (actual.lat - reference.lat) * 3600);
      record(`Convention.${group}.${body}.lon`, angular(reference.lon, historical.lon) * 3600);
      record(`Convention.${group}.${body}.lat`, (reference.lat - historical.lat) * 3600);
      // Range is a light path, never the norm of an aberrated direction.
      const range = body === 'Moon' ? Math.hypot(...baseline.position) : baseline.lightTimeSeconds * C_KM_S;
      const measured = calc({ body, time: { jd: ttDays + 2451545, scale: 'tt' },
        center: 'geocentric', frame: 'ecliptic-true-of-date',
        flags: { correction: 'apparent', speeds: false, deflection: false } });
      if (measured?.status !== 'ok') throw Error('Engine distance calculation refused.');
      record(`JPL.${group}.${body}.distance`, distanceResidualKm(measured.dist, range));
    }
    return outcomes;
  };
}
