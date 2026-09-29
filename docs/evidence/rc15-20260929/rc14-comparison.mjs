// What the time basis changes in an ordinary chart: 0.1.1-rc.14 (the carried
// archive, installed) against this build, on synthetic UTC instants every 11
// days and 7 h 13 min from 1850 to 2150 at four synthetic places, Placidus
// houses. Each version runs in its own process. Differences are reported per
// era: before 1972, where both read the instant as UT1 on the ΔT model; 1972
// to 2027-10-02, where this build reads UTC with the leap seconds and IERS
// UT1 − UTC; and after, the model again. Statistics only.
//
//   node rc14-comparison.mjs <rc.14 package directory> <this package directory> [out.json]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLACES = [[0, 0], [40.7128, -74.006], [-33.87, 151.21], [60.17, 24.94]];
function instants() {
  const out = [];
  const step = 11 * 86_400_000 + (7 * 60 + 13) * 60_000;
  for (let ms = Date.UTC(1850, 0, 1); ms < Date.UTC(2150, 0, 1); ms += step) out.push(ms);
  return out;
}

if (process.argv[2] === "--worker") {
  const engine = await import(pathToFileURL(join(process.argv[3], "dist/index.js")).href);
  const rows = instants().map((ms, index) => {
    const [latitude, longitude] = PLACES[index % PLACES.length];
    const chart = engine.natalChart({ utc: new Date(ms), latitude, longitude, houseSystem: "placidus" });
    return {
      bodies: chart.bodies.map((body) => [body.lon, body.lat, body.speed]),
      angles: chart.angles && [chart.angles.asc, chart.angles.mc],
      cusps: chart.houses.cusps,
      system: chart.houses.system,
      deltaT: chart.deltaT.seconds
    };
  });
  process.stdout.write(JSON.stringify({ version: engine.ENGINE_VERSION, rows }));
} else {
  const [before, after, out] = process.argv.slice(2);
  const run = (root) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--worker", root], { encoding: "utf8", maxBuffer: 1 << 30 }));
  const a = run(before);
  const b = run(after);
  const circle = (x, y) => Math.abs(((((y - x) % 360) + 540) % 360) - 180) * 3600;
  const eras = [["before 1972", -Infinity, Date.UTC(1972, 0, 1)], ["1972 to 2027-10-02", Date.UTC(1972, 0, 1), Date.UTC(2027, 9, 2, 0, 0, 0, 1)], ["after 2027-10-02", Date.UTC(2027, 9, 2, 0, 0, 0, 1), Infinity]];
  const names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"];
  const report = { before: a.version, after: b.version, charts: a.rows.length, places: PLACES, eras: {} };
  const times = instants();
  for (const [label, from, to] of eras) {
    const stats = { charts: 0, identicalCharts: 0, systemChanged: 0, maxArcsec: {}, maxDeltaTChange: 0 };
    const bump = (key, value) => { if (!(stats.maxArcsec[key] >= value)) stats.maxArcsec[key] = value; };
    times.forEach((ms, i) => {
      if (!(ms >= from && ms < to)) return;
      stats.charts += 1;
      const x = a.rows[i], y = b.rows[i];
      if (JSON.stringify(x) === JSON.stringify({ ...y, deltaT: x.deltaT }) && x.deltaT === y.deltaT) stats.identicalCharts += 1;
      if (x.system !== y.system) stats.systemChanged += 1;
      x.bodies.forEach((row, k) => { bump(`${names[k]} lon`, circle(row[0], y.bodies[k][0])); bump(`${names[k]} lat`, Math.abs(row[1] - y.bodies[k][1]) * 3600); });
      bump("asc", circle(x.angles[0], y.angles[0]));
      bump("mc", circle(x.angles[1], y.angles[1]));
      if (x.system === y.system) x.cusps.forEach((cusp, k) => bump("cusps", circle(cusp, y.cusps[k])));
      stats.maxDeltaTChange = Math.max(stats.maxDeltaTChange, Math.abs(x.deltaT - y.deltaT));
    });
    for (const key of Object.keys(stats.maxArcsec)) stats.maxArcsec[key] = Number(stats.maxArcsec[key].toPrecision(4));
    stats.maxDeltaTChange = Number(stats.maxDeltaTChange.toPrecision(4));
    report.eras[label] = stats;
  }
  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (out) writeFileSync(out, text);
  process.stdout.write(text);
}
