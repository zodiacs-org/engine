#!/usr/bin/env node
/*
 * An earlier engine's charts at instants within six hours of the IERS table's
 * end, and just outside them, on the DE440 pack and on astronomy-engine, for
 * src/time-scale-near-end.test.ts:
 *
 *   node make-near-end-reference.mjs <package directory> > ../../../src/fixtures/near-table-end-<version>.json
 *
 * Run on the carried 2.0.0-rc.2 archive. The instants include those where
 * results/near-table-end-*.json found each body's largest change of speed.
 * Synthetic place: 48.2 N 16.37 E, Placidus.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node make-near-end-reference.mjs <package directory>");
const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
const engine = await import(pathToFileURL(join(dir, "dist", "index.js")).href);
const END = Date.UTC(2027, 9, 2);
const place = { latitude: 48.2, longitude: 16.37, houseSystem: "placidus" };
const offsets = [
  -6 * 3_600_000 - 60_000, -6 * 3_600_000, -16_080_000, -81_800, -68_600, -50_400, -38_000, -23_500, -600,
  0, 1, 3_100, 11_900, 55_500, 73_300, 99_300, 6 * 3_600_000, 6 * 3_600_000 + 60_000
];
const out = { version, place, sources: {} };
for (const source of ["de440", "astronomy-engine"]) {
  engine.setDefaultEphemeris(source);
  out.sources[source] = offsets.map((offset) => {
    const chart = engine.natalChart({ utc: new Date(END + offset), ...place });
    return {
      utc: new Date(END + offset).toISOString(),
      bodies: chart.bodies.map((row) => [row.body, row.lon, row.lat, row.speed]),
      angles: chart.angles,
      cusps: chart.houses.cusps
    };
  });
}
process.stdout.write(`${JSON.stringify(out)}\n`);
