// Engine side of the position/house sample, run against the carried
// 1.1.0-rc.3 archive installed beside this file (../README.md).
// Writes JSONL to argv[2].
import * as E from "@zodiacs/engine";
import { timeBasis } from "@zodiacs/engine/time";
import { writeFileSync } from "node:fs";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261112);
const DAY = 86400000;
const instants = [];
// A: long span 1900..2050, 4 instants per year, random day and second
for (let y = 1900; y <= 2050; y++) {
  const y0 = Date.UTC(y, 0, 1), y1 = Date.UTC(y + 1, 0, 1);
  for (let k = 0; k < 4; k++) {
    const t = y0 + Math.floor(rnd() * ((y1 - y0) / 1000)) * 1000;
    instants.push({ set: "A", ms: t });
  }
}
// A0: edge instants
for (const iso of [
  "1900-01-01T00:00:00Z", "1971-12-31T23:59:59Z", "1972-01-01T00:00:00Z",
  "2000-01-01T12:00:00Z", "2016-12-31T23:59:59Z", "2017-01-01T00:00:00Z",
  "2027-10-01T23:59:59Z", "2027-10-02T00:00:00Z", "2027-10-03T00:00:00Z",
  "2030-12-31T23:59:59Z", "2050-12-31T23:59:59Z",
]) instants.push({ set: "E", ms: Date.parse(iso) });
// B: dense current/forward 2020..2031, every 4 days, random second of day
for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2032, 0, 1); t += 4 * DAY) {
  instants.push({ set: "B", ms: t + Math.floor(rnd() * 86400) * 1000 });
}

// house sites (synthetic): latitude, longitude incl. edge longitudes
const SITES = [
  [0, 0], [51.5, -0.0001], [-33.9, 180], [-33.9, -180], [40.7, 179.9999],
  [65.0, -179.9999], [-66.0, 90], [23.44, -90], [-45, 139.7], [60, -74], [12.5, 0.0001], [-23.5, -46.6],
];
const SYSTEMS = E.HOUSE_SYSTEMS;

const out = [];
let hi = 0;
for (const s of instants) {
  const d = new Date(s.ms);
  const tb = timeBasis(s.ms);
  const pos = E.positions(d);
  const rec = {
    set: s.set, utc: d.toISOString(), ut1: tb.ut1Days, tt: tb.ttDays,
    dT: tb.deltaT.seconds, dTsig: tb.deltaT.sigma, dTmodel: tb.deltaT.model,
    bodies: pos.map((b) => [b.body, b.lon, b.lat, b.speed]),
  };
  // houses for every 5th instant, 2 sites rotating, all systems
  if (hi++ % 5 === 0) {
    rec.houses = [];
    for (let j = 0; j < 3; j++) {
      const [lat, lon] = SITES[(hi + j * 5) % SITES.length];
      const row = { lat, lon, sys: {} };
      for (const hs of SYSTEMS) {
        const c = E.natalChart({ utc: d.toISOString(), latitude: lat, longitude: lon, houseSystem: hs });
        if (!row.angles) {
          row.angles = c.angles; row.flags = c.flags;
          const pts = E.chartPoints({ utc: d.toISOString(), latitude: lat, longitude: lon });
          row.points = Object.fromEntries(pts.points.map((p) => [p.name ?? p.point ?? p.id, [p.lon ?? p.longitude, p.lat ?? p.latitude]]));
          row.cbodies = c.bodies.map((b) => [b.body, b.lon]);
        }
        row.sys[hs] = { cusps: c.houses ? c.houses.cusps : null, system: c.houses ? c.houses.system : null, flags: c.flags };
      }
      rec.houses.push(row);
    }
  }
  out.push(JSON.stringify(rec));
}
writeFileSync(process.argv[2], out.join("\n") + "\n");
console.log("instants", instants.length, "with houses", out.filter((l) => l.includes('"houses"')).length);
