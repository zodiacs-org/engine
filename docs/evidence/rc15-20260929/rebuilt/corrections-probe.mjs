// What the re-check's corrections to CHANGELOG.md and docs/time.md describe,
// run on the carried rc.14 archive and on this build, each in its own process:
//
// 1. natalChart, saturnReturn and transits (a birth in place of a chart)
//    given a birth key that differs from a field only in letter case, a
//    timeScale other than "utc", "ut1" and "tt", and, as controls, a valid
//    timeScale and an unknown key of another spelling;
// 2. chart.timeScale.ut1MinusUtc for UTC, TT and UT1 input after the UT1
//    table (this build only; rc.14 has no time basis);
// 3. prepareLocalTime for a date in 1970 and in 1971: whether a wall time of
//    1969 in that zone resolves afterwards, which it does only once the zone's
//    history is loaded (this build only; rc.14 has no shipped history).
//
//   node corrections-probe.mjs <rc.14 package directory> <this package directory>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [rc14Root, candidateRoot] = process.argv.slice(2).map((path) => resolve(path));

const child = String.raw`
const root = process.argv[1];
const engine = await import(new URL("dist/index.js", root));
const utc = "1990-06-15T12:30:00Z";
const inputs = [
  ["timescale: \"tt\"", { utc, timescale: "tt" }],
  ["Latitude: 40", { utc, Latitude: 40 }],
  ["deltat: 60", { utc, deltat: 60 }],
  ["timeScale: null", { utc, timeScale: null }],
  ["timeScale: \"UTC\"", { utc, timeScale: "UTC" }],
  ["timeScale: \"TT\"", { utc, timeScale: "TT" }],
  ["timeScale: \"tt\" (control)", { utc, timeScale: "tt" }],
  ["colour: \"red\" (control)", { utc, colour: "red" }]
];
const lines = [];
const calls = [
  ["natalChart", (input) => engine.natalChart(input)],
  ["saturnReturn", (input) => engine.saturnReturn(input)],
  ["transits", (input) => engine.transits(input, "2026-01-01T00:00:00Z")]
];
for (const [label, input] of inputs) {
  const verdicts = calls.map(([name, call]) => {
    try {
      call(input);
      return name + " accepted";
    } catch (error) {
      return name + " " + error.name + (name === "natalChart" ? ": " + error.message : "");
    }
  });
  lines.push("{ utc, " + label + " }: " + verdicts.join("; "));
}
if (process.argv[2] === "current") {
  for (const scale of ["utc", "tt", "ut1"]) {
    const chart = engine.natalChart({ utc: "2030-01-01T00:00:00Z", timeScale: scale });
    lines.push("2030-01-01T00:00:00Z on " + scale + ": ut1MinusUtc " + JSON.stringify(chart.timeScale.ut1MinusUtc) + ", deltaT.model " + chart.deltaT.model);
  }
  const geo = await import(new URL("dist/geo.js", root));
  const wall = (zone) => {
    try {
      return geo.resolveLocalToUtc("1969-12-31", "12:00", zone).utc.toISOString();
    } catch (error) {
      return error.name + ": " + error.message;
    }
  };
  for (const [date, zone] of [["1971-01-01", "Asia/Tokyo"], ["1970-06-01", "Europe/Paris"]]) {
    const before = wall(zone);
    await geo.prepareLocalTime(date, zone);
    lines.push("prepareLocalTime(\"" + date + "\", \"" + zone + "\"): a wall time of 1969-12-31 12:00 there, before: " + before + "; after: " + wall(zone));
  }
}
console.log(lines.join("\n"));
`;

for (const [label, root, mode] of [["rc.14", rc14Root, "rc14"], ["this build", candidateRoot, "current"]]) {
  const url = pathToFileURL(`${root}/`).href;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", child, url, mode], { encoding: "utf8" });
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  console.log(`## ${label} (${version})\n${out}`);
}
