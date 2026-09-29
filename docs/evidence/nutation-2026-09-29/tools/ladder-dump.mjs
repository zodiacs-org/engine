/*
 * The house-system ladder of the Zodiacs site's rc.9 record
 * (docs/platform/evidence/houses-2026-09-26/tools/dump-end-to-end.mjs in
 * zodiacs-org/site, commit 5df5567d), end to end, for rc.15 as carried and for
 * this tree's build. The cases are that tool's, from the same generator and
 * seed: 55°–66.6° every 0.2°, six instants each, both hemispheres, and 3,000
 * draws within 66° of the equator, 1800–2199. Two changes: every one of the
 * thirteen systems (rc.9 had twelve; "equal-mc" came in rc.10), and the
 * instant is read as UT1 (`timeScale: "ut1"`), as Swiss reads its jd_ut and
 * as rc.9 read every instant; from rc.15 a UTC instant from 1972 is read as
 * UTC, which would move the sidereal time by UT1 − UTC.
 *
 *   npm run build
 *   node docs/evidence/nutation-2026-09-29/tools/ladder-dump.mjs > "$WORK/ladder.json"
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { BUILD, unpackRc15 } from "./engines.mjs";

let seed = 1234567;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const start = Date.UTC(1800, 0, 1);
const end = Date.UTC(2199, 11, 31);
const instant = () => new Date(start + random() * (end - start)).toISOString();
const cases = [];
for (let tenth = 550; tenth <= 666; tenth += 2)
  for (const sign of [1, -1])
    for (let k = 0; k < 6; k += 1) cases.push({ set: "ladder", utc: instant(), lat: (sign * tenth) / 10, lon: -180 + random() * 360 });
for (let i = 0; i < 3000; i += 1) cases.push({ set: "broad", utc: instant(), lat: -66 + random() * 132, lon: -180 + random() * 360 });

const rc15 = unpackRc15();
try {
  const out = { cases, rc15: [], build: [] };
  for (const [name, dist] of [["rc15", rc15.dist], ["build", BUILD]]) {
    const { natalChart } = await import(pathToFileURL(join(dist, "index.js")).href);
    const { HOUSE_SYSTEMS } = await import(pathToFileURL(join(dist, "internal-math.js")).href);
    for (const c of cases) {
      const systems = {};
      for (const houseSystem of HOUSE_SYSTEMS) {
        const chart = natalChart({ utc: c.utc, timeScale: "ut1", latitude: c.lat, longitude: c.lon, houseSystem });
        systems[houseSystem] = chart.houses.system === houseSystem ? chart.houses.cusps : null;
      }
      out[name].push(systems);
    }
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
} finally {
  rc15.cleanup();
}
