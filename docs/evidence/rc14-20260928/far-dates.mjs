// What each build does with instants outside astronomy-engine's tabulated
// years: the Sun's ecliptic latitude it reports (the real Sun's stays within
// about 1.2″) and how long positions() takes, or how fast it refuses.
//
// usage: node far-dates.mjs <label>=<path to dist/index.js> ...
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const INSTANTS = ["-030000-06-01T00:00:00Z", "-000500-06-01T00:00:00Z", "0001-04-30T00:00:00Z", "0001-05-01T00:00:00Z",
  "0500-06-01T00:00:00Z", "1000-06-01T00:00:00Z", "1500-06-01T00:00:00Z", "1800-06-01T00:00:00Z", "2000-06-01T00:00:00Z",
  "2200-06-01T00:00:00Z", "2500-06-01T00:00:00Z", "3000-06-01T00:00:00Z", "3500-06-01T00:00:00Z", "3998-09-02T00:00:00Z",
  "3998-09-03T12:00:00Z", "4500-06-01T00:00:00Z", "+030000-06-01T00:00:00Z"];
const report = { runtime: process.version, builds: {} };
for (const argument of process.argv.slice(2)) {
  const [label, path] = argument.split("=");
  const engine = await import(pathToFileURL(resolve(path)).href);
  const rows = [];
  for (const utc of INSTANTS) {
    const started = performance.now();
    let outcome;
    try {
      const sun = engine.positions(utc).find((row) => row.body === "Sun");
      outcome = { sunLatitudeArcsec: Number((sun.lat * 3600).toFixed(3)) };
    } catch (error) {
      outcome = { refused: `${error.name}: ${String(error.message).slice(0, 60)}…` };
    }
    rows.push({ utc, ...outcome, ms: Number((performance.now() - started).toFixed(1)) });
  }
  report.builds[label] = { version: engine.ENGINE_VERSION, rows };
}
console.log(JSON.stringify(report, null, 2));
