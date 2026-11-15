#!/usr/bin/env node
/*
 * Fix-round breaker's run of the 240 L1 position vectors on the package as
 * installed from its tarball. Written apart from the builder's
 * tools/l1-installed.mjs. It is copied into the consumer directory and
 * started there, one new process for each mode, so that no mode can leave a
 * setting behind for the next.
 *
 *   node fix-breaker-l1.mjs <mode> <L1-positions.json> <out directory>
 *
 * Modes:
 *   plain        natalChart({ utc, timeScale: "tt" }) from the root, the
 *                first thing the process does after the import. Nothing is
 *                opened, set or supplied.
 *   plain-utc    the same instants asked on the default UTC path (no
 *                timeScale), the UTC instant found from the chart's own
 *                deltaT. It shows that the default clock path uses the same
 *                source; it is not an independent check of deltaT.
 *   positions    root positions(date) on the UTC instant of plain-utc
 *                (longitude and latitude only).
 *   caller-async withEphemeris(await openShippedDe440Pack(), ...): the
 *                caller-opened path of the withdrawn 1.1.0-rc.8.
 *   caller-sync  withEphemeris(shippedDe440Source(), ...).
 *   fallback     after setDefaultEphemeris("astronomy-engine").
 *   no-atob      globalThis.atob deleted before the import: the pack cannot
 *                be decoded.
 *
 * Expected values are the vectors' (JPL Horizons). Limits are each vector's
 * own (1 arcsecond in longitude on the circle and in latitude).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [mode, vectorsArg, outArg] = process.argv.slice(2);
const zodiacsEnv = Object.keys(process.env).filter((k) => /^ZODIACS/i.test(k));
if (mode === 'no-atob') delete globalThis.atob;
const root = await import('@zodiacs/engine');
const vectorsBytes = readFileSync(resolve(vectorsArg));
const vectors = JSON.parse(vectorsBytes).vectors;

const arcsecOnCircle = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d * 3600; };
const ttMs = (v) => Math.round((v.input.jd_tt - 2440587.5) * 86400000);
const fromChart = (chart, v) => {
  const b = chart.bodies.find((x) => x.body === v.input.body);
  return { lon: b.lon, lat: b.lat, ephemeris: chart.ephemeris ? `${chart.ephemeris.name}@${chart.ephemeris.version.slice(0, 8)}` : 'absent' };
};
const tt = (v) => fromChart(root.natalChart({ utc: new Date(ttMs(v)), timeScale: 'tt', timeKnown: false }), v);
const utcMsOf = (v) => {
  // TT = UTC + deltaT, with the engine's own deltaT at the instant; two rounds settle it.
  let ms = ttMs(v);
  for (let i = 0; i < 3; i += 1) ms = Math.round(ttMs(v) - root.natalChart({ utc: new Date(ms), timeKnown: false }).deltaT.seconds * 1000);
  return ms;
};

let ask;
let extra = {};
if (mode === 'plain' || mode === 'fallback' || mode === 'no-atob') {
  if (mode === 'fallback') root.setDefaultEphemeris('astronomy-engine');
  ask = tt;
} else if (mode === 'plain-utc') {
  ask = (v) => fromChart(root.natalChart({ utc: new Date(utcMsOf(v)), timeKnown: false }), v);
} else if (mode === 'positions') {
  ask = (v) => { const b = root.positions(new Date(utcMsOf(v))).find((x) => x.body === v.input.body); return { lon: b.lon, lat: b.lat, ephemeris: 'not reported by positions()' }; };
} else if (mode === 'caller-async' || mode === 'caller-sync') {
  const pack = await import('@zodiacs/engine/de440/pack');
  const source = mode === 'caller-async' ? await pack.openShippedDe440Pack() : pack.shippedDe440Source();
  const bytes = pack.de440PackBytes();
  extra = { packBytes: bytes.byteLength, packSha256: createHash('sha256').update(bytes).digest('hex'), described: pack.DE440_PACK.sha256 };
  ask = (v) => root.withEphemeris(source, () => tt(v));
} else throw new Error(`unknown mode ${mode}`);

const rows = vectors.map((v) => {
  const got = ask(v);
  const dLon = arcsecOnCircle(got.lon, v.expected.lon);
  const dLat = (got.lat - v.expected.lat) * 3600;
  return { id: v.id, body: v.input.body, jd_tt: v.input.jd_tt, lon: got.lon, lat: got.lat, ephemeris: got.ephemeris, dLon, dLat,
    pass: Math.abs(dLon) <= v.tolerance.lon.abs && Math.abs(dLat) <= v.tolerance.lat.abs };
});
const worst = (k) => rows.reduce((m, r) => (Math.abs(r[k]) > Math.abs(m[k]) ? r : m));
const count = (list) => Object.fromEntries([...new Set(list)].map((x) => [x, list.filter((y) => y === x).length]));
const perBody = Object.fromEntries([...new Set(rows.map((r) => r.body))].map((body) => {
  const mine = rows.filter((r) => r.body === body);
  return [body, { cases: mine.length, pass: mine.filter((r) => r.pass).length,
    largestLon: Math.max(...mine.map((r) => Math.abs(r.dLon))), largestLat: Math.max(...mine.map((r) => Math.abs(r.dLat))) }];
}));
const state = root.defaultEphemeris ? root.defaultEphemeris() : null; // asked after the run, so that it cannot open anything before it
const summary = {
  mode, package: root.ENGINE_VERSION, node: process.version, resolvedRoot: import.meta.resolve('@zodiacs/engine').replace(/^.*node_modules/, '<consumer>/node_modules'),
  zodiacsEnvironmentVariables: zodiacsEnv, nodeOptions: process.env.NODE_OPTIONS ?? null,
  vectors: { sha256: createHash('sha256').update(vectorsBytes).digest('hex'), count: vectors.length,
    jdTtMin: Math.min(...vectors.map((v) => v.input.jd_tt)), jdTtMax: Math.max(...vectors.map((v) => v.input.jd_tt)) },
  pass: rows.filter((r) => r.pass).length, cases: rows.length,
  largestLon: { arcsec: Math.abs(worst('dLon').dLon), id: worst('dLon').id, body: worst('dLon').body },
  largestLat: { arcsec: Math.abs(worst('dLat').dLat), id: worst('dLat').id, body: worst('dLat').body },
  ephemerisOnTheChart: count(rows.map((r) => r.ephemeris)), failing: rows.filter((r) => !r.pass).map((r) => r.id), perBody,
  defaultEphemerisAfterTheRun: state, ...extra,
};
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, `fix-breaker-l1-${mode}.json`), JSON.stringify(summary, null, 2) + '\n');
writeFileSync(resolve(out, `fix-breaker-l1-${mode}.tsv`), ['id\tbody\tjd_tt\tlon\tlat\tdLon_arcsec\tdLat_arcsec\tverdict\tephemeris',
  ...rows.map((r) => [r.id, r.body, r.jd_tt, r.lon, r.lat, r.dLon.toFixed(5), r.dLat.toFixed(5), r.pass ? 'pass' : 'FAIL', r.ephemeris].join('\t'))].join('\n') + '\n');
console.log(`${mode}: ${summary.pass} of ${summary.cases} within the vectors' limits; largest dLon ${summary.largestLon.arcsec.toFixed(4)}" (${summary.largestLon.id} ${summary.largestLon.body}), dLat ${summary.largestLat.arcsec.toFixed(4)}" (${summary.largestLat.id} ${summary.largestLat.body}); chart.ephemeris: ${JSON.stringify(summary.ephemerisOnTheChart)}; default after: ${state ? `${state.name}, pack opened ${state.de440.opened}${state.de440.error ? `, error ${state.de440.error}` : ''}` : 'n/a'}`);
