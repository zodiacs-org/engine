#!/usr/bin/env node
/*
 * The 240 L1 position vectors, run as a consumer of the installed package
 * runs them, and scored against each published limit.
 *
 * This file is copied into a directory where `npm install <the tarball>` has
 * been run (l1-installed.sh does that) and started there, so that the two
 * imports below resolve to node_modules/@zodiacs/engine, the packed package,
 * and to nothing in a checkout. It reads no environment variable and is given
 * no pack. The run that counts is the first: a plain natalChart call, with
 * nothing opened and nothing set, as an application makes it.
 *
 *   node l1-installed.mjs --vectors <L1-positions.json> --bounds <calc-bounds.ts> --out <directory>
 *
 * Three runs on the same installed package, in this order:
 *   plain     natalChart, outside withEphemeris, before anything else has
 *             been called: the default source
 *   shipped   natalChart inside withEphemeris, on openShippedDe440Pack()
 *             of @zodiacs/engine/de440/pack
 *   fallback  natalChart after setDefaultEphemeris("astronomy-engine"):
 *             astronomy-engine, the engine's fallback
 * Then, back on the default source (1.1.0-rc.10 puts them on it):
 *   calc      calc({ body, time: { jd, scale: "tt" } }) of @zodiacs/engine/calc,
 *             scored as the others, and compared with the plain natalChart
 *             position bit for bit
 *   window    birthWindow of @zodiacs/engine/window over the minute around
 *             each instant: the sign its cell gives the body, against the
 *             sign of Horizons's longitude and against natalChart's
 *
 * The expected values are the vectors' own (JPL Horizons, DE441, carried into
 * the IAU 2006/2000A true ecliptic of date by conformance/arbiters/l1/build.py).
 * Nothing is taken from the engine's output except what is being scored. The
 * instants are TT on both sides, so no ΔT model enters.
 *
 * Limits scored, per case:
 *   suite     |Δlon| ≤ 1″ on the circle and |Δlat| ≤ 1″ (the vector's tolerance)
 *   lon30     |Δlon| ≤ 30″, longitude only (the public bound, as ZOD-97 read it)
 *   receipt   whole-angle separation ≤ the body's "geocentric/apparent" row
 *             of src/calc-bounds.ts, read from the file given with --bounds.
 *             Those bounds were measured on astronomy-engine and calc()
 *             computes on astronomy-engine, so no receipt carries them for
 *             a DE440 position; they are scored for the first two runs only
 *             to show where those stand against them.
 * Writes cases.json, summary.json and cases.md into --out.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from '@zodiacs/engine';
import { DE440_PACK, de440PackBytes, openShippedDe440Pack } from '@zodiacs/engine/de440/pack';
import { calc } from '@zodiacs/engine/calc';
import { birthWindow } from '@zodiacs/engine/window';
import { timeBasis } from '@zodiacs/engine/time';

const option = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) {
    console.error('usage: l1-installed.mjs --vectors <file> --bounds <file> --out <directory>');
    process.exit(2);
  }
  return resolve(process.argv[index + 1]);
};
const vectorsPath = option('vectors');
const boundsPath = option('bounds');
const outDir = option('out');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The installed package's directory: its root entry is dist/index.js.
const installed = dirname(dirname(fileURLToPath(import.meta.resolve('@zodiacs/engine'))));
const manifest = JSON.parse(readFileSync(resolve(installed, 'package.json'), 'utf8'));
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8')).vectors;

const boundsText = readFileSync(boundsPath, 'utf8');
const block = /"geocentric\/apparent": (\{[^}]*\})/u.exec(boundsText);
if (!block) throw new Error('no geocentric/apparent rows in the bounds file');
const RECEIPT = Object.fromEntries(Object.entries(JSON.parse(block[1])).map(([body, row]) => [body, row[0]]));

const RAD = Math.PI / 180;
const ARCSEC = 3600;
const dateOfJd = (jd) => new Date(Math.round((jd - 2440587.5) * 86_400_000));
/** Signed difference a − b on the circle, in degrees, in (−180, 180]. */
const wrap = (a, b) => {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
};
/** Angle between two directions given by longitude and latitude, in degrees (Vincenty's form). */
function separation(lon1, lat1, lon2, lat2) {
  const dl = (lon2 - lon1) * RAD;
  const p1 = lat1 * RAD;
  const p2 = lat2 * RAD;
  const y = Math.hypot(Math.cos(p2) * Math.sin(dl), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  const x = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.atan2(y, x) / RAD;
}

// Each run is a pass over all the vectors, so that the plain pass is made
// before the pack entry is touched or the default is set.
const packName = `jpl-de440 ${DE440_PACK.sha256}`;
let shipped = null;
const sources = [
  { name: 'plain', ephemeris: `the default source (${packName} inside its years)`, before: () => {}, run: (fn) => fn() },
  { name: 'shipped', ephemeris: packName, before: async () => { shipped = await openShippedDe440Pack(); }, run: (fn) => engine.withEphemeris(shipped, fn) },
  { name: 'fallback', ephemeris: `${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version}`, before: () => engine.setDefaultEphemeris('astronomy-engine'), run: (fn) => fn() },
];

const round = (value, digits) => Number(value.toFixed(digits));
const cases = vectors.map((vector) => {
  const { body, jd_tt: jdTt } = vector.input;
  return { id: vector.id, body, jd_tt: jdTt, tt: dateOfJd(jdTt).toISOString().replace('Z', ' TT'), receiptBoundArcsec: RECEIPT[body] };
});
for (const source of sources) {
  await source.before();
  for (const [index, vector] of vectors.entries()) {
    const { body } = vector.input;
    const entry = cases[index];
    const date = dateOfJd(vector.input.jd_tt);
    {
    const chart = source.run(() => engine.natalChart({ utc: date, timeScale: 'tt', timeKnown: false }));
    const found = chart.bodies.find((candidate) => candidate.body === body);
    const dLon = wrap(found.lon, vector.expected.lon) * ARCSEC;
    const dLat = (found.lat - vector.expected.lat) * ARCSEC;
    const angle = separation(found.lon, found.lat, vector.expected.lon, vector.expected.lat) * ARCSEC;
    entry[source.name] = {
      ephemeris: chart.ephemeris?.name ?? engine.EPHEMERIS.name,
      lon: found.lon,
      lat: found.lat,
      dLonArcsec: round(dLon, 6),
      dLatArcsec: round(dLat, 6),
      angleArcsec: round(angle, 6),
      suite: Math.abs(dLon) <= vector.tolerance.lon.abs && Math.abs(dLat) <= vector.tolerance.lat.abs,
      lon30: Math.abs(dLon) <= 30,
      receipt: angle <= RECEIPT[body],
    };
    }
  }
}

// calc() and birthWindow, on the default source again.
engine.setDefaultEphemeris('de440');
const signOf = (lon) => Math.floor((((lon % 360) + 360) % 360) / 30);
const SIGNS = engine.SIGN_SLUGS;
const windowRun = { cases: vectors.length, signIsHorizons: 0, signIsNatalChart: 0, ephemeris: new Set(), flags: new Set(), differences: [] };
let calcIdentical = 0;
for (const [index, vector] of vectors.entries()) {
  const { body } = vector.input;
  const entry = cases[index];
  const found = calc({ body, time: { jd: vector.input.jd_tt, scale: 'tt' } });
  if (found.status !== 'ok') throw new Error(`calc refused ${vector.id}: ${found.reason}`);
  const dLon = wrap(found.lon, vector.expected.lon) * ARCSEC;
  const dLat = (found.lat - vector.expected.lat) * ARCSEC;
  const angle = separation(found.lon, found.lat, vector.expected.lon, vector.expected.lat) * ARCSEC;
  entry.calc = {
    ephemeris: found.receipt.engine.ephemeris.name,
    flags: found.flags,
    lon: found.lon,
    lat: found.lat,
    dLonArcsec: round(dLon, 6),
    dLatArcsec: round(dLat, 6),
    angleArcsec: round(angle, 6),
    suite: Math.abs(dLon) <= vector.tolerance.lon.abs && Math.abs(dLat) <= vector.tolerance.lat.abs,
    lon30: Math.abs(dLon) <= 30,
    receipt: found.bounds.position.value !== null && angle <= found.bounds.position.value,
    quotedBoundArcsec: found.bounds.position.value,
  };
  // calc() reads the Julian date itself, and natalChart a Date, a whole millisecond; so the two are compared at
  // the UTC millisecond nearest the vector's instant, which both read as the same Date.
  const date = dateOfJd(vector.input.jd_tt);
  const utc = Math.round(timeBasis(date.getTime(), 'tt').utcMs);
  const row = engine.natalChart({ utc: new Date(utc), timeKnown: false }).bodies.find((candidate) => candidate.body === body);
  const same = calc({ body, time: new Date(utc) });
  if (same.lon === row.lon && same.lat === row.lat && same.speeds.lon === row.speed) calcIdentical += 1;
  // The window: the minute around that instant, at a synthetic place.
  const window = birthWindow({ start: new Date(utc - 30_000), end: new Date(utc + 30_000), latitude: 10, longitude: 20 });
  const cell = window.cells.find((candidate) => candidate.start.getTime() <= utc && utc < candidate.end.getTime());
  const sign = cell.features.signs[body];
  windowRun.ephemeris.add(window.ephemeris.name);
  for (const flag of window.flags) windowRun.flags.add(flag);
  const natal = engine.natalChart({ utc: new Date(utc), timeKnown: false }).bodies.find((candidate) => candidate.body === body).sign;
  if (sign === SIGNS[signOf(vector.expected.lon)]) windowRun.signIsHorizons += 1;
  else windowRun.differences.push({ id: vector.id, window: sign, horizons: SIGNS[signOf(vector.expected.lon)], horizonsLon: vector.expected.lon });
  if (sign === natal) windowRun.signIsNatalChart += 1;
  entry.window = { sign, horizonsSign: SIGNS[signOf(vector.expected.lon)], natalChartSign: natal };
}
windowRun.ephemeris = [...windowRun.ephemeris];
windowRun.flags = [...windowRun.flags];

const bodies = [...new Set(vectors.map((vector) => vector.input.body))];
function tally(sourceName, list) {
  const rows = list.map((entry) => ({ id: entry.id, value: entry[sourceName] }));
  const top = (key) => {
    const hit = rows.reduce((best, item) => (Math.abs(item.value[key]) > Math.abs(best.value[key]) ? item : best));
    return { arcsec: Math.abs(hit.value[key]), id: hit.id };
  };
  return {
    cases: rows.length,
    suitePass: rows.filter((row) => row.value.suite).length,
    lon30Pass: rows.filter((row) => row.value.lon30).length,
    receiptPass: rows.filter((row) => row.value.receipt).length,
    largestLon: top('dLonArcsec'),
    largestLat: top('dLatArcsec'),
    largestAngle: top('angleArcsec'),
    suiteFailures: rows.filter((row) => !row.value.suite).map((row) => row.id),
    lon30Failures: rows.filter((row) => !row.value.lon30).map((row) => row.id),
    receiptFailures: rows.filter((row) => !row.value.receipt).map((row) => row.id),
  };
}

const summary = {
  package: `${manifest.name} ${manifest.version}`,
  engineVersion: engine.ENGINE_VERSION,
  importedFrom: installed.endsWith('/node_modules/@zodiacs/engine') ? 'node_modules/@zodiacs/engine of the directory this script ran in' : installed,
  node: process.version,
  environment: Object.keys(process.env).filter((name) => /^ZODIACS_/u.test(name)),
  vectors: { file: 'conformance/vectors/L1-positions.json', sha256: sha256(readFileSync(vectorsPath)), count: vectors.length },
  bounds: { file: 'src/calc-bounds.ts', sha256: sha256(readFileSync(boundsPath)), rows: 'geocentric/apparent', arcsec: Object.fromEntries(bodies.map((body) => [body, RECEIPT[body]])) },
  shippedPack: { described: DE440_PACK, sha256OfBytes: sha256(de440PackBytes()), bytes: de440PackBytes().byteLength },
  timeScale: 'TT on both sides; no ΔT enters',
  limits: {
    suite: '|Δlon| ≤ 1″ on the circle and |Δlat| ≤ 1″',
    lon30: '|Δlon| ≤ 30″, longitude only',
    receipt: "whole-angle separation ≤ the body's geocentric/apparent row of src/calc-bounds.ts (measured on astronomy-engine)",
  },
  calc: {
    what: 'calc({ body, time: { jd, scale: "tt" } }) on the default source, scored as the sources below; receiptPass is the angle against the bound the result itself quotes',
    ephemeris: [...new Set(cases.map((entry) => entry.calc.ephemeris))],
    flags: [...new Set(cases.flatMap((entry) => entry.calc.flags))],
    all: tally('calc', cases),
    longitudeLatitudeAndSpeedIdenticalToNatalChart: `${calcIdentical} of ${cases.length}`,
  },
  birthWindow: {
    what: "the sign birthWindow's cell gives the vector's body at the vector's instant, in a window of one minute around it",
    ...windowRun,
  },
  sources: Object.fromEntries(sources.map((source) => [source.name, {
    ephemeris: source.ephemeris,
    all: tally(source.name, cases),
    byBody: Object.fromEntries(bodies.map((body) => [body, tally(source.name, cases.filter((entry) => entry.body === body))])),
  }])),
};

const yes = (flag) => (flag ? 'pass' : 'FAIL');
const fixed = (value, digits) => value.toFixed(digits);
const md = [];
md.push('# The 240 L1 cases on the installed package, scored');
md.push('');
md.push(`Written by \`tools/l1-installed.mjs\` on ${manifest.name} ${manifest.version} as installed from its tarball; do not edit by hand. Differences are engine minus Horizons (DE441, IAU 2006/2000A true ecliptic of date), in arcseconds; "angle" is the whole-angle separation. "suite" is ±1″ in longitude and in latitude, "lon 30″" is longitude only, "receipt" is the angle against the body's \`geocentric/apparent\` bound in \`src/calc-bounds.ts\`, which was measured on astronomy-engine.`);
md.push('');
for (const source of sources) {
  const digits = source.name === 'fallback' ? 3 : 4;
  md.push(`## Source: ${source.name} (${source.ephemeris.replace(/([0-9a-f]{12})[0-9a-f]{52}/u, '$1…')})`);
  md.push('');
  md.push('| id | body | TT | Δlon | Δlat | angle | suite ±1″ | lon 30″ | receipt bound | receipt |');
  md.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |');
  for (const entry of cases) {
    const value = entry[source.name];
    md.push(`| ${entry.id} | ${entry.body} | ${entry.tt.slice(0, 19)} | ${fixed(value.dLonArcsec, digits)} | ${fixed(value.dLatArcsec, digits)} | ${fixed(value.angleArcsec, digits)} | ${yes(value.suite)} | ${yes(value.lon30)} | ${entry.receiptBoundArcsec} | ${yes(value.receipt)} |`);
  }
  md.push('');
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'cases.json'), `${JSON.stringify(cases, null, 1)}\n`);
writeFileSync(resolve(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(resolve(outDir, 'cases.md'), md.join('\n'));

console.log(`${manifest.name} ${manifest.version}, installed; node ${process.version}; ZODIACS_* variables set: ${summary.environment.length}`);
{
  const all = summary.calc.all;
  console.log(`calc(): suite ±1″ ${all.suitePass}/${all.cases}; within its own quoted bound ${all.receiptPass}/${all.cases}; largest Δlon ${fixed(all.largestLon.arcsec, 4)}″ (${all.largestLon.id}), Δlat ${fixed(all.largestLat.arcsec, 4)}″ (${all.largestLat.id}), angle ${fixed(all.largestAngle.arcsec, 4)}″ (${all.largestAngle.id}); ephemeris ${summary.calc.ephemeris.join(', ')}; flags [${summary.calc.flags.join(', ')}]; longitude, latitude and speed identical to natalChart's: ${summary.calc.longitudeLatitudeAndSpeedIdenticalToNatalChart}`);
  const w = summary.birthWindow;
  console.log(`birthWindow: the body's sign is the sign of Horizons's longitude ${w.signIsHorizons}/${w.cases}, and natalChart's ${w.signIsNatalChart}/${w.cases}; ephemeris ${w.ephemeris.join(', ')}; flags [${w.flags.join(', ')}]`);
}
for (const source of sources) {
  const all = summary.sources[source.name].all;
  console.log(`${source.name}: suite ±1″ ${all.suitePass}/${all.cases}; longitude 30″ ${all.lon30Pass}/${all.cases}; receipt bound ${all.receiptPass}/${all.cases}; largest Δlon ${fixed(all.largestLon.arcsec, 4)}″ (${all.largestLon.id}), Δlat ${fixed(all.largestLat.arcsec, 4)}″ (${all.largestLat.id}), angle ${fixed(all.largestAngle.arcsec, 4)}″ (${all.largestAngle.id})`);
}
// The claim: a plain call passes every vector, and every one of its charts names the pack.
if (summary.sources.plain.all.suitePass !== vectors.length || cases.some((entry) => entry.plain.ephemeris !== 'jpl-de440')) process.exit(1);
