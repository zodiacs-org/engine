// Only aggregate residuals leave the evaluator. No engine/reference values persist.
import { ttToTdb, reduceJpl, AU_KM } from './reduction.mjs';
import { trueOfDate, rotate } from './frames.mjs';
import { emptyStats, addResidual, angularResidual } from './statistics.mjs';
export const TARGETS = Object.freeze({ Sun: 10, Moon: 301, Mercury: 199, Venus: 299 });
export const CHANNELS = Object.freeze(Object.fromEntries([
  ...Object.keys(TARGETS).flatMap(body => ['lon', 'lat'].map(axis => [`JPL.${body}.${axis}`, 60])),
  ['Swiss.positions', 60], ['JPL.otherBodies', 60], ['JPL.housesNodesAngles', 60]
]));
export function observation(residual, tolerance, options) {
  const stats = addResidual(emptyStats(tolerance, options), residual);
  return { verdict: stats.passed ? 'pass' : 'fail', stats };
}
export function distanceChannels(toleranceKm) {
  emptyStats(toleranceKm); // A caller must choose the screening criterion in km.
  return Object.fromEntries(Object.keys(TARGETS).map(body => [`JPL.${body}.distance`, toleranceKm]));
}
export function distanceResidualKm(actualAu, referenceKm) {
  if (![actualAu, referenceKm].every(value => Number.isFinite(value) && value > 0)) throw Error('Positive finite distances required.');
  const residual = actualAu * AU_KM - referenceKm;
  if (!Number.isFinite(residual)) throw Error('Invalid distance residual.');
  return residual;
}
export function createEvaluator({ natalChart, readState, terms, calc, distanceToleranceKm, quantiles = false }) {
  const withDistance = distanceToleranceKm !== undefined;
  const channels = { ...CHANNELS, ...(withDistance ? distanceChannels(distanceToleranceKm) : {}) };
  emptyStats(0, { quantiles });
  if (withDistance && typeof calc !== 'function') throw Error('Distance comparison requires the engine calculation entry.');
  return async sample => {
    // ISO sampler labels are deliberately interpreted as TT, not civil UTC.
    const chart = natalChart({ utc: sample.utc, timeScale: 'tt', latitude: sample.latitude,
      longitude: sample.longitude, houseSystem: sample.houseSystem });
    const ttDays = (Date.parse(sample.utc) - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const { tdbSeconds } = ttToTdb(ttDays * 86400);
    const rotation = trueOfDate(ttDays, terms, 'true-ecliptic-equinox-date');
    const outcomes = {};
    for (const [body, target] of Object.entries(TARGETS)) {
      const result = await reduceJpl(readState, { target, center: 399, tdbSeconds,
        correction: body === 'Moon' ? 'NONE' : 'CN+S' });
      const [x, y, z] = rotate(rotation.matrix, result.direction);
      const lon = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      const lat = Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI;
      const actual = chart.bodies.find(value => value.body === body);
      outcomes[`JPL.${body}.lon`] = observation(angularResidual(actual.lon, lon) * 3600, channels[`JPL.${body}.lon`], { quantiles });
      outcomes[`JPL.${body}.lat`] = observation((actual.lat - lat) * 3600, channels[`JPL.${body}.lat`], { quantiles });
      if (withDistance) {
        // Chart body rows omit range. calc's apparent geocentric range is the
        // light path for planets and the geometric lunar series for the Moon.
        // Its TT Julian date is binary64, as recorded by the wider campaign.
        const measured = calc({ body, time: { jd: ttDays + 2451545, scale: 'tt' },
          center: 'geocentric', frame: 'ecliptic-true-of-date',
          flags: { correction: 'apparent', speeds: false, deflection: false } });
        if (measured?.status !== 'ok') throw Error('Engine distance calculation refused.');
        outcomes[`JPL.${body}.distance`] = observation(distanceResidualKm(measured.dist, Math.hypot(...result.position)),
          distanceToleranceKm, { quantiles });
      }
    }
    outcomes['Swiss.positions'] = { verdict: 'unsupported' };
    outcomes['JPL.otherBodies'] = { verdict: 'unsupported' };
    outcomes['JPL.housesNodesAngles'] = { verdict: 'unsupported' };
    return outcomes;
  };
}
