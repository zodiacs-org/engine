#!/usr/bin/env node
/*
 * Rerun the 240 L1 position vectors through the built engine and score every
 * case against each published limit.
 *
 *   npm run build
 *   node docs/evidence/l1-gap-20261113/tools/score.mjs \
 *     --pack /path/to/de440-1790-2210.v2.zeph --sha256 <the pack's SHA-256> \
 *     [--out docs/evidence/l1-gap-20261113/results]
 *
 * Two sources are run on the same build (../../../../dist):
 *   default  natalChart as shipped (astronomy-engine)
 *   de440    natalChart inside withEphemeris, on a DE440 pack opened with
 *            @zodiacs/engine/de440 (the pack is the caller's; none is shipped)
 * Without --pack only the default source is run.
 *
 * The expected values are the vectors' own (Horizons DE441, carried into the
 * IAU 2006/2000A true ecliptic of date by conformance/arbiters/l1/build.py).
 * Nothing here is taken from the engine's output except what is being scored.
 * The instants are TT on both sides (Horizons was asked with TIME_TYPE TT, the
 * engine is called with timeScale "tt"), so no ΔT enters the comparison.
 *
 * Limits scored, per case:
 *   suite     |Δlon| ≤ 1″ on the circle and |Δlat| ≤ 1″ (the vector's tolerance)
 *   lon30     |Δlon| ≤ 30″, longitude only
 *   receipt   whole-angle separation ≤ the body's "geocentric/apparent" row of
 *             src/calc-bounds.ts (measured on the default source; read here
 *             from the source file)
 * Writes cases.json, summary.json and cases.md.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
};
const packPath = option('pack');
const packDigest = option('sha256');
const outDir = resolve(option('out', resolve(here, '../results')));
if (Boolean(packPath) !== Boolean(packDigest)) {
  console.error('score.mjs: give --pack and --sha256 together');
  process.exit(2);
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const load = (name) => import(pathToFileURL(resolve(root, 'dist', name)).href);
const engine = await load('index.js');

const vectorsPath = resolve(root, 'conformance/vectors/L1-positions.json');
const suite = JSON.parse(readFileSync(vectorsPath, 'utf8'));
const vectors = suite.vectors;

// The receipt bounds, from the source file the package's bounds are built from.
const boundsPath = resolve(root, 'src/calc-bounds.ts');
const boundsText = readFileSync(boundsPath, 'utf8');
const block = /"geocentric\/apparent": (\{[^}]*\})/u.exec(boundsText);
if (!block) throw new Error('no geocentric/apparent rows in src/calc-bounds.ts');
const RECEIPT = Object.fromEntries(Object.entries(JSON.parse(block[1])).map(([body, row]) => [body, row[0]]));
const RECEIPT_BASIS = /MEASURED_BASIS = "([^"]*)"/u.exec(boundsText)[1];

const RAD = Math.PI / 180;
const ARCSEC = 3600;
const UNIX_EPOCH_JD = 2440587.5;
const dateOfJd = (jd) => new Date(Math.round((jd - UNIX_EPOCH_JD) * 86_400_000));
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

const sources = [{ name: 'default', ephemeris: `${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version}`, run: (fn) => fn() }];
if (packPath) {
  const de440 = await load('de440.js');
  const source = await de440.openDe440Pack(new Uint8Array(readFileSync(resolve(packPath))), { expectDigest: packDigest });
  sources.push({ name: 'de440', ephemeris: `${source.ephemeris.name} ${source.ephemeris.version}`, run: (fn) => engine.withEphemeris(source, fn) });
}

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
const largest = (list, key) => list.reduce((best, item) => (Math.abs(item.value[key]) > Math.abs(best.value[key]) ? item : best));
function tally(sourceName, list) {
  const rows = list.map((entry) => ({ id: entry.id, value: entry[sourceName] }));
  const top = (key) => {
    const hit = largest(rows, key);
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
  engine: `@zodiacs/engine ${engine.ENGINE_VERSION}`,
  node: process.version,
  vectors: { path: 'conformance/vectors/L1-positions.json', sha256: sha256(vectorsPath), count: vectors.length },
  bounds: { path: 'src/calc-bounds.ts', sha256: sha256(boundsPath), rows: 'geocentric/apparent', basis: RECEIPT_BASIS, arcsec: Object.fromEntries(bodies.map((body) => [body, RECEIPT[body]])) },
  pack: packPath ? { sha256: sha256(resolve(packPath)), bytes: readFileSync(resolve(packPath)).length } : null,
  timeScale: 'TT on both sides; no ΔT enters',
  limits: {
    suite: '|Δlon| ≤ 1″ on the circle and |Δlat| ≤ 1″',
    lon30: '|Δlon| ≤ 30″, longitude only',
    receipt: 'whole-angle separation ≤ the body\'s geocentric/apparent row of src/calc-bounds.ts (measured on the default source)',
  },
  sources: Object.fromEntries(sources.map((source) => [source.name, {
    ephemeris: source.ephemeris,
    all: tally(source.name, cases),
    byBody: Object.fromEntries(bodies.map((body) => [body, tally(source.name, cases.filter((entry) => entry.body === body))])),
  }])),
};

const yes = (flag) => (flag ? 'pass' : 'FAIL');
const fixed = (value) => value.toFixed(3);
const md = [];
md.push('# The 240 L1 cases, scored');
md.push('');
md.push('Written by `tools/score.mjs`; do not edit by hand. Differences are engine minus Horizons (DE441, IAU 2006/2000A true ecliptic of date), in arcseconds; "angle" is the whole-angle separation. "suite" is ±1″ in longitude and in latitude, "lon 30″" is longitude only, "receipt" is the angle against the body\'s `geocentric/apparent` bound in `src/calc-bounds.ts`, which was measured on the default source.');
md.push('');
for (const source of sources) {
  md.push(`## Source: ${source.name} (${source.ephemeris.replace(/([0-9a-f]{12})[0-9a-f]{52}/u, '$1…')})`);
  md.push('');
  md.push('| id | body | TT | Δlon | Δlat | angle | suite ±1″ | lon 30″ | receipt bound | receipt |');
  md.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |');
  for (const entry of cases) {
    const value = entry[source.name];
    md.push(`| ${entry.id} | ${entry.body} | ${entry.tt.slice(0, 19)} | ${fixed(value.dLonArcsec)} | ${fixed(value.dLatArcsec)} | ${fixed(value.angleArcsec)} | ${yes(value.suite)} | ${yes(value.lon30)} | ${entry.receiptBoundArcsec} | ${yes(value.receipt)} |`);
  }
  md.push('');
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'cases.json'), `${JSON.stringify(cases, null, 1)}\n`);
writeFileSync(resolve(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(resolve(outDir, 'cases.md'), `${md.join('\n')}`);

for (const source of sources) {
  const all = summary.sources[source.name].all;
  console.log(`${source.name}: suite ±1″ ${all.suitePass}/${all.cases}; longitude 30″ ${all.lon30Pass}/${all.cases}; receipt bound ${all.receiptPass}/${all.cases}; largest Δlon ${fixed(all.largestLon.arcsec)}″ (${all.largestLon.id}), Δlat ${fixed(all.largestLat.arcsec)}″ (${all.largestLat.id}), angle ${fixed(all.largestAngle.arcsec)}″ (${all.largestAngle.id})`);
}
