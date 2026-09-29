// The evidence for planetaryReturns' default steps (RETURN_STEP_DAYS): on the
// engine's own longitudes, which the search reads, from 1800 to 2200 at a
// quarter-day step, the shortest time between two consecutive stations of
// each planet and the fastest motion of every body, against its step: two
// steps must be shorter than the shortest interval between stations, and one
// step must move a body well under 90 degrees. Run after `npm run build`:
//   node docs/evidence/houses-extra-2026-09-29/tools/stations.mjs > docs/evidence/houses-extra-2026-09-29/results/stations.json
import { bodyLongitude } from "../../../../dist/internal.js";
import { RETURN_BODIES, RETURN_STEP_DAYS } from "../../../../dist/timing.js";

const DAY = 86_400_000;
const STEP = 0.25;
const from = Date.UTC(1800, 0, 1);
const to = Date.UTC(2200, 0, 1);
const seam = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const out = { from: "1800-01-01", to: "2200-01-01", stepDays: STEP, bodies: {} };
for (const body of RETURN_BODIES) {
  let previous = bodyLongitude(body, new Date(from));
  let previousMotion = null;
  let lastStation = null;
  let shortest = Infinity;
  let fastest = 0;
  let stations = 0;
  for (let time = from + STEP * DAY; time <= to; time += STEP * DAY) {
    const lon = bodyLongitude(body, new Date(time));
    const motion = seam(lon - previous);
    fastest = Math.max(fastest, Math.abs(motion) / STEP);
    if (previousMotion !== null && Math.sign(motion) !== Math.sign(previousMotion)) {
      stations += 1;
      if (lastStation !== null) shortest = Math.min(shortest, (time - lastStation) / DAY);
      lastStation = time;
    }
    previousMotion = motion;
    previous = lon;
  }
  const step = RETURN_STEP_DAYS[body];
  out.bodies[body] = {
    stepDays: step,
    stations,
    shortestDaysBetweenStations: stations > 1 ? shortest : null,
    fastestDegreesPerDay: Number(fastest.toFixed(3)),
    degreesInOneStepAtMost: Number((fastest * step).toFixed(2)),
    twoStepsShorterThanShortestInterval: stations > 1 ? 2 * step < shortest - STEP : true
  };
}
console.log(JSON.stringify(out, null, 1));
