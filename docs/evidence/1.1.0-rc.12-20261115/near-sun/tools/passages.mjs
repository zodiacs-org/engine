#!/usr/bin/env node
/*
 * Every passage of a planet behind the Sun's disc from 1800 to 2200, found on
 * the engine's default source (the shipped DE440 pack), and calc()'s places of
 * the planet and the Sun at instants across each, for horizons.py to fetch and
 * compare.py to compare with JPL Horizons.
 *
 *   ZODIACS_ENGINE_DIST=/abs/dist node passages.mjs OUT.json
 *
 * A passage: a least geocentric separation of Mercury to Pluto from the Sun,
 * on daily samples at noon TT from 1800-01-01 to 2199-12-31 and refined by golden
 * section to 1e-6 day, with the planet farther than the Sun and the least
 * separation under 0.3 degrees (the disc is at most 0.2711 degrees across, as
 * a radius). The instants: the least separation t0, and t0 + f h for f in
 * +-0.3, 0.6, 0.85, 0.95, 1.05, 1.3 and 2, h the time from t0 to the limb
 * (from the separation's growth either side); for a passage that misses the
 * disc, h is the time to move 0.05 degrees farther. Each instant is rounded to
 * 1e-6 day of TT before it is computed, and sent to Horizons as written.
 * Places: calc() in the true equator and equinox of date and the true
 * ecliptic of date, apparent, geocentric, no speeds, each named jpl-de440 and
 * unflagged (the tool stops otherwise), with the bound calc() quotes.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? new URL("../../../../../dist/", import.meta.url).pathname);
const { calc } = await import(pathToFileURL(`${dist}/calc.js`).href);
const root = await import(pathToFileURL(`${dist}/index.js`).href);
if (root.defaultEphemeris().name !== "de440" || !root.defaultEphemeris().de440.opened) throw new Error("the default is not the pack");

const BODIES = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const RAD = Math.PI / 180;
const SUN_RADIUS_KM = 695700;
const AU_KM = 149597870.7;
const JD0 = 2378497.0; // 1800-01-01 12:00 TT, the first instant calc() takes, as the sweep
const JD1 = 2524593.0; // 2199-12-31 12:00 TT
const round6 = (jd) => Math.round(jd * 1e6) / 1e6;

const place = (body, jd, frame = "ecliptic-true-of-date") => {
  const r = calc({ body, time: { jd, scale: "tt" }, frame, flags: { speeds: false } });
  if (r.status !== "ok") throw new Error(`${body} ${jd}: ${r.reason}`);
  if (r.receipt.engine.ephemeris.name !== "jpl-de440" || r.flags.length) throw new Error(`${body} ${jd}: not the pack (${r.receipt.engine.ephemeris.name}, ${r.flags})`);
  return r;
};
const unit = (r) => [Math.cos(r.lat * RAD) * Math.cos(r.lon * RAD), Math.cos(r.lat * RAD) * Math.sin(r.lon * RAD), Math.sin(r.lat * RAD)];
const angle = (a, b) => {
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(...c), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / RAD;
};
const separation = (body, jd) => {
  const p = place(body, jd), s = place("Sun", jd);
  return { deg: angle(unit(p), unit(s)), behind: p.dist > s.dist, radiusDeg: Math.asin(SUN_RADIUS_KM / (s.dist * AU_KM)) / RAD };
};

const passages = [];
for (const body of BODIES) {
  let prev = separation(body, JD0).deg, cur = separation(body, JD0 + 1).deg;
  for (let jd = JD0 + 2; jd <= JD1; jd += 1) {
    const next = separation(body, jd).deg;
    if (cur < prev && cur <= next && cur < 1) {
      let a = jd - 2, b = jd;
      const g = (Math.sqrt(5) - 1) / 2;
      let c = b - g * (b - a), d = a + g * (b - a), fc = separation(body, c).deg, fd = separation(body, d).deg;
      while (b - a > 1e-6) {
        if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = separation(body, c).deg; }
        else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = separation(body, d).deg; }
      }
      const t0 = round6((a + b) / 2);
      const at = separation(body, t0);
      if (at.behind && at.deg < 0.3) {
        // The separation's growth: s(t)^2 = s0^2 + (w (t - t0))^2 near t0.
        const delta = 0.02;
        const w = Math.sqrt(Math.max(0, (separation(body, t0 + delta).deg ** 2 + separation(body, t0 - delta).deg ** 2) / 2 - at.deg ** 2)) / delta;
        const inside = at.deg < at.radiusDeg;
        const h = inside ? Math.sqrt(at.radiusDeg ** 2 - at.deg ** 2) / w : 0.05 / w;
        passages.push({ body, t0, leastDeg: at.deg, radiusDeg: at.radiusDeg, behindTheDisc: inside, degPerDay: w, h });
      }
    }
    prev = cur;
    cur = next;
  }
}

const F = [0, 0.3, -0.3, 0.6, -0.6, 0.85, -0.85, 0.95, -0.95, 1.05, -1.05, 1.3, -1.3, 2, -2];
const rows = [];
for (const [index, p] of passages.entries()) {
  for (const f of F) {
    const jd = round6(p.t0 + f * p.h);
    const row = { passage: index, body: p.body, f, jdTt: jd };
    for (const [key, frame] of [["equ", "equatorial-true-of-date"], ["ecl", "ecliptic-true-of-date"]]) {
      const b = place(p.body, jd, frame), s = place("Sun", jd, frame);
      row[key] = { lon: b.lon, lat: b.lat, dist: b.dist, sunLon: s.lon, sunLat: s.lat, sunDist: s.dist };
      if (key === "ecl") row.bound = { value: b.bounds.position.value, label: b.bounds.position.label };
    }
    const sep = separation(p.body, jd);
    row.separationDeg = sep.deg;
    row.radiusDeg = sep.radiusDeg;
    rows.push(row);
  }
}
const engine = place("Sun", 2451545).receipt.engine;
writeFileSync(process.argv[2], JSON.stringify({ engine, dist, node: process.version, passages, rows }) + "\n");
const by = {};
for (const p of passages) (by[p.body] ??= { passages: 0, behindTheDisc: 0 }), by[p.body].passages++, p.behindTheDisc && by[p.body].behindTheDisc++;
console.log(`${passages.length} passages under 0.3 degrees, ${passages.filter((p) => p.behindTheDisc).length} behind the disc; ${rows.length} instants;`, JSON.stringify(by));
