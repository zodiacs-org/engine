import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [tools, pkg] = process.argv.slice(2);
const { entry } = await import(pathToFileURL(join(tools, "load.mjs")).href);
// R1's runtime names with P1.M3c's timeBands, which the entry exports (added by the amendment of 2026-11-03, review 1).
const R1 = ["DELTA_T_IERS_MODEL", "EPHEMERIS_SPAN", "TIME_SCALE_NAMES", "eclipticFrame", "eclipticOfDate", "elapsedDays", "meanEcliptic", "tilt", "timeBands", "timeBasis"];
const less = R1.filter((name) => name !== "elapsedDays");
const keys = Object.keys(await entry(pkg, "./time")).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log(JSON.stringify({ keys, equalsR1: same(keys, R1), equalsControlList: same(keys, less) }));
process.exitCode = same(keys, less) ? 0 : 1;
if (!same(keys, R1)) process.exitCode = 2;
