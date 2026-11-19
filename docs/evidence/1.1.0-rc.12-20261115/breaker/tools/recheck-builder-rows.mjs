// Breaker rc.12: the builder's near-Sun evidence (near-sun/results/passages.json.gz) records engine version
// "1.1.0-rc.11" (a build made before the version was raised). Recompute its 6,720 rows with the installed
// 1.1.0-rc.12 archive and count the rows whose every number is identical to the bit.
//   node recheck-builder-rows.mjs <rows.json (the "rows" of passages.json.gz)> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { calc } from "@zodiacs/engine/calc";
import { ENGINE_VERSION } from "@zodiacs/engine";
const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
let same = 0, worst = 0; const differing = [];
for (const r of rows) {
  const q = (body, frame) => calc({ body, time: { jd: r.jdTt, scale: "tt" }, frame, flags: { speeds: false } });
  let ok = true, d = 0;
  for (const [key, frame] of [["equ", "equatorial-true-of-date"], ["ecl", "ecliptic-true-of-date"]]) {
    const p = q(r.body, frame), s = q("Sun", frame);
    const got = { lon: p.lon, lat: p.lat, dist: p.dist, sunLon: s.lon, sunLat: s.lat, sunDist: s.dist };
    for (const k of Object.keys(got)) { if (got[k] !== r[key][k]) { ok = false; d = Math.max(d, Math.abs(got[k] - r[key][k]) * (k.endsWith("ist") ? 0 : 3600)); } }
    if (key === "ecl" && (p.bounds.position.value !== r.bound.value || p.bounds.position.label !== r.bound.label)) { ok = false; differing.push({ jdTt: r.jdTt, body: r.body, bound: [r.bound, { value: p.bounds.position.value, label: p.bounds.position.label }] }); }
  }
  if (ok) same++; else { worst = Math.max(worst, d); if (differing.length < 20) differing.push({ jdTt: r.jdTt, body: r.body, arcsec: d }); }
}
const out = { installed: ENGINE_VERSION, rows: rows.length, identicalToTheBit: same, largestDifferenceArcsec: worst, differing };
writeFileSync(process.argv[3], JSON.stringify(out, null, 1)); console.log(JSON.stringify(out).slice(0, 1500));
