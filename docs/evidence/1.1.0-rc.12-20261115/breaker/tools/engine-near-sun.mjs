// Breaker rc.12, item 0 (B2): calc() of the installed package at the instants of instants.json: the planet and
// the Sun, apparent geocentric, in the true equator and equinox of date (to set beside Horizons's RA and Dec)
// with the bound calc() quotes there and in the true ecliptic of date, the ephemeris it names, its flags, and
// the pack source's own decision on the disc (place().behindDisc, @zodiacs/engine/de440/pack).
//   node engine-near-sun.mjs <instants.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { calc } from "@zodiacs/engine/calc";
import { ENGINE_VERSION } from "@zodiacs/engine";
import { shippedDe440Source } from "@zodiacs/engine/de440/pack";
const source = shippedDe440Source();
const groups = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = groups.map((g) => ({ set: g.set, body: g.body, rows: g.jd.map((jd) => {
  const q = (body, frame) => { const r = calc({ body, time: { jd, scale: "tt" }, frame }); if (r.status !== "ok") throw new Error(`${body} ${jd} ${r.reason}`); return r; };
  const p = q(g.body, "equatorial-true-of-date"), s = q("Sun", "equatorial-true-of-date"), e = q(g.body, "ecliptic-true-of-date");
  if (p.receipt.engine.ephemeris.name !== "jpl-de440" || p.flags.some((f) => /de440/.test(f))) throw new Error("not the pack");
  return { jdTt: jd, ra: p.lon, dec: p.lat, dist: p.dist, sunRa: s.lon, sunDec: s.lat, sunDist: s.dist, behindDisc: source.place(g.body, jd - 2451545).behindDisc,
    boundEquatorial: [p.bounds.position.value, p.bounds.position.label], boundEcliptic: [e.bounds.position.value, e.bounds.position.label], speedLon: e.speeds.lon, speedLat: e.speeds.lat };
}) }));
writeFileSync(process.argv[3], JSON.stringify({ engine: ENGINE_VERSION, node: process.version, groups: out }));
console.log(ENGINE_VERSION, out.length, "groups", out.reduce((n, g) => n + g.rows.length, 0), "instants");
