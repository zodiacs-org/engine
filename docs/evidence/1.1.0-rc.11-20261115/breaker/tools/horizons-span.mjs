// Breaker, item 1: calc() on the pack against JPL Horizons's apparent RA/Dec (quantity 2) and ecliptic longitude
// and latitude of date (quantity 31) every 15 minutes for 12 hours each side of a passage behind the Sun
// (the saved responses: results/horizons/span-<body>.txt). How large the difference is, and for how long.
//   node horizons-span.mjs <dir with span-*.txt> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { calc } from "@zodiacs/engine/calc";
import { setDefaultEphemeris } from "@zodiacs/engine";
const rad = Math.PI / 180;
const angle = (ra1, d1, ra2, d2) => { const u = (a, d) => [Math.cos(d * rad) * Math.cos(a * rad), Math.cos(d * rad) * Math.sin(a * rad), Math.sin(d * rad)]; const a = u(ra1, d1), b = u(ra2, d2); const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; return (Math.atan2(Math.hypot(...c), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / rad) * 3600; };
const out = {};
for (const body of ["Mercury", "Jupiter", "Uranus"]) {
  const text = readFileSync(`${process.argv[2]}/span-${body}.txt`, "utf8");
  const lines = text.slice(text.indexOf("$$SOE") + 5, text.indexOf("$$EOE")).trim().split("\n");
  const rows = lines.map((line) => {
    const f = line.split(",").map((s) => s.trim());
    const jd = Number(f[0]), ra = Number(f[3]), dec = Number(f[4]), lon = Number(f[5]), lat = Number(f[6]), sot = Number(f[7]);
    const q = (frame) => calc({ body, time: { jd, scale: "tt" }, frame });
    const pe = q("equatorial-true-of-date"), pl = q("ecliptic-true-of-date");
    if (pl.receipt.engine.ephemeris.name !== "jpl-de440" || pl.flags.length) throw new Error("not the pack");
    setDefaultEphemeris("astronomy-engine"); const ae = q("equatorial-true-of-date"); setDefaultEphemeris("de440");
    return { jdTt: jd, sunObserverTargetDeg: sot, packFromHorizonsArcsec: angle(pe.lon, pe.lat, ra, dec), packEclipticFromHorizonsArcsec: angle(pl.lon, pl.lat, lon, lat), packLonDifferenceArcsec: (((pl.lon - lon + 540) % 360) - 180) * 3600, astronomyEngineFromHorizonsArcsec: angle(ae.lon, ae.lat, ra, dec), quoted: pl.bounds.position.value, label: pl.bounds.position.label };
  });
  const over = (x) => rows.filter((r) => r.packFromHorizonsArcsec > x).length;
  const worst = rows.reduce((m, r) => (r.packFromHorizonsArcsec > m.packFromHorizonsArcsec ? r : m));
  out[body] = { samples: rows.length, stepMinutes: 15, quotedBoundArcsec: rows[0].quoted, boundLabelInTheTrueEclipticOfDate: rows[0].label,
    worst, samplesWherePackIsFartherThan: { "0.1 arcsec": over(0.1), "1 arcsec": over(1), "5 arcsec": over(5), "30 arcsec": over(30) },
    hoursFartherThan1Arcsec: over(1) * 0.25, samplesWherePackIsFartherThanAstronomyEngine: rows.filter((r) => r.packFromHorizonsArcsec > r.astronomyEngineFromHorizonsArcsec).length,
    packOutsideTheDisc: (() => { const o = rows.filter((r) => r.sunObserverTargetDeg > 0.28); return o.length ? Math.max(...o.map((r) => r.packFromHorizonsArcsec)) : null; })(), rows };
  console.log(body, JSON.stringify({ ...out[body], rows: undefined }));
}
writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
