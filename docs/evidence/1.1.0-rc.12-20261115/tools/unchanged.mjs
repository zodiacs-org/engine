#!/usr/bin/env node
/*
 * What 1.1.0-rc.12 changes in the default positions, against the carried
 * 1.1.0-rc.11 archive: positions() of both builds, on the shipped pack, at N
 * pseudo-random UTC instants from 1800 to 2200 (mulberry32, seed 20261115)
 * and at every instant of passages.json (the near-Sun comparison's 6,720),
 * each body's longitude, latitude and speed compared bit for bit, and each
 * difference sorted by where the body is: behind the Sun's disc (rc.12's
 * place says so: `behindDisc` of the pack's source), within 0.001 day of an
 * instant at which it passes the limb (a speed's samples straddle it), or
 * neither.
 *
 *   node unchanged.mjs RC11_DIST RC12_DIST passages.json N OUT.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [old, now, passagesPath, count, out] = process.argv.slice(2);
const A = await import(pathToFileURL(`${old}/index.js`).href);
const B = await import(pathToFileURL(`${now}/index.js`).href);
const pack = await import(pathToFileURL(`${now}/de440-pack.js`).href);
const source = pack.shippedDe440Source();
for (const m of [A, B]) if (m.defaultEphemeris().name !== "de440" || !m.defaultEphemeris().de440.opened) throw new Error("not on the pack");
const J2000 = Date.UTC(2000, 0, 1, 12);
let seed = 20261115;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const FROM = Date.UTC(1800, 0, 2), TO = Date.UTC(2199, 11, 30);
const instants = Array.from({ length: Number(count) }, () => Math.round(FROM + random() * (TO - FROM)));
const passages = JSON.parse(readFileSync(passagesPath, "utf8"));
// passages.json gives TT Julian dates; positions() takes UTC: TT - UTC from the engine's own time basis.
const time = await import(pathToFileURL(`${now}/time.js`).href);
for (const row of passages.rows) {
  const tt = (row.jdTt - 2451545) * 86400000 + J2000;
  let utc = tt - 69184;
  for (let i = 0; i < 3; i += 1) utc = tt - (time.timeBasis(utc, "utc").ttDays * 86400000 + J2000 - utc);
  instants.push(Math.round(utc));
}
const PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const behindAt = (body, ms) => source.place(body, time.timeBasis(ms, "utc").ttDays).behindDisc;
const tally = { instants: instants.length, rows: 0, identical: 0, differ: { behindTheDisc: 0, nearALimb: 0, elsewhere: 0 }, largest: { behindTheDisc: 0, nearALimb: 0 }, elsewhereRows: [] };
for (const ms of instants) {
  const a = A.positions(new Date(ms));
  const b = B.positions(new Date(ms));
  for (let i = 0; i < b.length; i += 1) {
    tally.rows += 1;
    const [x, y] = [a[i], b[i]];
    if (x.body !== y.body) throw new Error("order");
    if (x.lon === y.lon && x.lat === y.lat && x.speed === y.speed && x.retrograde === y.retrograde) {
      tally.identical += 1;
      continue;
    }
    const planet = PLANETS.includes(y.body);
    const behind = planet && behindAt(y.body, ms);
    const near = planet && !behind && (behindAt(y.body, ms - 86400) !== behind || behindAt(y.body, ms + 86400) !== behind);
    const moved = Math.abs(((y.lon - x.lon + 540) % 360) - 180) * 3600;
    if (behind) {
      tally.differ.behindTheDisc += 1;
      tally.largest.behindTheDisc = Math.max(tally.largest.behindTheDisc, moved);
    } else if (near) {
      tally.differ.nearALimb += 1;
      tally.largest.nearALimb = Math.max(tally.largest.nearALimb, Math.abs(y.speed - x.speed));
    } else {
      tally.differ.elsewhere += 1;
      if (tally.elsewhereRows.length < 20) tally.elsewhereRows.push({ utc: new Date(ms).toISOString(), body: y.body, rc11: x, rc12: y });
    }
  }
}
tally.units = { behindTheDisc: "largest change of longitude, arcseconds", nearALimb: "largest change of speed, degrees a day" };
tally.versions = { rc11: A.ENGINE_VERSION ?? null, rc12: B.ENGINE_VERSION ?? null };
writeFileSync(out, JSON.stringify(tally, null, 1) + "\n");
console.log(JSON.stringify({ ...tally, elsewhereRows: tally.elsewhereRows.length }));
