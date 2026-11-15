// Breaker rc.12, item 0: which outputs changed against the carried 1.1.0-rc.11 archive. Run once in each
// install; the second run (given the first's file) compares. positions() at 8,000 pseudo-random UTC instants
// from 1800 to 2199 (seed 77) and calc() (ecliptic of date, with speeds) at this review's 1,744 near-Sun
// instants; a row is a body at an instant; rows are compared to the bit.
//   node vs-rc11.mjs <instants.json> <out.json> [<the other version's out.json>]
import { readFileSync, writeFileSync } from "node:fs";
import { positions, ENGINE_VERSION } from "@zodiacs/engine";
import { calc } from "@zodiacs/engine/calc";
let s = 77; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const rows = [];
for (let i = 0; i < 8000; i++) { const ms = Date.UTC(1800, 0, 2) + Math.floor(rnd() * (Date.UTC(2199, 11, 30) - Date.UTC(1800, 0, 2))); for (const b of positions(new Date(ms))) rows.push(["random", ms, b.body, b.lon, b.lat, b.speed, b.ephemeris]); }
for (const g of JSON.parse(readFileSync(process.argv[2], "utf8"))) for (const jd of g.jd) { const r = calc({ body: g.body, time: { jd, scale: "tt" } }); rows.push([g.set, jd, g.body, r.lon, r.lat, r.speeds.lon, r.receipt.engine.ephemeris.name]); }
const doc = { engine: ENGINE_VERSION, rows };
if (process.argv[4]) {
  const other = JSON.parse(readFileSync(process.argv[4], "utf8"));
  let behind = null; try { const { shippedDe440Source } = await import("@zodiacs/engine/de440/pack"); const src = shippedDe440Source(); behind = (body, jd) => src.place(body, jd - 2451545).behindDisc === true; } catch {}
  const diff = { random: { rows: 0, differ: 0, differBehindDisc: 0, differNotBehindDisc: 0, largestLonArcsec: 0, notBehind: [] }, nearSun: { rows: 0, differ: 0, differBehindDisc: 0, differNotBehindDisc: 0, sameBehindDisc: 0, largestLonArcsec: 0, largestSpeedArcsecPerDay: 0, notBehind: [] } };
  rows.forEach((r, i) => { const o = other.rows[i]; if (o[0] !== r[0] || o[1] !== r[1] || o[2] !== r[2]) throw new Error("rows do not line up"); const same = o[3] === r[3] && o[4] === r[4] && o[5] === r[5] && o[6] === r[6];
    if (r[0] === "random") { const d = diff.random; d.rows++; if (!same) { d.differ++; const jd = calc({ body: r[2], time: new Date(r[1]) }).receipt.instants[0].jdTt; if (behind(r[2], jd)) d.differBehindDisc++; else { d.differNotBehindDisc++; d.notBehind.push({ ms: r[1], body: r[2], lonArcsec: (r[3] - o[3]) * 3600, speedArcsecPerDay: (r[5] - o[5]) * 3600 }); } d.largestLonArcsec = Math.max(d.largestLonArcsec, Math.abs(r[3] - o[3]) * 3600); } } else { const d = diff.nearSun; d.rows++; const b = behind ? behind(r[2], r[1]) : null; if (!same) { d.differ++; if (b) d.differBehindDisc++; else { d.differNotBehindDisc++; if (d.notBehind.length < 30) d.notBehind.push({ set: r[0], jdTt: r[1], body: r[2], lonArcsec: (r[3] - o[3]) * 3600, latArcsec: (r[4] - o[4]) * 3600, speedArcsecPerDay: (r[5] - o[5]) * 3600 }); } d.largestLonArcsec = Math.max(d.largestLonArcsec, Math.abs(r[3] - o[3]) * 3600); d.largestSpeedArcsecPerDay = Math.max(d.largestSpeedArcsecPerDay, Math.abs(r[5] - o[5]) * 3600); } else if (b) d.sameBehindDisc++; } });
  doc.against = other.engine; doc.diff = diff; delete doc.rows; console.log(JSON.stringify(doc, null, 1));
}
writeFileSync(process.argv[3], JSON.stringify(doc));
