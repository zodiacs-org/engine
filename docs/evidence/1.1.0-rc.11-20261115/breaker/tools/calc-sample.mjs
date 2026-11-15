// Breaker, item 1: calc() apparent geocentric places and rates in all eight frames from the installed
// package, at N pseudo-random TT instants from 1800 to 2200, written for calc_check.py to compare with
// NAIF's de440.bsp. Also: calc()'s rates against central differences of calc()'s own positions, and
// calc() in its default frame against positions() at Date instants.
//   node calc-sample.mjs <N> <out.json>      (run from the directory the package is installed in)
import { writeFileSync } from "node:fs";
import { calc, CALC_FRAMES } from "@zodiacs/engine/calc";
import { positions, defaultEphemeris } from "@zodiacs/engine";
const N = Number(process.argv[2]);
const out = process.argv[3];
let s = 20261115;
const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const JD0 = 2378497.5, JD1 = 2524592.5; // 1800-01-01.5 to 2199-12-30.5 TT
const jds = Array.from({ length: N }, () => Math.round((JD0 + rnd() * (JD1 - JD0)) * 1e5) / 1e5);
const rows = [];
const names = new Set(); let flagged = 0;
const fd = {}; // largest |engine rate - central difference of engine positions|, arcsec/day
const H = 0.01;
const ang = (a) => ((a + 540) % 360) - 180;
for (const jd of jds) {
  for (const body of BODIES) {
    for (const frame of CALC_FRAMES) {
      const q = (t) => calc({ body, time: { jd: t, scale: "tt" }, frame, center: "geocentric", flags: { correction: "apparent" } });
      const r = q(jd);
      if (r.status !== "ok") throw new Error(`${body} ${frame} ${jd}: ${r.reason}`);
      names.add(r.receipt.engine.ephemeris.name); if (r.flags.length) flagged++;
      rows.push([jd, body, frame, r.lon, r.lat, r.dist, r.speeds.lon, r.speeds.lat, r.speeds.dist]);
      const a = q(jd - H), b = q(jd + H);
      const dl = Math.abs(r.speeds.lon - ang(b.lon - a.lon) / (2 * H)) * 3600;
      const db = Math.abs(r.speeds.lat - (b.lat - a.lat) / (2 * H)) * 3600;
      const k = `${body}`; fd[k] ??= { lon: 0, lat: 0 };
      if (dl > fd[k].lon) fd[k].lon = dl; if (db > fd[k].lat) fd[k].lat = db;
    }
  }
}
// calc() default frame against positions() at Date instants
let worst = { lon: 0, lat: 0, speed: 0 }, equal = 0, total = 0;
for (let i = 0; i < Math.min(N, 500); i++) {
  const date = new Date(Date.UTC(1800, 0, 2) + Math.floor(rnd() * (Date.UTC(2199, 11, 29) - Date.UTC(1800, 0, 2))));
  const p = positions(date);
  for (const body of BODIES) {
    const r = calc({ body, time: date });
    const pb = p.find((x) => x.body === body);
    total++;
    if (r.lon === pb.lon && r.lat === pb.lat && r.speeds.lon === pb.speed) equal++;
    worst.lon = Math.max(worst.lon, Math.abs(ang(r.lon - pb.lon)) * 3600);
    worst.lat = Math.max(worst.lat, Math.abs(r.lat - pb.lat) * 3600);
    worst.speed = Math.max(worst.speed, Math.abs(r.speeds.lon - pb.speed) * 3600);
    names.add(pb.ephemeris);
  }
}
writeFileSync(out, JSON.stringify({ n: N, frames: CALC_FRAMES, bodies: BODIES, ephemerisNames: [...names], flagged, defaultEphemeris: defaultEphemeris(), rateVsOwnCentralDifference: { stepDays: H, arcsecPerDay: fd }, calcVsPositions: { total, equalToTheBit: equal, worstArcsec: worst }, rows }));
console.log(JSON.stringify({ n: N, names: [...names], flagged, fd, calcVsPositions: { total, equal, worst } }, null, 1));
