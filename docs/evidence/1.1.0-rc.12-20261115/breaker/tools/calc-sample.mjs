// Breaker rc.12, item 1: calc() apparent geocentric places and rates in all eight frames from the installed
// package, for kernel_check.py to compare with NAIF's de440.bsp:
//  - N pseudo-random TT instants from 1800 to 2200 (seed 12, not the rc.11 review's, not noon);
//  - the instant 0.3 half-chords after the least separation of every 4th passage behind the Sun's disc
//    (passages.json), so that places and rates inside the disc are compared too.
// Also calc()'s rates against central differences of calc()'s own places (step 0.01 day), and calc() in its
// default frame against positions() and natalChart() at Date instants.
//   node calc-sample.mjs <N> <passages.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { calc, CALC_FRAMES } from "@zodiacs/engine/calc";
import { positions, natalChart, defaultEphemeris } from "@zodiacs/engine";
const N = Number(process.argv[2]);
let s = 12;
const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const JD0 = 2378497.5, JD1 = 2524592.5;
const jds = Array.from({ length: N }, () => ({ jd: Math.round((JD0 + rnd() * (JD1 - JD0)) * 1e6) / 1e6, set: "random", bodies: BODIES }));
const P = JSON.parse(readFileSync(process.argv[3], "utf8")).filter((p) => p.behind && p.minSepDeg < p.sunRadiusDeg);
P.forEach((p, i) => { if (i % 4 === 0) jds.push({ jd: Math.round((p.jdTt + 0.3 * Math.sqrt(p.sunRadiusDeg ** 2 - p.minSepDeg ** 2) / p.relRateDegPerDay) * 1e6) / 1e6, set: "inside-disc", bodies: [p.body, "Sun"] }); });
const rows = []; const names = new Set(); let flagged = 0; const fd = {}; const H = 0.01;
const ang = (a) => ((a + 540) % 360) - 180;
const convIds = new Set();
for (const { jd, set, bodies } of jds) for (const body of bodies) for (const frame of CALC_FRAMES) {
  const q = (t) => calc({ body, time: { jd: t, scale: "tt" }, frame, center: "geocentric", flags: { correction: "apparent" } });
  const r = q(jd);
  if (r.status !== "ok") throw new Error(`${body} ${frame} ${jd}: ${r.reason}`);
  names.add(r.receipt.engine.ephemeris.name); if (r.flags.length) flagged++;
  for (const id of r.receipt.conventions) if (id.startsWith("deflection")) convIds.add(id);
  rows.push([jd, body, frame, r.lon, r.lat, r.dist, r.speeds.lon, r.speeds.lat, r.speeds.dist, set, r.bounds.position.value, r.bounds.position.label]);
  if (set === "random") {
    const a = q(jd - H), b = q(jd + H);
    const dl = Math.abs(r.speeds.lon - ang(b.lon - a.lon) / (2 * H)) * 3600, db = Math.abs(r.speeds.lat - (b.lat - a.lat) / (2 * H)) * 3600;
    fd[body] ??= { lon: 0, lat: 0 }; if (dl > fd[body].lon) fd[body].lon = dl; if (db > fd[body].lat) fd[body].lat = db;
  }
}
let worst = { lon: 0, lat: 0, speed: 0 }, equal = 0, total = 0, chartEqual = 0;
for (let i = 0; i < 600; i++) {
  const date = new Date(Date.UTC(1800, 0, 2) + Math.floor(rnd() * (Date.UTC(2199, 11, 29) - Date.UTC(1800, 0, 2))));
  const p = positions(date), c = natalChart({ utc: date, latitude: 10, longitude: 20 });
  for (const body of BODIES) {
    const r = calc({ body, time: date }); const pb = p.find((x) => x.body === body), cb = c.bodies.find((x) => x.body === body);
    total++;
    if (r.lon === pb.lon && r.lat === pb.lat && r.speeds.lon === pb.speed) equal++;
    if (cb.lon === pb.lon && cb.lat === pb.lat && cb.speed === pb.speed) chartEqual++;
    worst.lon = Math.max(worst.lon, Math.abs(ang(r.lon - pb.lon)) * 3600); worst.lat = Math.max(worst.lat, Math.abs(r.lat - pb.lat) * 3600); worst.speed = Math.max(worst.speed, Math.abs(r.speeds.lon - pb.speed) * 3600);
    names.add(pb.ephemeris);
  }
}
writeFileSync(process.argv[4], JSON.stringify({ n: N, insideDisc: jds.length - N, frames: CALC_FRAMES, ephemerisNames: [...names], flagged, deflectionConventions: [...convIds], defaultEphemeris: defaultEphemeris(), rateVsOwnCentralDifference: { stepDays: H, arcsecPerDay: fd }, calcVsPositions: { total, equalToTheBit: equal, natalChartEqualsPositions: chartEqual, worstArcsec: worst }, rows }));
console.log(JSON.stringify({ n: N, insideDisc: jds.length - N, rows: rows.length, names: [...names], flagged, conv: [...convIds], fd, calcVsPositions: { total, equal, chartEqual, worst } }));
