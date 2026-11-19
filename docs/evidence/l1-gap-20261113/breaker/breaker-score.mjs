#!/usr/bin/env node
/*
 * The breaker's own rerun of the 240 L1 position vectors. Written without
 * reusing ../tools/score.mjs, and by other routes where the package has them:
 *
 *   default source   calc() of @zodiacs/engine/calc on the exact TT Julian
 *                    date (no rounding to a millisecond), with the receipt
 *                    bound read from the result's own `bounds.position`
 *                    rather than from src/calc-bounds.ts; and natalChart()
 *                    as the adapter calls it, to see the two agree
 *   DE440 source     natalChart() inside withEphemeris (positions() reads UTC
 *                    only, and calc() refuses inside withEphemeris, so there
 *                    is no receipt bound for this source)
 *
 * Separation is taken from unit vectors (cross and dot), not Vincenty's form.
 * It also reads the raw Horizons responses in conformance/sources/horizons-24
 * to confirm the request scale (TT) and how far the vectors' expected values
 * sit from the raw Horizons columns (the frame conversion).
 *
 *   node docs/evidence/l1-gap-20261113/breaker/breaker-score.mjs \
 *     --pack /path/to/de440-1790-2210.v2.zeph --sha256 <digest> --out <dir>
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const packPath = arg('pack');
const packDigest = arg('sha256');
const outDir = resolve(arg('out') ?? here);
const load = (name) => import(pathToFileURL(resolve(root, 'dist', name)).href);
const engine = await load('index.js');
const calcApi = await load('calc.js');
const de440 = await load('de440.js');
const packBytes = new Uint8Array(readFileSync(packPath));
const source = await de440.openDe440Pack(packBytes, { expectDigest: packDigest });

const vectorsPath = resolve(root, 'conformance/vectors/L1-positions.json');
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')).vectors;

const D2R = Math.PI / 180;
const unit = (lonDeg, latDeg) => {
  const l = lonDeg * D2R;
  const b = latDeg * D2R;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
};
const sepArcsec = (lon1, lat1, lon2, lat2) => {
  const a = unit(lon1, lat1);
  const b = unit(lon2, lat2);
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.atan2(Math.hypot(...cross), dot) / D2R) * 3600;
};
const dLonArcsec = (a, b) => {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d * 3600;
};

// Raw Horizons: the columns as served, by body and corpus instant order.
const RAW_DIR = resolve(root, 'conformance/sources/horizons-24');
const RAW_FILE = { Sun: 'Sun', Moon: 'Moon', Mercury: 'Mercury', Venus: 'Venus', Mars: 'MarsBary', Jupiter: 'JupiterBary', Saturn: 'SaturnBary', Uranus: 'UranusBary', Neptune: 'NeptuneBary', Pluto: 'PlutoBary' };
const raw = {};
const rawScale = {};
for (const [body, file] of Object.entries(RAW_FILE)) {
  const text = readFileSync(resolve(RAW_DIR, `${file}.txt`), 'utf8');
  rawScale[body] = /Date__\(TT\)__HR:MN/u.test(text) && /Start time\s+: .* TT/u.test(text);
  const rows = text.slice(text.indexOf('$$SOE') + 5, text.indexOf('$$EOE')).trim().split('\n');
  raw[body] = rows.map((row) => {
    const cells = row.split(',').map((cell) => cell.trim());
    return { lon: Number(cells[3]), lat: Number(cells[4]) };
  });
}
const corpus = JSON.parse(readFileSync(resolve(RAW_DIR, 'corpus-tt.json'), 'utf8')).cases;
const instantIndex = new Map(corpus.map((entry, index) => [entry.jdTt, index]));

const UNIX_JD = 2440587.5;
const HORIZONS_FETCH_JD = 2461306.5; // the end of 2026-09-22, the date the arbiter's responses were fetched (instant D4 is on that date)
const TODAY_JD = 2461357.5; // 2026-11-13 0h

const rows = [];
let calcVsChartMax = 0;
let deltaTSensitivityMax = 0;
let calcRefusedInside = 0;
for (const vector of vectors) {
  const { body, jd_tt: jd } = vector.input;
  const date = new Date(Math.round((jd - UNIX_JD) * 86_400_000));

  // Default source, exact Julian date, through calc().
  const viaCalc = calcApi.calc({ body, time: { jd, scale: 'tt' } });
  if (viaCalc.status !== 'ok') throw new Error(`${vector.id}: calc refused: ${viaCalc.reason}`);
  const bound = viaCalc.bounds.position;
  if (bound.unit !== 'arcsec') throw new Error(`${vector.id}: unexpected bound unit`);
  // Default source as the adapter calls it.
  const chart = engine.natalChart({ utc: date, timeScale: 'tt', timeKnown: false });
  const viaChart = chart.bodies.find((entry) => entry.body === body);
  calcVsChartMax = Math.max(calcVsChartMax, sepArcsec(viaCalc.lon, viaCalc.lat, viaChart.lon, viaChart.lat));
  // A fixed ΔT 300 s away must not move a geocentric place given on TT.
  const shifted = calcApi.calc({ body, time: { jd, scale: 'tt', deltaT: 300 } });
  deltaTSensitivityMax = Math.max(deltaTSensitivityMax, sepArcsec(viaCalc.lon, viaCalc.lat, shifted.lon, shifted.lat));

  // DE440 source.
  const packChart = engine.withEphemeris(source, () => engine.natalChart({ utc: date, timeScale: 'tt', timeKnown: false }));
  const viaPack = packChart.bodies.find((entry) => entry.body === body);
  try {
    const inside = engine.withEphemeris(source, () => calcApi.calc({ body, time: { jd, scale: 'tt' } }));
    if (inside.status !== 'ok') calcRefusedInside += 1;
  } catch {
    calcRefusedInside += 1;
  }

  const expected = vector.expected;
  const rawRow = raw[body][instantIndex.get(jd)];
  const score = (got) => {
    const dLon = dLonArcsec(got.lon, expected.lon);
    const dLat = (got.lat - expected.lat) * 3600;
    const angle = sepArcsec(got.lon, got.lat, expected.lon, expected.lat);
    return {
      dLon,
      dLat,
      angle,
      suite: Math.abs(dLon) <= vector.tolerance.lon.abs && Math.abs(dLat) <= vector.tolerance.lat.abs,
      lon30: Math.abs(dLon) <= 30,
      angle30: angle <= 30,
      receipt: angle <= bound.value,
      receiptLonOnly: Math.abs(dLon) <= bound.value,
    };
  };
  rows.push({
    id: vector.id,
    body,
    jd,
    afterHorizonsFetch: jd > HORIZONS_FETCH_JD,
    afterToday: jd > TODAY_JD,
    packEphemeris: packChart.ephemeris?.name,
    defaultEphemeris: chart.ephemeris?.name,
    receiptBound: bound.value,
    toleranceLon: vector.tolerance.lon.abs,
    toleranceLat: vector.tolerance.lat.abs,
    toleranceUnit: `${vector.tolerance.lon.unit}/${vector.tolerance.lat.unit}`,
    rawMinusVectorLon: rawRow ? dLonArcsec(rawRow.lon, expected.lon) : null,
    rawMinusVectorLat: rawRow ? (rawRow.lat - expected.lat) * 3600 : null,
    default: score(viaCalc),
    de440: score(viaPack),
    packMovedFromDefault: sepArcsec(viaPack.lon, viaPack.lat, viaChart.lon, viaChart.lat),
  });
}

const count = (list, test) => list.filter(test).length;
const maxOf = (list, pick) => list.reduce((best, row) => (Math.abs(pick(row)) > Math.abs(pick(best)) ? row : best));
const top = (list, pick) => {
  const row = maxOf(list, pick);
  return { arcsec: Number(Math.abs(pick(row)).toFixed(4)), id: row.id, body: row.body };
};
const tally = (list, name) => ({
  cases: list.length,
  suitePass: count(list, (row) => row[name].suite),
  lon30Pass: count(list, (row) => row[name].lon30),
  angle30Pass: count(list, (row) => row[name].angle30),
  receiptWholeAnglePass: count(list, (row) => row[name].receipt),
  receiptLongitudeOnlyPass: count(list, (row) => row[name].receiptLonOnly),
  largestLon: top(list, (row) => row[name].dLon),
  largestLat: top(list, (row) => row[name].dLat),
  largestAngle: top(list, (row) => row[name].angle),
  receiptWholeAngleFailures: list.filter((row) => !row[name].receipt).map((row) => `${row.id} ${row.body} ${row[name].angle.toFixed(3)} > ${row.receiptBound}`),
});
const bodies = [...new Set(rows.map((row) => row.body))];
const future = rows.filter((row) => row.afterHorizonsFetch);
const past = rows.filter((row) => !row.afterHorizonsFetch);
const summary = {
  node: process.version,
  engine: engine.ENGINE_VERSION,
  commit: arg('commit') ?? null,
  vectors: { sha256: createHash('sha256').update(readFileSync(vectorsPath)).digest('hex'), count: vectors.length },
  pack: { sha256: createHash('sha256').update(packBytes).digest('hex'), bytes: packBytes.length },
  tolerances: [...new Set(rows.map((row) => `${row.toleranceLon}/${row.toleranceLat} ${row.toleranceUnit}`))],
  rawHorizons: {
    everyFileOnTT: Object.values(rawScale).every(Boolean),
    largestRawMinusVectorLon: top(rows, (row) => row.rawMinusVectorLon ?? 0),
    largestRawMinusVectorLat: top(rows, (row) => row.rawMinusVectorLat ?? 0),
    rowsMatched: count(rows, (row) => row.rawMinusVectorLon !== null),
  },
  routes: {
    defaultCalcExactJdVsNatalChartMillisecondArcsec: calcVsChartMax,
    fixedDeltaT300sMovesDefaultPlaceByArcsec: deltaTSensitivityMax,
    calcRefusedInsideWithEphemeris: `${calcRefusedInside} of ${rows.length}`,
    packEphemerisNames: [...new Set(rows.map((row) => row.packEphemeris))],
    defaultEphemerisNames: [...new Set(rows.map((row) => row.defaultEphemeris))],
    smallestPackMoveFromDefaultArcsec: Math.min(...rows.map((row) => row.packMovedFromDefault)),
  },
  instants: {
    afterHorizonsFetch20260922: { cases: future.length, instants: new Set(future.map((row) => row.jd)).size },
    afterToday20261113: { cases: count(rows, (row) => row.afterToday) },
  },
  default: { all: tally(rows, 'default'), past: tally(past, 'default'), future: tally(future, 'default'), byBody: Object.fromEntries(bodies.map((body) => [body, tally(rows.filter((row) => row.body === body), 'default')])) },
  de440: { all: tally(rows, 'de440'), past: tally(past, 'de440'), future: tally(future, 'de440'), byBody: Object.fromEntries(bodies.map((body) => [body, tally(rows.filter((row) => row.body === body), 'de440')])) },
};

mkdirSync(outDir, { recursive: true });
const fixed = (value) => value.toFixed(4);
const lines = ['id\tbody\tjd_tt\tafter_fetch\tbound\tdef_dlon\tdef_dlat\tdef_angle\tdef_suite\tdef_lon30\tdef_receipt\tde440_dlon\tde440_dlat\tde440_angle\tde440_suite\tde440_lon30'];
for (const row of rows) {
  lines.push([row.id, row.body, row.jd, row.afterHorizonsFetch ? 'yes' : 'no', row.receiptBound, fixed(row.default.dLon), fixed(row.default.dLat), fixed(row.default.angle), row.default.suite ? 'pass' : 'FAIL', row.default.lon30 ? 'pass' : 'FAIL', row.default.receipt ? 'pass' : 'FAIL', fixed(row.de440.dLon), fixed(row.de440.dLat), fixed(row.de440.angle), row.de440.suite ? 'pass' : 'FAIL', row.de440.lon30 ? 'pass' : 'FAIL'].join('\t'));
}
writeFileSync(resolve(outDir, 'breaker-cases.tsv'), `${lines.join('\n')}\n`);
writeFileSync(resolve(outDir, 'breaker-summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
const brief = (name) => `${name}: suite ±1″ ${summary[name].all.suitePass}/240; lon 30″ ${summary[name].all.lon30Pass}/240; angle 30″ ${summary[name].all.angle30Pass}/240; receipt (angle) ${summary[name].all.receiptWholeAnglePass}/240; receipt (lon only) ${summary[name].all.receiptLongitudeOnlyPass}/240; max dlon ${summary[name].all.largestLon.arcsec} (${summary[name].all.largestLon.id}), dlat ${summary[name].all.largestLat.arcsec} (${summary[name].all.largestLat.id}), angle ${summary[name].all.largestAngle.arcsec} (${summary[name].all.largestAngle.id})`;
console.log(brief('default'));
console.log(brief('de440'));
console.log(JSON.stringify({ tolerances: summary.tolerances, rawHorizons: summary.rawHorizons, routes: summary.routes, instants: summary.instants, futureDefault: { suite: summary.default.future.suitePass, of: future.length }, futureDe440: { suite: summary.de440.future.suitePass, maxLon: summary.de440.future.largestLon }, pastDe440: { maxLon: summary.de440.past.largestLon }, defaultReceiptFailures: summary.default.all.receiptWholeAngleFailures }, null, 1));
