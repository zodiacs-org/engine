#!/usr/bin/env node
/*
 * Breaker's own run of the 240 L1 position vectors on the package as
 * installed from its tarball. Written apart from the builder's
 * tools/l1-installed.mjs. Copied into the consumer directory and started
 * there, so the imports resolve to node_modules/@zodiacs/engine only.
 *
 *   node breaker-l1.mjs <L1-positions.json> <out directory>
 *
 * Three ways of asking, each on all 240 vectors:
 *   plain        natalChart() from the root, nothing else done: what an
 *                install gives with no further step
 *   shipped      natalChart() inside withEphemeris(await openShippedDe440Pack())
 *   async-trap   withEphemeris(source, async () => { await 0; natalChart() }):
 *                whether the source is still in force after an await
 * Expected values are the vectors' (JPL Horizons DE441). Limits: the suite's
 * 1 arcsecond in longitude (on the circle) and in latitude, and 30 arcseconds
 * in longitude. TT on both sides.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [vectorsPath, outDir] = process.argv.slice(2).map((p) => resolve(p));
const zodiacsEnv = Object.keys(process.env).filter((k) => k.startsWith('ZODIACS'));
const rootUrl = import.meta.resolve('@zodiacs/engine');
const packUrl = import.meta.resolve('@zodiacs/engine/de440/pack');
const root = await import('@zodiacs/engine');
const vectorsBytes = readFileSync(vectorsPath);
const vectors = JSON.parse(vectorsBytes).vectors;
const here = realpathSync(process.cwd());

const diffLon = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d * 3600; };
const ask = (v) => {
  const ms = Math.round((v.input.jd_tt - 2440587.5) * 86400000);
  const chart = root.natalChart({ utc: new Date(ms), timeScale: 'tt', timeKnown: false });
  const b = chart.bodies.find((x) => x.body === v.input.body);
  return { lon: b.lon, lat: b.lat, ephemeris: chart.ephemeris?.name ?? null };
};
const score = (v, got) => {
  const dLon = diffLon(got.lon, v.expected.lon);
  const dLat = (got.lat - v.expected.lat) * 3600;
  return { id: v.id, body: v.input.body, jd_tt: v.input.jd_tt, lon: got.lon, lat: got.lat, ephemeris: got.ephemeris,
    dLon, dLat, within1: Math.abs(dLon) <= v.tolerance.lon.abs && Math.abs(dLat) <= v.tolerance.lat.abs, lon30: Math.abs(dLon) <= 30 };
};
const tally = (rows) => {
  const max = (k) => rows.reduce((m, r) => (Math.abs(r[k]) > Math.abs(m[k]) ? r : m));
  return { cases: rows.length, within1: rows.filter((r) => r.within1).length, lon30: rows.filter((r) => r.lon30).length,
    largestLon: { arcsec: Math.abs(max('dLon').dLon), id: max('dLon').id, body: max('dLon').body },
    largestLat: { arcsec: Math.abs(max('dLat').dLat), id: max('dLat').id, body: max('dLat').body },
    ephemerisNames: [...new Set(rows.map((r) => String(r.ephemeris)))],
    failing1: rows.filter((r) => !r.within1).map((r) => r.id) };
};

// 1. plain: before the pack entry is even imported.
const plain = vectors.map((v) => score(v, ask(v)));

// 2. shipped pack.
const pack = await import('@zodiacs/engine/de440/pack');
const bytes = pack.de440PackBytes();
const source = await pack.openShippedDe440Pack();
const shipped = vectors.map((v) => score(v, root.withEphemeris(source, () => ask(v))));

// 3. plain again, after the pack was opened and used: does opening it change the default?
const plainAfter = vectors.map((v) => score(v, ask(v)));
const plainUnchanged = plain.every((r, i) => r.lon === plainAfter[i].lon && r.lat === plainAfter[i].lat);

// 4. async callback.
let asyncTrap;
try {
  const rows = [];
  for (const v of vectors.slice(0, 240)) {
    const got = await root.withEphemeris(source, async () => { await null; return ask(v); });
    rows.push(score(v, got));
  }
  asyncTrap = { outcome: 'returned', ...tally(rows) };
} catch (error) {
  asyncTrap = { outcome: 'threw', message: String(error?.message ?? error).slice(0, 400) };
}

const manifest = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(rootUrl)), '..', 'package.json'), 'utf8'));
const summary = {
  package: `${manifest.name} ${manifest.version}`, ENGINE_VERSION: root.ENGINE_VERSION, node: process.version,
  resolved: { root: fileURLToPath(rootUrl).replace(here, '<consumer>'), pack: fileURLToPath(packUrl).replace(here, '<consumer>') },
  zodiacsEnvironmentVariables: zodiacsEnv,
  vectors: { sha256: createHash('sha256').update(vectorsBytes).digest('hex'), count: vectors.length },
  shippedPack: { bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), described: pack.DE440_PACK,
    sourceEphemeris: source.ephemeris },
  rootDefaultEphemeris: root.EPHEMERIS,
  plain: tally(plain), shipped: tally(shipped), plainAfterPackUse: { ...tally(plainAfter), identicalToPlain: plainUnchanged }, asyncCallback: asyncTrap,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'breaker-l1-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const tsv = ['id\tbody\tjd_tt\tplain_dLon\tplain_dLat\tplain_1as\tshipped_dLon\tshipped_dLat\tshipped_1as'];
plain.forEach((p, i) => { const s = shipped[i]; tsv.push([p.id, p.body, p.jd_tt, p.dLon.toFixed(4), p.dLat.toFixed(4), p.within1 ? 'pass' : 'FAIL', s.dLon.toFixed(5), s.dLat.toFixed(5), s.within1 ? 'pass' : 'FAIL'].join('\t')); });
writeFileSync(resolve(outDir, 'breaker-l1-cases.tsv'), tsv.join('\n') + '\n');
const line = (n, t) => `${n}: within 1 arcsec ${t.within1}/${t.cases}; longitude within 30 arcsec ${t.lon30}/${t.cases}; largest dLon ${t.largestLon.arcsec.toFixed(4)} (${t.largestLon.id} ${t.largestLon.body}), dLat ${t.largestLat.arcsec.toFixed(4)} (${t.largestLat.id} ${t.largestLat.body}); ephemeris on the chart: ${t.ephemerisNames.join(', ')}`;
console.log(`${summary.package} from ${summary.resolved.root}; node ${process.version}; ZODIACS* variables: ${zodiacsEnv.length}`);
console.log(`shipped pack bytes: ${bytes.byteLength}, sha256 ${summary.shippedPack.sha256}`);
console.log(line('plain root call (no pack opened)', summary.plain));
console.log(line('shipped pack through withEphemeris', summary.shipped));
console.log(`plain root call after the pack was used: identical to the first plain run: ${plainUnchanged}`);
console.log(asyncTrap.outcome === 'returned' ? line('async callback in withEphemeris', asyncTrap) : `async callback in withEphemeris threw: ${asyncTrap.message}`);
