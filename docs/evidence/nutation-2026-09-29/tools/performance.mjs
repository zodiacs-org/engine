/*
 * What the full nutation costs in time, rc.15 as carried against this tree's
 * build: the median over seven rounds, each engine in its own process each
 * round, of
 *
 * - a natal chart with Placidus houses (300 synthetic births, 1900-2100);
 * - one longitude (bodyLongitude) of the Sun, the Moon, Saturn and the true
 *   node, 20,000 each at hourly instants from 1990;
 * - two Saturn-return scans.
 *
 *   npm run build
 *   node docs/evidence/nutation-2026-09-29/tools/performance.mjs > results/performance.json
 *
 * Wall-clock times on a shared machine: read the ratio, not the digits.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { BUILD, unpackRc15 } from "./engines.mjs";

async function round(dist) {
  const root = await import(pathToFileURL(join(dist, "index.js")).href);
  const internal = await import(pathToFileURL(join(dist, "internal.js")).href);
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const births = Array.from({ length: 300 }, () => ({
    utc: new Date(Date.UTC(1900, 0, 1) + random() * 200 * 365.25 * 86_400_000).toISOString(),
    latitude: -60 + 120 * random(),
    longitude: -180 + 360 * random(),
    houseSystem: "placidus"
  }));
  for (const birth of births.slice(0, 50)) root.natalChart(birth);
  let start = performance.now();
  for (const birth of births) root.natalChart(birth);
  const out = { natalChartMs: (performance.now() - start) / births.length, longitudeMicroseconds: {} };
  for (const body of ["Sun", "Moon", "Saturn", "North Node"]) {
    const from = Date.UTC(1990, 0, 1);
    for (let i = 0; i < 2000; i += 1) internal.bodyLongitude(body, new Date(from + i * 3_600_000));
    start = performance.now();
    for (let i = 0; i < 20_000; i += 1) internal.bodyLongitude(body, new Date(from + i * 3_600_000));
    out.longitudeMicroseconds[body] = ((performance.now() - start) / 20_000) * 1000;
  }
  start = performance.now();
  root.saturnReturn({ utc: "1990-06-15T12:30:00Z" });
  root.saturnReturn({ utc: "1950-01-01T00:00:00Z" });
  out.saturnReturnMs = (performance.now() - start) / 2;
  return out;
}

if (process.argv[2] === "--round") {
  process.stdout.write(JSON.stringify(await round(process.argv[3])));
} else {
  const rc15 = unpackRc15();
  try {
    const rounds = { rc15: [], build: [] };
    for (let r = 0; r < 7; r += 1) {
      for (const [name, dist] of [["rc15", rc15.dist], ["build", BUILD]]) {
        const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--round", dist], { encoding: "utf8" });
        if (child.status !== 0) throw new Error(child.stderr);
        rounds[name].push(JSON.parse(child.stdout));
      }
    }
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const summary = (list) => ({
      natalChartMs: +median(list.map((x) => x.natalChartMs)).toFixed(3),
      longitudeMicroseconds: Object.fromEntries(Object.keys(list[0].longitudeMicroseconds).map((body) => [body, +median(list.map((x) => x.longitudeMicroseconds[body])).toFixed(2)])),
      saturnReturnMs: +median(list.map((x) => x.saturnReturnMs)).toFixed(1)
    });
    const before = summary(rounds.rc15);
    const after = summary(rounds.build);
    process.stdout.write(`${JSON.stringify({
      node: process.version,
      rounds: 7,
      rc15: before,
      build: after,
      ratio: {
        natalChart: +(after.natalChartMs / before.natalChartMs).toFixed(2),
        longitude: Object.fromEntries(Object.keys(before.longitudeMicroseconds).map((body) => [body, +(after.longitudeMicroseconds[body] / before.longitudeMicroseconds[body]).toFixed(2)])),
        saturnReturn: +(after.saturnReturnMs / before.saturnReturnMs).toFixed(2)
      }
    }, null, 1)}\n`);
  } finally {
    rc15.cleanup();
  }
}
