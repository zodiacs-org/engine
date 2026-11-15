// Breaker rc.12, item 0 (B2): find, from the installed package alone, every passage of Mercury to Pluto
// within 0.3 degrees of the Sun's centre from 1800 to 2200 (TT), with the planet farther than the Sun
// ("behind") or nearer ("in front"), by calc() in the true ecliptic of date. Written for this review;
// not the builder's passages.mjs.
//   node passages.mjs <out.json>      (run from the directory the package is installed in)
import { writeFileSync } from "node:fs";
import { calc } from "@zodiacs/engine/calc";
const rad = Math.PI / 180;
const q = (body, jd) => { const r = calc({ body, time: { jd, scale: "tt" }, frame: "ecliptic-true-of-date", flags: { speeds: false } }); if (r.status !== "ok") throw new Error(`${body} ${jd} ${r.reason}`); return r; };
const u = (r) => [Math.cos(r.lat * rad) * Math.cos(r.lon * rad), Math.cos(r.lat * rad) * Math.sin(r.lon * rad), Math.sin(r.lat * rad)];
const sepDeg = (a, b) => { const x = u(a), y = u(b); const c = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]; return Math.atan2(Math.hypot(...c), x[0] * y[0] + x[1] * y[1] + x[2] * y[2]) / rad; };
const wrap = (a) => ((a + 540) % 360) - 180;
const JD0 = 2378497.0, JD1 = 2524593.0; // 1800-01-01.5 to 2199-12-31.5 TT (calc() spans 1800-01-01 to 2200-01-01 UTC)
const out = [];
for (const body of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]) {
  const d = (jd) => wrap(q(body, jd).lon - q("Sun", jd).lon);
  const sep = (jd) => sepDeg(q(body, jd), q("Sun", jd));
  const STEP = 0.5;
  let prev = d(JD0);
  for (let jd = JD0 + STEP; jd <= JD1; jd += STEP) {
    const cur = d(jd);
    if (Math.sign(cur) !== Math.sign(prev) && Math.abs(cur) < 5 && Math.abs(prev) < 5) {
      // golden-section minimum of the separation within a day of the conjunction in longitude
      let a = jd - STEP - 1, b = jd + 1; const g = (Math.sqrt(5) - 1) / 2;
      let c = b - g * (b - a), e = a + g * (b - a), fc = sep(c), fe = sep(e);
      while (b - a > 2e-7) { if (fc < fe) { b = e; e = c; fe = fc; c = b - g * (b - a); fc = sep(c); } else { a = c; c = e; fc = fe; e = a + g * (b - a); fe = sep(e); } }
      const t = (a + b) / 2, p = q(body, t), s = q("Sun", t), m = sepDeg(p, s);
      if (m < 0.3) {
        // relative angular rate, degrees a day, from the separation an hour either side
        const h = 1 / 24; const rate = Math.sqrt(Math.max(0, (sep(t + h) ** 2 + sep(t - h) ** 2) / 2 - m * m)) / h;
        out.push({ body, jdTt: t, minSepDeg: m, behind: p.dist > s.dist, planetAu: p.dist, sunAu: s.dist, sunRadiusDeg: Math.asin(695700 / (s.dist * 149597870.7)) / rad, relRateDegPerDay: rate });
      }
    }
    prev = cur;
  }
  console.error(body, out.filter((x) => x.body === body).length);
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
const by = {}; for (const p of out) { const k = p.body; by[k] ??= { all: 0, behindDisc: 0, inFrontOfDisc: 0 }; by[k].all++; if (p.minSepDeg < p.sunRadiusDeg) by[k][p.behind ? "behindDisc" : "inFrontOfDisc"]++; }
console.log(JSON.stringify(by));
