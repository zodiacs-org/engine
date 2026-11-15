#!/usr/bin/env node
/*
 * The breaker's instant for should-fix S1, measured again on this build:
 * Neptune at 1920-08-03T23:48:31Z, behind the Sun. The default natalChart()
 * (the shipped DE440 pack, whose reduction bends light by the Sun with no
 * cut at its limb) against the same call after
 * setDefaultEphemeris("astronomy-engine") (which does not bend it), and
 * Neptune's angular distance from the Sun's centre in the pack's apparent
 * places. Also noon UTC on the 3rd and the 4th, either side.
 *
 *   node near-sun.mjs <the package's dist directory or an installed package's>
 *
 * A difference of two of this engine's own sources: it says how far the
 * default moved, not how accurate either is.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dist = resolve(process.argv[2] ?? new URL("../../../../dist/", import.meta.url).pathname);
const root = await import(pathToFileURL(`${dist}/index.js`).href);
const AS = 3600;
const RAD = Math.PI / 180;
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const unit = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const separation = (a, b) => {
  const [p, q] = [unit(a.lon, a.lat), unit(b.lon, b.lat)];
  const c = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  return Math.atan2(Math.hypot(...c), p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / RAD;
};
const body = (chart, name) => chart.bodies.find((row) => row.body === name);

const instants = ["1920-08-03T12:00:00Z", "1920-08-03T23:48:31Z", "1920-08-04T12:00:00Z"];
const rows = [];
for (const utc of instants) {
  root.setDefaultEphemeris("de440");
  const pack = root.natalChart({ utc, timeKnown: false });
  root.setDefaultEphemeris("astronomy-engine");
  const other = root.natalChart({ utc, timeKnown: false });
  const [n, m, sun] = [body(pack, "Neptune"), body(other, "Neptune"), body(pack, "Sun")];
  rows.push({
    utc,
    defaultEphemeris: pack.ephemeris,
    defaultFlags: pack.flags,
    otherEphemeris: other.ephemeris,
    neptuneLonDifferenceArcsec: Number((wrap(n.lon - m.lon) * AS).toFixed(4)),
    neptuneLatDifferenceArcsec: Number(((n.lat - m.lat) * AS).toFixed(4)),
    neptuneAngleArcsec: Number((separation(n, m) * AS).toFixed(4)),
    neptuneFromSunCentreDegrees: Number(separation(n, sun).toFixed(5))
  });
}
console.log(JSON.stringify({ engine: root.ENGINE_VERSION, node: process.version, dist, rows }, null, 1));
