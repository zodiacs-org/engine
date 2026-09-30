// rc.14 against this build on a review's wider sample, to give the largest
// differences with the chart that shows each. The sample is the one the
// second review of rc.15 drew (its tools/cmp-worker.mjs, rewritten here):
// mulberry32 seeded 0x5eed1234; 3,000 instants uniform from 1800 to 2200 at
// latitudes uniform in ±66° and longitudes in ±180°, cycling through seven
// house systems; 1,500 instants uniform from 1972 to 2027-10-02 with
// Placidus; and 25 instants at and around five dates of the time basis at
// 51.5° N, 0.12° W. Each version runs in its own process. Statistics and the
// inputs of each maximum only.
//
//   node review-sample.mjs <rc.14 package directory> <this package directory> [out.json]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function cases() {
  let state = 0x5eed1234;
  const random = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [];
  const lo = Date.UTC(1800, 0, 1), hi = Date.UTC(2200, 0, 1);
  const systems = ["placidus", "koch", "whole", "equal", "regiomontanus", "campanus", "porphyry"];
  for (let i = 0; i < 3000; i++) out.push([Math.round(lo + random() * (hi - lo)), random() * 132 - 66, random() * 360 - 180, systems[i % systems.length]]);
  const from = Date.UTC(1972, 0, 1), to = Date.UTC(2027, 9, 2);
  for (let i = 0; i < 1500; i++) out.push([Math.round(from + random() * (to - from)), random() * 132 - 66, random() * 360 - 180, "placidus"]);
  for (const edge of [Date.UTC(1972, 0, 1), Date.UTC(2027, 9, 2), Date.UTC(2027, 9, 3), Date.UTC(2026, 5, 28), Date.UTC(2026, 8, 24)]) {
    for (const step of [-86_400_000, -1, 0, 1, 86_400_000]) out.push([edge + step, 51.5, -0.12, "placidus"]);
  }
  return out;
}

if (process.argv[2] === "--worker") {
  const engine = await import(pathToFileURL(join(process.argv[3], "dist/index.js")).href);
  const rows = cases().map(([ms, latitude, longitude, houseSystem]) => {
    const chart = engine.natalChart({ utc: new Date(ms), latitude, longitude, houseSystem });
    return {
      bodies: chart.bodies.map((body) => [body.body, body.lon, body.lat]),
      angles: [chart.angles.asc, chart.angles.mc],
      cusps: chart.houses.cusps,
      system: chart.houses.system
    };
  });
  process.stdout.write(JSON.stringify({ version: engine.ENGINE_VERSION, rows }));
} else {
  const [before, after, out] = process.argv.slice(2);
  const run = (root) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--worker", root], { encoding: "utf8", maxBuffer: 1 << 30 }));
  const a = run(before);
  const b = run(after);
  const circle = (x, y) => Math.abs(((((y - x) % 360) + 540) % 360) - 180) * 3600;
  const eras = [
    ["before 1850", -Infinity, Date.UTC(1850, 0, 1)],
    ["1850 to 1972", Date.UTC(1850, 0, 1), Date.UTC(1972, 0, 1)],
    ["1972 to 2027-10-02", Date.UTC(1972, 0, 1), Date.UTC(2027, 9, 2, 0, 0, 0, 1)],
    ["2027-10-02 to 2150", Date.UTC(2027, 9, 2, 0, 0, 0, 1), Date.UTC(2150, 0, 1)],
    ["after 2150", Date.UTC(2150, 0, 1), Infinity]
  ];
  const all = cases();
  const report = { before: a.version, after: b.version, charts: all.length, eras: {} };
  for (const [label, from, to] of eras) {
    const stats = { charts: 0, systemChanged: 0, maxArcsec: {} };
    const bump = (key, value, input) => {
      if (!(stats.maxArcsec[key]?.value >= value)) stats.maxArcsec[key] = { value: Number(value.toPrecision(6)), input };
    };
    all.forEach(([ms, latitude, longitude, houseSystem], i) => {
      if (!(ms >= from && ms < to)) return;
      stats.charts += 1;
      const x = a.rows[i], y = b.rows[i];
      const input = { utc: new Date(ms).toISOString(), latitude, longitude, houseSystem };
      if (x.system !== y.system) stats.systemChanged += 1;
      x.bodies.forEach(([name, lon], k) => bump(name, circle(lon, y.bodies[k][1]), input));
      bump("asc", circle(x.angles[0], y.angles[0]), input);
      bump("mc", circle(x.angles[1], y.angles[1]), input);
      if (x.system === y.system) x.cusps.forEach((cusp, k) => bump("cusps", circle(cusp, y.cusps[k]), input));
    });
    report.eras[label] = stats;
  }
  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
}
