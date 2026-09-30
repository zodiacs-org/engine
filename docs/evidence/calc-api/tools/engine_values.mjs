#!/usr/bin/env node
/*
 * The engine's side of the comparison in PREREGISTRATION.md: calc() from the
 * built dist/calc.js for every corpus case in all eight frames, written as
 * JSON to standard output. The ΔT pins for the topocentric cases come from
 * Horizons's TDB − UT (../horizons/deltat.txt). It also writes
 * engine-internal measurements that use no arbiter: the Richardson estimate of
 * the central difference's error, and the light-time term the engine's
 * geocentric Moon leaves out; and, added at the review (RESULTS.md,
 * Deviations 7 and 9), the topocentric astrometric cases, the Richardson
 * estimate for astrometric positions, Pluto's analytic speed against the
 * derivative of its position, and what UT1 − UTC does to the pinned
 * topocentric positions.
 *
 *   npm run build
 *   node docs/evidence/calc-api/tools/engine_values.mjs > engine.json
 *
 * A rerun on a later build: ZODIACS_ENGINE_DIST names the build directory in
 * place of the repository's dist/, and ENGINE_TILT_MODULE a module whose
 * tilt(tt) gives that engine's own nutation and obliquities (from 0.1.1-rc.16,
 * src/nutation.ts bundled; before, the engine's were astronomy-engine's
 * e_tilt, the default).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AstroTime, SetDeltaTFunction, e_tilt } from "astronomy-engine";

const dist = process.env.ZODIACS_ENGINE_DIST
  ? pathToFileURL(`${resolve(process.env.ZODIACS_ENGINE_DIST)}/`)
  : new URL("../../../../dist/", import.meta.url);
const { calc, CALC_FRAMES } = await import(new URL("calc.js", dist).href);
const { deltaT } = await import(new URL("deltat.js", dist).href);

const J2000 = 2451545;
const C_AU_PER_DAY = 173.1446326846693;
const phi = (Math.sqrt(5) - 1) / 2;
const round6 = (x) => Math.round(x * 1e6) / 1e6;
const instants = Array.from({ length: 32 }, (_, k) => round6(2378496.5 + 146097 * ((0.5 + k * phi) % 1)));

// Horizons's TDB − UT at each instant, seconds, for the topocentric pins. Its
// rows come in date order, each with its TT calendar date.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const horizonsDeltaT = (() => {
  const text = readFileSync(new URL("../horizons/deltat.txt", import.meta.url), "utf8");
  const byDay = new Map();
  for (const row of text.split("$$SOE")[1].split("$$EOE")[0].trim().split("\n")) {
    const cells = row.split(",").map((cell) => cell.trim()).filter(Boolean);
    const [, y, mon, d, h, mi, sec] = /^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}\.\d{3})$/.exec(cells[0]);
    const ms = Date.UTC(Number(y), MONTHS.indexOf(mon), Number(d), Number(h), Number(mi)) + Number(sec) * 1000;
    byDay.set(round6(2440587.5 + ms / 86_400_000), Number(cells.at(-1)));
  }
  const values = instants.map((jd) => byDay.get(jd));
  if (values.some((v) => !Number.isFinite(v))) throw new Error("deltat.txt does not cover the corpus");
  return values;
})();

const PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const SITES = {
  topo1: { latitude: 45, longitude: 10, height: 0 },
  topo2: { latitude: -35, longitude: -60, height: 1500 }
};
const PLAN = [
  ["geo", ["Sun", "Moon", ...PLANETS], ["geometric", "astrometric", "apparent"]],
  ["helio", ["Moon", "Earth", ...PLANETS], ["geometric", "astrometric", "apparent"]],
  ["bary", ["Sun", "Moon", "Earth", ...PLANETS], ["geometric", "astrometric", "apparent"]],
  ["topo1", ["Sun", "Moon", "Mars"], ["geometric", "apparent", "astrometric"]],
  ["topo2", ["Sun", "Moon", "Mars"], ["geometric", "apparent", "astrometric"]]
];
const CENTER = { geo: "geocentric", helio: "heliocentric", bary: "barycentric" };
const POINTS = ["North Node", "South Node", "Mean Node", "Mean South Node", "Black Moon Lilith"];

function run(request) {
  const result = calc(request);
  if (result.status !== "ok") throw new Error(`refused: ${JSON.stringify(request)} ${result.reason}`);
  return result;
}

function row(result) {
  const [instant] = result.receipt.instants;
  return {
    lon: result.lon,
    lat: result.lat,
    dist: result.dist,
    speeds: result.speeds,
    xyz: result.cartesian && [result.cartesian.x, result.cartesian.y, result.cartesian.z],
    vxyz: result.cartesian && [result.cartesian.vx, result.cartesian.vy, result.cartesian.vz],
    method: result.bounds.speed?.method ?? null,
    // The instant's UT1 as a Julian date: `jdUt1` from 0.1.1-rc.16's time vocabulary.
    jdUt: instant.jdUt ?? instant.jdUt1,
    jdTt: instant.jdTt
  };
}

const cases = [];
for (const [center, bodies, corrections] of PLAN) {
  for (const correction of corrections) {
    for (const body of bodies) {
      const frames = {};
      for (const frame of CALC_FRAMES) {
        frames[frame] = instants.map((jd, k) => {
          const topocentric = SITES[center];
          const time = topocentric ? { jd, scale: "TT", deltaT: horizonsDeltaT[k] } : { jd, scale: "TT" };
          return row(run({ body, time, frame, center: topocentric ? { topocentric } : CENTER[center], flags: { correction, cartesian: true } }));
        });
      }
      cases.push({ center, correction, body, frames });
    }
  }
}
for (const body of POINTS) {
  const frames = {};
  for (const frame of CALC_FRAMES) frames[frame] = instants.map((jd) => row(run({ body, time: { jd, scale: "TT" }, frame })));
  cases.push({ center: "geo", correction: "apparent", body, frames });
}

// The engine's own obliquities and nutation at each instant (C5b), on its own clock.
SetDeltaTFunction(deltaT);
const engineTilt = process.env.ENGINE_TILT_MODULE
  ? (await import(pathToFileURL(resolve(process.env.ENGINE_TILT_MODULE)).href)).tilt
  : null;
const tilts = instants.map((jd) => {
  const tilt = engineTilt ? { tt: jd - J2000, ...engineTilt(jd - J2000) } : e_tilt(AstroTime.FromTerrestrialTime(jd - J2000));
  return { tt: tilt.tt, mobl: tilt.mobl, tobl: tilt.tobl, dpsi: tilt.dpsi, deps: tilt.deps };
});

// Richardson: the central difference with h = 0.001 day against the one with 2h,
// at ISO instants so that both are built from whole milliseconds.
const richardson = [];
for (const [center, correction, bodies] of [
  ["geo", "apparent", ["Sun", "Moon", ...PLANETS]],
  ["topo1", "apparent", ["Sun", "Moon", "Mars"]],
  ["geo", "astrometric", ["Sun", "Moon", ...PLANETS]]
]) {
  for (const body of bodies) {
    const worst = { lon: 0, lat: 0 };
    for (const [k, jd] of instants.entries()) {
      const first = run({ body, time: { jd, scale: "TT" } });
      const ms = Math.round(Date.parse(first.receipt.instants[0].utc));
      const site = SITES[center];
      const at = (offsetMs) => run({
        body,
        time: new Date(ms + offsetMs),
        ...(site ? { center: { topocentric: site } } : {}),
        flags: { correction }
      });
      const now = at(0);
      // 2h = 0.002 day = 172,800 ms.
      const before = at(-172_800);
      const after = at(172_800);
      let turn = after.lon - before.lon;
      if (turn > 180) turn -= 360;
      if (turn < -180) turn += 360;
      const lon = Math.abs(turn / 0.004 - now.speeds.lon) / 3;
      const lat = Math.abs((after.lat - before.lat) / 0.004 - now.speeds.lat) / 3;
      worst.lon = Math.max(worst.lon, lon * Math.cos((now.lat * Math.PI) / 180) * 3600);
      worst.lat = Math.max(worst.lat, lat * 3600);
      void k;
    }
    richardson.push({ center, correction, body, maxLonRateCosLatArcsecPerDay: worst.lon, maxLatRateArcsecPerDay: worst.lat });
  }
}

// Pluto's analytic speed (from astronomy-engine's integrator) against the derivative of its
// geometric position on fixed axes, a fourth-order central difference with h = 0.01 day.
const wrap = (x) => ((x + 540) % 360) - 180;
const plutoAnalytic = { maxArcsecPerDay: 0 };
for (const center of ["geocentric", "heliocentric", "barycentric"]) {
  for (const frame of ["ecliptic-j2000", "ecliptic-icrs", "equatorial-j2000", "equatorial-icrs"]) {
    for (const jd of instants) {
      const at = (days) => run({ body: "Pluto", time: { jd: jd + days, scale: "TT" }, center, frame, flags: { correction: "geometric" } });
      const now = at(0);
      if (now.bounds.speed.method !== "analytic") throw new Error("Pluto's speed is not analytic");
      const [m2, m1, p1, p2] = [at(-0.02), at(-0.01), at(0.01), at(0.02)];
      const lon = (8 * wrap(p1.lon - m1.lon) - wrap(p2.lon - m2.lon)) / 0.12;
      const lat = (8 * (p1.lat - m1.lat) - (p2.lat - m2.lat)) / 0.12;
      const difference = Math.hypot((now.speeds.lon - lon) * Math.cos((now.lat * Math.PI) / 180), now.speeds.lat - lat) * 3600;
      if (difference > plutoAnalytic.maxArcsecPerDay) Object.assign(plutoAnalytic, { maxArcsecPerDay: difference, center, frame, jdTt: jd });
    }
  }
}

// The topocentric pins are Horizons's TDB − UT, which from 1962 is TDB − UTC, so the engine turns
// the Earth by UTC where Horizons turns it by UT1. The positions again with UT1 − UTC from IERS EOP 20
// C04 (hpiers.obspm.fr/iers/eop/eopc04/eopc04.1962-now, at 0h UTC on the day and the next, linearly
// interpolated) at the five instants from 1962 to 2026, and with 0.1 s at the later ones, where
// Horizons holds its last prediction.
const UT1_MINUS_UTC = {
  2440292.5: [0.0249317, 0.0248188],
  2443402.5: [-0.0176849, -0.020815],
  2448434.5: [0.2304087, 0.2295876],
  2451544.5: [0.3554724, 0.3546007],
  2456576.5: [0.0003764, -0.0007731]
};
const ut1Shift = { withEop: { maxArcsec: 0 }, after2026: { maxArcsec: 0 } };
for (const [k, jd] of instants.entries()) {
  const utc = jd - horizonsDeltaT[k] / 86_400;
  const day = Math.floor(utc - 0.5) + 0.5;
  const eop = UT1_MINUS_UTC[day];
  if (!eop && jd < 2461400.5) continue;
  const dut1 = eop ? eop[0] + (utc - day) * (eop[1] - eop[0]) : 0.1;
  const slot = eop ? ut1Shift.withEop : ut1Shift.after2026;
  for (const topocentric of Object.values(SITES)) {
    for (const body of ["Sun", "Moon", "Mars"]) {
      for (const correction of ["geometric", "astrometric", "apparent"]) {
        const request = (pin) => ({ body, time: { jd, scale: "TT", deltaT: pin }, frame: "equatorial-icrs", center: { topocentric }, flags: { correction, cartesian: true } });
        const a = run(request(horizonsDeltaT[k]));
        const b = run(request(horizonsDeltaT[k] - dut1));
        const u = [a.cartesian.x, a.cartesian.y, a.cartesian.z];
        const v = [b.cartesian.x, b.cartesian.y, b.cartesian.z];
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const arcsec = (Math.atan2(Math.hypot(...cross), u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) * 180 * 3600) / Math.PI;
        if (arcsec > slot.maxArcsec) Object.assign(slot, { maxArcsec: arcsec, body, correction, site: topocentric, jdTt: jd, ut1MinusUtc: dut1 });
      }
    }
  }
}

// The light-time term of the engine's geocentric Moon: the series at t against the series at t − τ.
const moonLightTime = instants.map((jd) => {
  const now = run({ body: "Moon", time: { jd, scale: "TT" }, frame: "equatorial-j2000", flags: { correction: "geometric", cartesian: true } });
  const tau = now.dist / C_AU_PER_DAY;
  const then = run({ body: "Moon", time: { jd: jd - tau, scale: "TT" }, frame: "equatorial-j2000", flags: { correction: "geometric", cartesian: true } });
  const a = [now.cartesian.x, now.cartesian.y, now.cartesian.z];
  const b = [then.cartesian.x, then.cartesian.y, then.cartesian.z];
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return (Math.atan2(Math.hypot(...cross), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * 180 * 3600) / Math.PI;
});

process.stdout.write(JSON.stringify({ engine: run({ body: "Sun", time: "2000-01-01" }).receipt.engine, instants, horizonsDeltaT, tilts, cases, richardson, moonLightTime, plutoAnalytic, ut1Shift }));
