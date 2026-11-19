// Breaker: how far calc(), chart() and birthWindow are from positions()/natalChart() on the installed package.
import * as root from '@zodiacs/engine';
import { calc, chart } from '@zodiacs/engine/calc';
import { birthWindow } from '@zodiacs/engine/window';

// A small fixed generator, so the run repeats.
let s = 20261114;
const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const T0 = Date.UTC(1800, 0, 2), T1 = Date.UTC(2199, 11, 30);
const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node', 'South Node'];
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const N = Number(process.argv[2] ?? 2000);
const max = { lon: 0, lat: 0, speed: 0 };
const worst = {};
let rows = 0, bitIdentical = 0, notOk = 0;
const eph = new Set(), flags = new Set();
const instants = [T0, T1, Date.UTC(1800, 0, 1), Date.UTC(2199, 11, 31, 23, 59), Date.UTC(1972, 5, 30, 23, 59, 59), Date.UTC(2016, 11, 31, 23, 59, 59, 500)];
while (instants.length < N) instants.push(Math.floor(T0 + rnd() * (T1 - T0)));
for (const ms of instants) {
  const date = new Date(ms);
  const pos = root.positions(date);
  for (const body of BODIES) {
    const c = calc({ body, time: date });
    if (c.status !== 'ok') { notOk += 1; continue; }
    const p = pos.find((r) => r.body === body);
    const d = { lon: Math.abs(wrap(c.lon - p.lon)) * 3600, lat: Math.abs(c.lat - p.lat) * 3600, speed: Math.abs(c.speeds.lon - p.speed) * 3600 };
    rows += 1;
    if (c.lon === p.lon && c.lat === p.lat && c.speeds.lon === p.speed) bitIdentical += 1;
    for (const k of Object.keys(max)) if (d[k] > max[k]) { max[k] = d[k]; worst[k] = { body, at: date.toISOString(), calc: c.lon, positions: p.lon }; }
    eph.add(c.receipt.engine.ephemeris.name + '|' + p.ephemeris);
    for (const f of c.flags) flags.add(f);
  }
}
console.log(JSON.stringify({ what: 'calc() vs positions(), default call, arcsec', instants: instants.length, rows, notOk, bitIdentical, max, worst, ephemerisPairs: [...eph], calcFlags: [...flags] }, null, 1));

// chart() against natalChart()
let chartSame = 0, chartN = 0;
for (const ms of instants.slice(0, 300)) {
  const place = { latitude: -60 + rnd() * 120, longitude: -180 + rnd() * 360 };
  const a = chart({ time: new Date(ms), place });
  const b = root.natalChart({ utc: new Date(ms), ...place });
  chartN += 1;
  if (a.status === 'ok' && JSON.stringify(a.chart.bodies) === JSON.stringify(b.bodies) && JSON.stringify(a.chart.angles) === JSON.stringify(b.angles) && JSON.stringify(a.chart.houses) === JSON.stringify(b.houses)) chartSame += 1;
}
console.log(JSON.stringify({ what: 'chart() bodies, angles and houses equal natalChart() as JSON', charts: chartN, same: chartSame }));

// birthWindow: at random instants inside random two-hour windows, the cell's sign for each body against natalChart's.
let cellsChecked = 0, signSame = 0, signRows = 0, ascSame = 0, ascRows = 0;
const diffs = [];
const wEph = new Set(), wFlags = new Set();
const W = Number(process.argv[3] ?? 150);
for (let i = 0; i < W; i += 1) {
  const start = Math.floor((T0 + rnd() * (T1 - T0 - 7.2e6)) / 1000) * 1000;
  const place = { latitude: -60 + rnd() * 120, longitude: -180 + rnd() * 360 };
  let w;
  try { w = birthWindow({ start: new Date(start), end: new Date(start + 7.2e6), ...place }); } catch (e) { diffs.push({ threw: String(e), start: new Date(start).toISOString() }); continue; }
  wEph.add(w.ephemeris.name); for (const f of w.flags) wFlags.add(f);
  for (let k = 0; k < 8; k += 1) {
    const t = start + Math.floor(rnd() * 7.2e6);
    const cell = w.cells.find((c) => c.start.getTime() <= t && t < c.end.getTime());
    if (!cell) continue;
    cellsChecked += 1;
    const natal = root.natalChart({ utc: new Date(t), ...place });
    for (const body of BODIES) {
      const sign = cell.features.signs[body];
      if (sign === undefined) continue;
      signRows += 1;
      if (sign === natal.bodies.find((r) => r.body === body).sign) signSame += 1; else diffs.push({ at: new Date(t).toISOString(), body, window: sign, natal: natal.bodies.find((r) => r.body === body).sign });
    }
    const asc = cell.features.signs.Ascendant ?? cell.features.ascendantSign ?? cell.features.angles?.asc;
    if (asc !== undefined && natal.angles) { ascRows += 1; if (asc === root.signForLongitude(natal.angles.asc).slug) ascSame += 1; else diffs.push({ at: new Date(t).toISOString(), asc, natal: root.signForLongitude(natal.angles.asc).slug }); }
  }
}
console.log(JSON.stringify({ what: 'birthWindow cell signs vs natalChart at random instants', windows: W, cellsChecked, signRows, signSame, ascRows, ascSame, ephemeris: [...wEph], flags: [...wFlags], differences: diffs.slice(0, 10), featureKeys: Object.keys(birthWindow({ start: new Date(Date.UTC(1990, 3, 15, 8)), end: new Date(Date.UTC(1990, 3, 15, 9)), latitude: 10, longitude: 20 }).cells[0].features) }, null, 1));

// For scale: the same instants with the caller's choice of astronomy-engine, against the default positions.
const def = instants.slice(0, 400).map((ms) => root.positions(new Date(ms)));
root.setDefaultEphemeris('astronomy-engine');
let aeMax = 0, aeWorst = null;
instants.slice(0, 400).forEach((ms, i) => {
  for (const body of BODIES) {
    const c = calc({ body, time: new Date(ms) });
    const d = Math.abs(wrap(c.lon - def[i].find((r) => r.body === body).lon)) * 3600;
    if (d > aeMax) { aeMax = d; aeWorst = { body, at: new Date(ms).toISOString() }; }
  }
});
console.log(JSON.stringify({ what: 'for scale: calc() on astronomy-engine (as 1.1.0-rc.9 computed it) vs default positions(), 400 instants, arcsec longitude', max: aeMax, worst: aeWorst }));
