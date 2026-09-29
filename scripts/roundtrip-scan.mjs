/*
 * The audit's all-zone round-trip scan (scripts/roundtrip-scan-lib.mjs) on
 * the built package: dist/geo.js, with the zone names the shipped history
 * holds read from src/tzdb/. The unit suite runs the default scope from
 * source; this runs either scope on the build and writes its result.
 *
 *   npm run build && node scripts/roundtrip-scan.mjs --full --out result.json
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { SCOPES, scanZone, scanZones } from "./roundtrip-scan-lib.mjs";

const full = process.argv.includes("--full");
const outAt = process.argv.indexOf("--out");
const out = outAt > 0 ? process.argv[outAt + 1] : null;
const geo = await import(new URL("../dist/geo.js", import.meta.url).href);
const directory = new URL("../src/tzdb/", import.meta.url);
const loaders = readdirSync(directory)
  .filter((file) => /^tzdb-\d{4}[a-z]-\d\d\.ts$/.test(file))
  .map((file) => async () => ({
    default: JSON.parse(/JSON\.parse\('(.*)'\);/.exec(readFileSync(new URL(file, directory), "utf8"))[1])
  }));

const started = Date.now();
const zones = await scanZones(geo, loaders);
const scope = full ? SCOPES.full : SCOPES.default;
const totals = { transitions: 0, tested: 0, failures: [] };
zones.forEach((zone, index) => {
  const result = scanZone(geo, zone, scope);
  totals.transitions += result.transitions;
  totals.tested += result.tested;
  totals.failures.push(...result.failures);
  if ((index + 1) % 100 === 0) console.error(`${index + 1}/${zones.length} zones, ${totals.tested} wall minutes`);
});
const report = {
  scan: full ? "full: 1850-2100, daily step, wider sampling" : "default: 1850-2037, three-day step",
  host: { node: process.version, icu: process.versions.icu, tz: process.versions.tz },
  tzdb: geo.TZDB,
  zones: zones.length,
  transitions: totals.transitions,
  tested: totals.tested,
  failures: totals.failures.length,
  firstFailures: totals.failures.slice(0, 50),
  seconds: Math.round((Date.now() - started) / 100) / 10
};
const text = `${JSON.stringify(report, null, 1)}\n`;
if (out) writeFileSync(out, text);
process.stdout.write(text);
process.exitCode = totals.failures.length ? 1 : 0;
