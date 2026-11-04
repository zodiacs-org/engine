// C4a's floor for distances (../PREREGISTRATION.md, section 10, "2026-11-03,
// review 1"), derived from how a distance is computed rather than from any
// run: a bound on the rounding that two evaluations of a distance a few
// seconds apart can differ by beyond their first-order response. It reads
// astronomy-engine's own source (the version the package pins) and runs
// nothing of the engine.
//
//   node distance-floor.mjs --package <root> --out <distance-floor.json>
//
// With u = 2⁻⁵³ (half a unit in the last place), from 1800 to 2200 (|t| at
// most 0.2 millennium, |tt| at most 73,051 days from J2000.0):
// - each VSOP87 term A cos(φ + ν t) carries at most u |A| (3 + |φ| + 2 |ν t|)
//   (the product ν t, the sum with φ, the cosine to one unit, the product
//   with A); each series' sum of n terms at most (n − 1) u S more, S the sum
//   of |A|; t^s times it (s + 1) u more of t^s S; and each coordinate's own
//   sums u times its size (VsopFormula: the longitude's increments reduced
//   modulo 2π, which is exact);
// - a heliocentric position then carries r (εL + εB) + εR, and 12 u r of its
//   turns into rectangular axes (VsopSphereToRect, VsopRotate);
// - the instant itself is rounded: tt to half a unit in the last place of
//   73,051 days, and t = tt / 365,250 to u of itself, so a body at speed v
//   moves v (ulp(73,051) / 2 + 0.2 × 365,250 u) days' worth; the light-time
//   instant once more;
// - a geocentric distance adds the body's and the Earth's errors and 4 u of
//   the two radii (the difference and the hypotenuse);
// - the light-time solution (CorrectLightTravel) returns when two successive
//   light times agree to 1e-9 day. With k = v / c the iteration contracts by
//   k at most, so it returns after one correction, with the light time off by
//   k τ, or after two, off by k² τ (τ the light time); since k² τ < 1e-9 day
//   for every body here, it never needs three. It switches between one and two
//   only where k τ is about 1e-9 day, and the distance then jumps by at most
//   k c × 1e-9 day = c (1e-9 day)² / τ = c² (1e-9 day)² / r;
// - Pluto's position comes from astronomy-engine's integrator, a cached
//   segment and one step to the instant: its roundings are those of a few
//   dozen operations at up to 50 au, counted here as 64 u × 50 au.
// The speeds and radii are the bodies' greatest from 1800 to 2200 (heliocentric
// speed and radius, nearest geocentric distance), from astronomy-engine's own
// HelioState sampled every day.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { finish, manifest, options } from "./load.mjs";

const args = options();
if (!args.package) throw new Error("usage: node distance-floor.mjs --package <root> --out <file>");
const root = resolve(args.package);
const require = createRequire(join(root, "package.json"));
const enginePath = require.resolve("astronomy-engine");
const ae = require("astronomy-engine");
const source = readFileSync(enginePath, "utf8");

// The VSOP87 tables astronomy-engine evaluates, read from its source as data: `const vsop = { ... };`.
const start = source.indexOf("const vsop = {");
if (start < 0) throw new Error("astronomy-engine's vsop table not found");
let depth = 0;
let end = -1;
for (let i = source.indexOf("{", start); i < source.length; i += 1) {
  if (source[i] === "{") depth += 1;
  else if (source[i] === "}" && --depth === 0) {
    end = i;
    break;
  }
}
const vsop = JSON.parse(source.slice(source.indexOf("{", start), end + 1).replace(/([A-Za-z]+):/gu, '"$1":').replace(/,(\s*[\]}])/gu, "$1"));

const u = 2 ** -53;
const T = 0.2; // millennia from J2000.0, 1800 to 2200
const TT_DAYS = 73_051;
const ulp = (x) => 2 ** (Math.floor(Math.log2(Math.abs(x))) - 52);
const C = ae.C_AUDAY;

/** A first-order bound on the rounding of one coordinate's series at |t| ≤ T. */
function coordinate(formula, clamp) {
  let error = 0;
  let size = 0;
  formula.forEach((series, s) => {
    const S = series.reduce((sum, [A]) => sum + Math.abs(A), 0);
    const terms = series.reduce((sum, [A, phase, freq]) => sum + u * Math.abs(A) * (3 + Math.abs(phase) + 2 * Math.abs(freq * T)), 0);
    const tp = T ** s;
    error += tp * (Math.max(series.length - 1, 0) * u * S + terms) + (s + 1) * u * tp * S;
    size += clamp ? 2 * Math.PI : tp * S;
  });
  return error + formula.length * u * size;
}

