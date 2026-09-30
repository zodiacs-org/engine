#!/usr/bin/env node
/*
 * Added at the review (RESULTS.md, Deviation 8): the barycentric Sun's bounds.
 *
 * - A daily scan of 1800 to 2200 (JD x.5): astronomy-engine's barycentric Sun
 *   (its barycentre is the Sun and the four giant planets, each weighted
 *   m / (m + M☉)) against the full Newtonian barycentre of astronomy-engine's
 *   own heliocentric states of the eight planet systems and Pluto, with
 *   DE440's masses.
 * - Both against Horizons (DE441) at the corpus instants, the review's instant
 *   (2130-03-05T00:00 UT) and the scan's worst days (../horizons/bary-NONE-10*.txt).
 * - calc()'s bounds for the barycentric Sun at those instants, against the
 *   differences from Horizons.
 *
 *   npm run build
 *   node docs/evidence/calc-api/tools/barycentre.mjs    # writes ../results/barycentre.json
 *
 * ZODIACS_ENGINE_DIST names another build directory, and CALC_API_RESULTS
 * another results directory, for a rerun on a later build.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AstroTime, BaryState, Body, HelioState } from "astronomy-engine";

const dist = process.env.ZODIACS_ENGINE_DIST
  ? pathToFileURL(`${resolve(process.env.ZODIACS_ENGINE_DIST)}/`)
  : new URL("../../../../dist/", import.meta.url);
const { calc } = await import(new URL("calc.js", dist).href);

const J2000 = 2451545;
const ARCSEC = 180 * 3600 / Math.PI;
// GM(Sun) / GM(body), DE440 (Park et al. 2021), as diagnostics.py: system masses, the Earth–Moon barycentre.
const SUN_OVER = { Mercury: 6023657.33, Venus: 408523.72, EMB: 328900.56, Mars: 3098703.59, Jupiter: 1047.348644,
  Saturn: 3497.901768, Uranus: 22902.98161, Neptune: 19412.25977, Pluto: 136045556.0 };
const MASS = Object.entries(SUN_OVER).map(([name, ratio]) => [Body[name], 1 / ratio]);
const TOTAL = 1 + MASS.reduce((sum, [, m]) => sum + m, 0);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(...a);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const angle = (a, b) => Math.atan2(norm(cross(a, b)), dot(a, b)) * ARCSEC;
/** The rate of the direction r / |r|, a vector, radians a day. */
function directionRate(r, v) {
  const d = norm(r);
  const along = dot(r, v) / (d * d);
  return [(v[0] - along * r[0]) / d, (v[1] - along * r[1]) / d, (v[2] - along * r[2]) / d];
}
/** The longitude rate times the cosine of the latitude, and the latitude rate, as compare.py compares them. */
function lonLatRates([x, y, z], [vx, vy, vz]) {
  const plane = x * x + y * y;
  const square = plane + z * z;
  return [((x * vy - y * vx) / plane) * Math.sqrt(plane / square), (vz * plane - z * (x * vx + y * vy)) / (square * Math.sqrt(plane))];
}

function engine(time) {
  const s = BaryState(Body.Sun, time);
  return { r: [s.x, s.y, s.z], v: [s.vx, s.vy, s.vz] };
}
function reference(time) {
  const r = [0, 0, 0];
  const v = [0, 0, 0];
  for (const [body, m] of MASS) {
    const s = HelioState(body, time);
    r[0] -= (m * s.x) / TOTAL; r[1] -= (m * s.y) / TOTAL; r[2] -= (m * s.z) / TOTAL;
    v[0] -= (m * s.vx) / TOTAL; v[1] -= (m * s.vy) / TOTAL; v[2] -= (m * s.vz) / TOTAL;
  }
  return { r, v };
}

// The daily scan.
const worst = { position: { au: 0 }, velocity: { auPerDay: 0 }, closest: { au: Infinity }, angle: { arcsec: 0 } };
let days = 0;
for (let jd = 2378496.5; jd < 2524593.5; jd += 1) {
  const time = new AstroTime(jd - J2000);
  const e = engine(time);
  const f = reference(time);
  const au = norm(sub(e.r, f.r));
  const auPerDay = norm(sub(e.v, f.v));
  const distance = norm(e.r);
  const arcsec = angle(e.r, f.r);
  days += 1;
  if (au > worst.position.au) worst.position = { au, jd, distanceAu: distance };
  if (auPerDay > worst.velocity.auPerDay) worst.velocity = { auPerDay, jd };
  if (distance < worst.closest.au) worst.closest = { au: distance, jd, directionArcsec: arcsec };
  if (arcsec > worst.angle.arcsec) worst.angle = { arcsec, jd, distanceAu: distance };
}

