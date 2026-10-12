// Only aggregate residuals leave the evaluator. No engine/reference values persist.
import { ttToTdb, reduceJpl } from './reduction.mjs';
import { trueOfDate, rotate } from './frames.mjs';
import { emptyStats, addResidual, angularResidual } from './statistics.mjs';
export const TARGETS = Object.freeze({ Sun: 10, Moon: 301, Mercury: 199, Venus: 299 });
export const CHANNELS = Object.freeze(Object.fromEntries([
  ...Object.keys(TARGETS).flatMap(body => ['lon', 'lat'].map(axis => [`JPL.${body}.${axis}`, 60])),
  ['Swiss.positions', 60], ['JPL.otherBodies', 60], ['JPL.housesNodesAngles', 60]
]));
export function observation(residual, tolerance) {
  const stats = addResidual(emptyStats(tolerance), residual);
  return { verdict: stats.passed ? 'pass' : 'fail', stats };
}
export function createEvaluator({ natalChart, readState, terms }) {
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
      outcomes[`JPL.${body}.lon`] = observation(angularResidual(actual.lon, lon) * 3600, CHANNELS[`JPL.${body}.lon`]);
      outcomes[`JPL.${body}.lat`] = observation((actual.lat - lat) * 3600, CHANNELS[`JPL.${body}.lat`]);
    }
    outcomes['Swiss.positions'] = { verdict: 'unsupported' };
    outcomes['JPL.otherBodies'] = { verdict: 'unsupported' };
    outcomes['JPL.housesNodesAngles'] = { verdict: 'unsupported' };
    return outcomes;
  };
}
