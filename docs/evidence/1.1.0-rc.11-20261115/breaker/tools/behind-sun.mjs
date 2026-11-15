// Breaker, item 1/3: every passage of a planet behind the Sun from 1800 to 2200 (superior conjunctions). The
// instant of least separation is found on astronomy-engine, which bends no light (to about a second); calc()
// on the pack is then read every 30 s for 20 minutes each side of it, for the passages closer than 0.06 deg,
// for calc_check.py to compare with de440.bsp with and without the Sun's light deflection.
//   node behind-sun.mjs <out.json>
import { writeFileSync } from "node:fs";
import { calc } from "@zodiacs/engine/calc";
import { setDefaultEphemeris } from "@zodiacs/engine";
const BODIES = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const rad = Math.PI / 180;
const at = (body, jd) => calc({ body, time: { jd, scale: "tt" }, frame: "ecliptic-true-of-date" });
const sep = (body, jd) => {
  const p = at(body, jd), s = at("Sun", jd);
  const u = (r) => [Math.cos(r.lat * rad) * Math.cos(r.lon * rad), Math.cos(r.lat * rad) * Math.sin(r.lon * rad), Math.sin(r.lat * rad)];
  const a = u(p), b = u(s);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return { deg: Math.atan2(Math.hypot(...c), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / rad, behind: p.dist > s.dist };
};
const JD0 = 2378498.5, JD1 = 2524592.5;
const passages = [];
setDefaultEphemeris("astronomy-engine");
for (const body of BODIES) {
  let prev = sep(body, JD0), cur = sep(body, JD0 + 1);
  for (let jd = JD0 + 2; jd <= JD1; jd += 1) {
    const next = sep(body, jd);
    if (cur.deg < prev.deg && cur.deg <= next.deg && cur.deg < 3 && cur.behind) {
      let a = jd - 2, b = jd; const g = (Math.sqrt(5) - 1) / 2;
      let c = b - g * (b - a), d = a + g * (b - a), fc = sep(body, c).deg, fd = sep(body, d).deg;
      while (b - a > 1e-5) { if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = sep(body, c).deg; } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = sep(body, d).deg; } }
      const t = (a + b) / 2;
      passages.push({ body, jdTt: t, leastSeparationOnAstronomyEngineDeg: sep(body, t).deg });
    }
    prev = cur; cur = next;
  }
}
setDefaultEphemeris("de440");
const rows = [];
for (const p of passages.filter((x) => x.leastSeparationOnAstronomyEngineDeg < 0.06)) {
  for (let k = -40; k <= 40; k++) {
    const jd = Math.round((p.jdTt + (k * 30) / 86400) * 1e7) / 1e7;
    const r = at(p.body, jd);
    if (r.receipt.engine.ephemeris.name !== "jpl-de440" || r.flags.length) throw new Error("not the pack");
    rows.push([jd, p.body, "ecliptic-true-of-date", r.lon, r.lat, r.dist, r.speeds.lon, r.speeds.lat, r.speeds.dist]);
  }
}
writeFileSync(process.argv[2], JSON.stringify({ n: rows.length, passagesBehindTheSun: passages.length, within: { "0.2666 (the disc)": passages.filter((x) => x.leastSeparationOnAstronomyEngineDeg < 0.2666).length, "0.06": passages.filter((x) => x.leastSeparationOnAstronomyEngineDeg < 0.06).length }, passages: passages.filter((x) => x.leastSeparationOnAstronomyEngineDeg < 0.2666), rows }));
const by = {}; for (const r of passages) { (by[r.body] ??= []).push(r.leastSeparationOnAstronomyEngineDeg); }
console.log(passages.length, "passages behind the Sun;", Object.entries(by).map(([b, v]) => `${b} ${v.length}, ${v.filter((x) => x < 0.2666).length} behind the disc (least ${Math.min(...v).toFixed(5)} deg)`).join("; "), "; rows", rows.length);
