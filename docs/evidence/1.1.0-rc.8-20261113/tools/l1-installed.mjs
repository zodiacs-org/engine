#!/usr/bin/env node
/*
 * The 240 L1 position vectors, run as a consumer of the installed package
 * runs them, and scored against each published limit.
 *
 * This file is copied into a directory where `npm install <the tarball>` has
 * been run (l1-installed.sh does that) and started there, so that the two
 * imports below resolve to node_modules/@zodiacs/engine, the packed package,
 * and to nothing in a checkout. It reads no environment variable and is given
 * no pack: the DE440 source is the one the package ships.
 *
 *   node l1-installed.mjs --vectors <L1-positions.json> --bounds <calc-bounds.ts> --out <directory>
 *
 * Two sources are run on the same installed package:
 *   shipped  natalChart inside withEphemeris, on openShippedDe440Pack()
 *            of @zodiacs/engine/de440/pack
 *   root     natalChart outside withEphemeris (astronomy-engine), what the
 *            root computes when no source is installed
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
 *             refuses inside withEphemeris, so no receipt carries them for
 *             the shipped source; they are scored for it only to show where
 *             it stands against them.
 * Writes cases.json, summary.json and cases.md into --out.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import * as engine from '@zodiacs/engine';
import { DE440_PACK, de440PackBytes, openShippedDe440Pack } from '@zodiacs/engine/de440/pack';

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
const installed = dirname(createRequire(import.meta.url).resolve('@zodiacs/engine/package.json'));
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

const shipped = await openShippedDe440Pack();
const sources = [
  { name: 'shipped', ephemeris: `${shipped.ephemeris.name} ${shipped.ephemeris.version}`, run: (fn) => engine.withEphemeris(shipped, fn) },
  { name: 'root', ephemeris: `${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version}`, run: (fn) => fn() },
];

const round = (value, digits) => Number(value.toFixed(digits));
const cases = vectors.map((vector) => {
  const { body, jd_tt: jdTt } = vector.input;
  const date = dateOfJd(jdTt);
  const entry = { id: vector.id, body, jd_tt: jdTt, tt: date.toISOString().replace('Z', ' TT'), receiptBoundArcsec: RECEIPT[body] };
  for (const source of sources) {
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
  return entry;
});

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
  importedFrom: 'node_modules/@zodiacs/engine of the directory this script ran in',
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
  const digits = source.name === 'shipped' ? 4 : 3;
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
for (const source of sources) {
  const all = summary.sources[source.name].all;
  console.log(`${source.name}: suite ±1″ ${all.suitePass}/${all.cases}; longitude 30″ ${all.lon30Pass}/${all.cases}; receipt bound ${all.receiptPass}/${all.cases}; largest Δlon ${fixed(all.largestLon.arcsec, 4)}″ (${all.largestLon.id}), Δlat ${fixed(all.largestLat.arcsec, 4)}″ (${all.largestLat.id}), angle ${fixed(all.largestAngle.arcsec, 4)}″ (${all.largestAngle.id})`);
}
if (summary.sources.shipped.all.suitePass !== vectors.length) process.exit(1);