// Against Horizons.
function horizons(name) {
  const text = readFileSync(new URL(`../horizons/${name}`, import.meta.url), "utf8");
  return text.split("$$SOE")[1].split("$$EOE")[0].trim().split("\n").map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return { jd: Number(cells[0]), r: cells.slice(2, 5).map(Number), v: cells.slice(5, 8).map(Number) };
  });
}
const checks = [
  ...horizons("bary-NONE-10-2130.txt").map((row) => ({ ...row, time: "2130-03-05T00:00:00Z", scale: "UT" })),
  ...horizons("bary-NONE-10.txt").map((row) => ({ ...row, time: { jd: row.jd, scale: "TT" }, scale: "TT" })),
  ...horizons("bary-NONE-10-scan.txt").map((row) => ({ ...row, time: { jd: row.jd, scale: "TT" }, scale: "TT" }))
];
const against = { referenceAu: 0, referenceAuPerDay: 0, engineAu: { au: 0 }, engineAuPerDay: { auPerDay: 0 } };
const shares = { position: { share: 0 }, distance: { share: 0 }, speed: { share: 0 }, speedLonLat: { share: 0 } };
let review = null;
for (const check of checks) {
  const result = calc({ body: "Sun", time: check.time, center: "barycentric", frame: "equatorial-icrs", flags: { correction: "geometric", cartesian: true } });
  if (result.status !== "ok") throw new Error(`refused: ${check.jd}`);
  const at = result.receipt.instants[0];
  // The instant's UT1 as a Julian date: `jdUt1` from 0.1.1-rc.16's time vocabulary.
  const time = new AstroTime((at.jdUt ?? at.jdUt1) - J2000);
  const f = reference(time);
  const r = [result.cartesian.x, result.cartesian.y, result.cartesian.z];
  const v = [result.cartesian.vx, result.cartesian.vy, result.cartesian.vz];
  against.referenceAu = Math.max(against.referenceAu, norm(sub(f.r, check.r)));
  against.referenceAuPerDay = Math.max(against.referenceAuPerDay, norm(sub(f.v, check.v)));
  const au = norm(sub(r, check.r));
  const auPerDay = norm(sub(v, check.v));
  if (au > against.engineAu.au) against.engineAu = { au, jd: check.jd, scale: check.scale };
  if (auPerDay > against.engineAuPerDay.auPerDay) against.engineAuPerDay = { auPerDay, jd: check.jd, scale: check.scale };
  const [a, b] = [lonLatRates(r, v), lonLatRates(check.r, check.v)];
  const measured = {
    position: angle(r, check.r),
    distance: Math.abs(result.dist - norm(check.r)) / norm(check.r),
    speed: norm(sub(directionRate(r, v), directionRate(check.r, check.v))) * ARCSEC,
    speedLonLat: Math.hypot(a[0] - b[0], a[1] - b[1]) * ARCSEC
  };
  const bounds = { position: result.bounds.position.value, distance: result.bounds.distance.value, speed: result.bounds.speed.value, speedLonLat: result.bounds.speed.value };
  for (const key of Object.keys(shares)) {
    const share = measured[key] / bounds[key];
    if (share > shares[key].share) shares[key] = { share, measured: measured[key], bound: bounds[key], jd: check.jd, scale: check.scale };
  }
  if (check.scale === "UT") review = { jdUt: check.jd, distanceAu: result.dist, ...measured, bounds, basis: result.bounds.position.basis };
}

const out = {
  note: "added at the review; not a preregistered comparison",
  scan: { days, from: "JD 2378496.5", to: "JD 2524592.5", engineMinusReference: worst },
  horizons: { instants: checks.length, maxReferenceMinusHorizons: { au: against.referenceAu, auPerDay: against.referenceAuPerDay },
    maxEngineMinusHorizons: { position: against.engineAu, velocity: against.engineAuPerDay } },
  largestShareOfCalcBound: shares,
  review2130: review
};
const target = process.env.CALC_API_RESULTS
  ? join(resolve(process.env.CALC_API_RESULTS), "barycentre.json")
  : new URL("../results/barycentre.json", import.meta.url);
writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out, null, 1));