// The bodies' greatest heliocentric speed and radius, and nearest geocentric distance, sampled daily.
const BODIES = ["Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const motion = {};
for (const name of BODIES) motion[name] = { speed: 0, radius: 0, nearest: Infinity };
for (let day = -73_050; day <= 73_050; day += 1) {
  const time = ae.MakeTime(day);
  const earth = ae.HelioState(ae.Body.Earth, time);
  for (const name of BODIES) {
    const s = name === "Earth" ? earth : ae.HelioState(ae.Body[name], time);
    const m = motion[name];
    m.speed = Math.max(m.speed, Math.hypot(s.vx, s.vy, s.vz));
    m.radius = Math.max(m.radius, Math.hypot(s.x, s.y, s.z));
    if (name !== "Earth") m.nearest = Math.min(m.nearest, Math.hypot(s.x - earth.x, s.y - earth.y, s.z - earth.z));
  }
}

const timeRounding = ulp(TT_DAYS) / 2 + T * 365_250 * u; // days, per rounded instant
const helio = {};
for (const name of BODIES) {
  const r = motion[name].radius;
  let position;
  if (name === "Pluto") position = 64 * u * 50;
  else {
    const [L, B, R] = vsop[name];
    position = r * (coordinate(L, true) + coordinate(B, false)) + coordinate(R, false) + 12 * u * r;
  }
  // The instant and, for a body seen by light, its light-time instant: two rounded instants.
  helio[name] = { radius: r, speed: motion[name].speed, series: position, instant: 2 * motion[name].speed * timeRounding };
}
const rows = {};
let largest = 0;
for (const name of BODIES.filter((n) => n !== "Earth")) {
  const b = helio[name];
  const e = helio.Earth;
  const tau = motion[name].nearest / C;
  const k = b.speed / C;
  const rounding = b.series + b.instant + e.series + e.instant + 4 * u * (b.radius + e.radius);
  const lightTime = (C * C * 1e-18) / motion[name].nearest;
  const total = rounding + lightTime;
  largest = Math.max(largest, total);
  rows[name] = {
    heliocentricSpeedAuPerDay: b.speed,
    heliocentricRadiusAu: b.radius,
    nearestGeocentricAu: motion[name].nearest,
    kSquaredTauDays: k * k * (b.radius + e.radius) / C,
    seriesAu: b.series,
    instantAu: b.instant,
    earthAu: e.series + e.instant,
    lightTimeJumpAu: lightTime,
    perEvaluationAu: total
  };
}
// The Sun, from the Earth alone (its light time is exact: the Sun's heliocentric vector does not move). The
// Moon (astronomy-engine's lunar series at the instant, no light time) is not derived term by term: its
// distance is at most 0.0028 au, so 1,000 roundings of u at that size are 3e-16 au, and the instant's rounding
// moves it by its greatest geocentric speed, sampled every day, times timeRoundingDays; both are far under
// the rows above.
rows.Sun = { perEvaluationAu: helio.Earth.series + helio.Earth.instant + 4 * u * helio.Earth.radius };
let moonSpeed = 0;
let moonDistance = 0;
for (let day = -73_050; day <= 73_050; day += 1) {
  const s = ae.GeoMoonState(ae.MakeTime(day));
  moonSpeed = Math.max(moonSpeed, Math.hypot(s.vx, s.vy, s.vz));
  moonDistance = Math.max(moonDistance, Math.hypot(s.x, s.y, s.z));
}
rows.Moon = { geocentricSpeedAuPerDay: moonSpeed, geocentricRadiusAu: moonDistance, perEvaluationAu: 1000 * u * moonDistance + moonSpeed * timeRounding };
// The floor: the largest bound rounded up to one significant figure.
const scale = 10 ** Math.floor(Math.log10(largest));
const floor = Math.ceil(largest / scale) * scale;
const package_ = manifest(args.package);
finish({
  check: "C4a's distance floor (a derivation; not a check)",
  pass: Object.values(rows).every((row) => !("kSquaredTauDays" in row) || row.kSquaredTauDays < 1e-9),
  records: Object.keys(rows).length,
  engine: { name: package_.name, version: package_.version },
  ephemeris: { name: "astronomy-engine", version: JSON.parse(readFileSync(join(enginePath, "..", "package.json"), "utf8")).version },
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  units: "au; per evaluation of a distance from 1800 to 2200",
  timeRoundingDays: timeRounding,
  largestPerEvaluationAu: largest,
  floorAu: Number(floor.toPrecision(1)),
  floor: `F = ${Number(floor.toPrecision(1))} au × (1 + σTT / 86.4 s): the largest per-evaluation bound, rounded up to one significant figure, for the half difference of two evaluations, plus the same carried into the band through the speed's two samples 0.002 day apart (σTT × 2 ε / 0.002 day)`,
  bodies: rows
}, args.out);
