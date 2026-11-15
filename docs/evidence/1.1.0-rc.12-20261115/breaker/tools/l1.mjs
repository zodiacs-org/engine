// Breaker rc.12, item 5: the 240 L1 vectors (JPL Horizons, DE441) against plain natalChart() of the installed
// package, default path, no ZODIACS_* variable. Own runner: reads the vectors file, calls natalChart with the
// vector's TT instant, compares longitude (wrapped) and latitude in arcseconds.
//   node l1.mjs <L1-positions.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { natalChart, ENGINE_VERSION, defaultEphemeris } from "@zodiacs/engine";
if (Object.keys(process.env).some((k) => k.startsWith("ZODIACS_"))) throw new Error("a ZODIACS_* variable is set");
const suite = JSON.parse(readFileSync(process.argv[2], "utf8"));
const rows = []; let pass = 0; const kinds = {};
for (const v of suite.vectors) {
  kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
  // TT Julian date to the engine's instant: a Date on the TT scale (timeScale "tt")
  const ms = Math.round((v.input.jd_tt - 2440587.5) * 86400000);
  const chart = natalChart({ utc: new Date(ms), timeScale: "tt", latitude: 0, longitude: 0 });
  const b = chart.bodies.find((x) => x.body === v.input.body);
  if (!b) { rows.push({ id: v.id, error: "no body" }); continue; }
  // the Date is rounded to a millisecond: move the expected place by the engine's own speed over the rounding
  const dtDays = (ms - (v.input.jd_tt - 2440587.5) * 86400000) / 86400000;
  const dlon = ((((b.lon - v.expected.lon) + 540) % 360) - 180) * 3600;
  const dlat = (b.lat - v.expected.lat) * 3600;
  const ok = Math.abs(dlon) <= v.tolerance.lon.abs && Math.abs(dlat) <= v.tolerance.lat.abs;
  if (ok) pass++;
  rows.push({ id: v.id, body: v.input.body, jdTt: v.input.jd_tt, dlonArcsec: dlon, dlatArcsec: dlat, msRoundingDays: dtDays, speedDegPerDay: b.speed, ephemeris: b.ephemeris ?? chart.ephemeris?.name, chartEphemeris: chart.ephemeris, flags: chart.flags ?? null, ok });
}
const worst = (k) => rows.reduce((a, r) => (Math.abs(r[k]) > Math.abs(a[k]) ? r : a));
const wl = worst("dlonArcsec"), wb = worst("dlatArcsec");
const names = [...new Set(rows.map((r) => JSON.stringify(r.chartEphemeris?.name ?? r.ephemeris)))];
const flagged = rows.filter((r) => Array.isArray(r.flags) && r.flags.some((f) => /de440|span/.test(f))).length;
const summary = { engine: ENGINE_VERSION, node: process.version, defaultEphemeris: defaultEphemeris(), vectors: suite.vectors.length, kinds, pass, worstLon: { id: wl.id, body: wl.body, arcsec: wl.dlonArcsec }, worstLat: { id: wb.id, body: wb.body, arcsec: wb.dlatArcsec }, worstPlanetOrSunLon: Math.max(...rows.filter((r) => r.body !== "Moon").map((r) => Math.abs(r.dlonArcsec))), ephemerisNames: names, fallbackFlagged: flagged };
writeFileSync(process.argv[3], JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
