// Breaker's own L1 runner: the 240 vectors on the installed package, plain natalChart(), nothing set, nothing opened.
// Usage: node l1.mjs <L1-positions.json>
import { readFileSync } from 'node:fs';
import { natalChart, ENGINE_VERSION } from '@zodiacs/engine';

const zod = Object.keys(process.env).filter((k) => k.startsWith('ZODIACS_'));
const vectors = JSON.parse(readFileSync(process.argv[2], 'utf8')).vectors;
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
let pass = 0;
const worst = { lon: { v: 0 }, lat: { v: 0 } };
const names = new Set(), flags = new Set(), per = {};
for (const vector of vectors) {
  const { body, jd_tt: jd } = vector.input;
  const date = new Date(Math.round((jd - 2440587.5) * 86_400_000));
  const chart = natalChart({ utc: date, timeScale: 'tt', timeKnown: false });
  const row = chart.bodies.find((r) => r.body === body);
  const dLon = Math.abs(wrap(row.lon - vector.expected.lon)) * 3600;
  const dLat = Math.abs(row.lat - vector.expected.lat) * 3600;
  if (dLon <= vector.tolerance.lon.abs && dLat <= vector.tolerance.lat.abs) pass += 1;
  if (dLon > worst.lon.v) worst.lon = { v: dLon, id: vector.id, body };
  if (dLat > worst.lat.v) worst.lat = { v: dLat, id: vector.id, body };
  per[body] = Math.max(per[body] ?? 0, dLon, dLat);
  names.add(chart.ephemeris.name + ' ' + row.ephemeris + (row.fallback ? ' ' + row.fallback : ''));
  for (const f of chart.flags) flags.add(f);
}
console.log(JSON.stringify({ node: process.version, engine: ENGINE_VERSION, zodiacsEnv: zod, vectors: vectors.length, within1arcsec: pass, worstLonArcsec: worst.lon, worstLatArcsec: worst.lat, largestPerBodyArcsec: per, ephemeris: [...names], flags: [...flags] }, null, 1));
