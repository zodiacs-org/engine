// Breaker, item 1: calc() on the pack (equatorial-true-of-date, apparent, geocentric) at four instants a planet is
// behind the Sun's disc, against JPL Horizons's airless apparent RA and Dec (quantity 2, geocentric, TT instants;
// the saved responses are in results/horizons/). The repository's arbiter for positions is Horizons.
//   node horizons-near-sun.mjs <out.json>
import { writeFileSync } from "node:fs";
import { calc } from "@zodiacs/engine/calc";
import { setDefaultEphemeris } from "@zodiacs/engine";
const H = [
  { body: "Mercury", jdTt: 2434871.460627, ra: 45.334816866, dec: 17.142858950, sot: 0.0004 },
  { body: "Uranus", jdTt: 2462292.1837037, ra: 72.999725284, dec: 22.518152748, sot: 0.0022 },
  { body: "Neptune", jdTt: 2392770.1159471, ra: 312.550963972, dec: -17.734488801, sot: 0.0030 },
  { body: "Jupiter", jdTt: 2463232.8208694, ra: 281.344768133, dec: -23.016545460, sot: 0.0071 }
];
const rad = Math.PI / 180;
const angle = (ra1, d1, ra2, d2) => { const u = (a, d) => [Math.cos(d * rad) * Math.cos(a * rad), Math.cos(d * rad) * Math.sin(a * rad), Math.sin(d * rad)]; const a = u(ra1, d1), b = u(ra2, d2); const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; return (Math.atan2(Math.hypot(...c), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / rad) * 3600; };
const rows = [];
for (const h of H) {
  const q = () => calc({ body: h.body, time: { jd: h.jdTt, scale: "tt" }, frame: "equatorial-true-of-date" });
  const pack = q();
  setDefaultEphemeris("astronomy-engine"); const ae = q(); setDefaultEphemeris("de440");
  rows.push({ body: h.body, jdTt: h.jdTt, horizons: { ra: h.ra, dec: h.dec, sunObserverTargetDeg: h.sot },
    pack: { ephemeris: pack.receipt.engine.ephemeris.name, flags: pack.flags, ra: pack.lon, dec: pack.lat, quotedBoundArcsec: pack.bounds.position.value, boundLabel: pack.bounds.position.label, angleFromHorizonsArcsec: angle(pack.lon, pack.lat, h.ra, h.dec) },
    astronomyEngine: { ephemeris: ae.receipt.engine.ephemeris.name, ra: ae.lon, dec: ae.lat, quotedBoundArcsec: ae.bounds.position.value, angleFromHorizonsArcsec: angle(ae.lon, ae.lat, h.ra, h.dec) } });
}
writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
for (const r of rows) console.log(r.body, r.jdTt, "pack", r.pack.angleFromHorizonsArcsec.toFixed(3), "arcsec from Horizons (quotes", r.pack.quotedBoundArcsec, r.pack.boundLabel + ");", "astronomy-engine", r.astronomyEngine.angleFromHorizonsArcsec.toFixed(3), "(quotes", r.astronomyEngine.quotedBoundArcsec + ")");
