// Breaker, item 5: the conformance suite's 240 L1 vectors (JPL Horizons, DE441) against a plain natalChart()
// of the installed package: no withEphemeris, no pack given, no ZODIACS_* variable. Own runner.
//   node l1.mjs <L1-positions.json> <out.json>     (from the install directory)
import { readFileSync, writeFileSync } from "node:fs";
import { natalChart, defaultEphemeris } from "@zodiacs/engine";
const zod = Object.keys(process.env).filter((k) => k.startsWith("ZODIACS_"));
if (zod.length) throw new Error(`unset ${zod.join(", ")}`);
const { vectors } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rad = Math.PI / 180;
const rows = [];
for (const v of vectors) {
  if (v.kind !== "position.apparent.ecliptic-true-of-date") throw new Error(v.kind);
  // The instant is TT; a Date holds milliseconds, so the engine is asked at the nearest millisecond.
  const ms = Math.round((v.input.jd_tt - 2440587.5) * 86400000);
  const chart = natalChart({ utc: new Date(ms), timeScale: "tt", timeKnown: false });
  const b = chart.bodies.find((x) => x.body === v.input.body);
  const dLon = (((b.lon - v.expected.lon + 540) % 360) - 180) * 3600;
  const dLat = (b.lat - v.expected.lat) * 3600;
  const u = (lon, lat) => [Math.cos(lat * rad) * Math.cos(lon * rad), Math.cos(lat * rad) * Math.sin(lon * rad), Math.sin(lat * rad)];
  const a = u(b.lon, b.lat), e = u(v.expected.lon, v.expected.lat);
  const cross = [a[1] * e[2] - a[2] * e[1], a[2] * e[0] - a[0] * e[2], a[0] * e[1] - a[1] * e[0]];
  const angle = (Math.atan2(Math.hypot(...cross), a[0] * e[0] + a[1] * e[1] + a[2] * e[2]) / rad) * 3600;
  rows.push({ id: v.id, body: v.input.body, jdTt: v.input.jd_tt, roundedMs: ((v.input.jd_tt - 2440587.5) * 86400000 - ms), dLon, dLat, angle,
    pass: Math.abs(dLon) <= v.tolerance.lon.abs && Math.abs(dLat) <= v.tolerance.lat.abs, ephemeris: chart.ephemeris.name, rowEphemeris: b.ephemeris, flags: chart.flags.filter((f) => /de440/.test(f)) });
}
const worst = (f) => rows.reduce((m, r) => (Math.abs(r[f]) > Math.abs(m[f]) ? r : m));
const perBody = {};
for (const r of rows) { const p = (perBody[r.body] ??= { n: 0, lon: 0, lat: 0, angle: 0 }); p.n++; p.lon = Math.max(p.lon, Math.abs(r.dLon)); p.lat = Math.max(p.lat, Math.abs(r.dLat)); p.angle = Math.max(p.angle, r.angle); }
const summary = { node: process.version, defaultEphemeris: defaultEphemeris(), vectors: rows.length, within1Arcsec: rows.filter((r) => r.pass).length,
  ephemerisNames: [...new Set(rows.map((r) => r.ephemeris))], fallbackFlagged: rows.filter((r) => r.flags.length).length,
  worstLon: worst("dLon"), worstLat: worst("dLat"), worstAngle: worst("angle"), perBodyArcsec: perBody };
writeFileSync(process.argv[3], JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
