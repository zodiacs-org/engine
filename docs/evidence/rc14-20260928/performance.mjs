// Timings of the exact configured-aspect and declination decisions against
// rc.12's floating-point ones: the independent review's worst case (256 bodies
// under 64 custom rules; 256 declinations all within a 90° orb), and an
// ordinary chart. The machine is shared, so each build is timed in three
// rounds, each a fresh process doing two warm-ups and 21 timed runs, and the
// figure kept is the fastest run of all: other load can only slow a run down.
// Each round's fastest and median runs are reported too.
//
// usage: node performance.mjs <label>=<path to dist/index.js> ...
import { execFileSync } from "node:child_process";
import { cpus, loadavg } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROUNDS = 3;
const RUNS = 21;

if (process.argv[2] === "--one") {
  const engine = await import(pathToFileURL(process.argv[3]).href);
  const timed = (run) => {
    for (let k = 0; k < 2; k += 1) run();
    const times = [];
    for (let k = 0; k < RUNS; k += 1) {
      const started = process.hrtime.bigint();
      run();
      times.push(Number(process.hrtime.bigint() - started) / 1e6);
    }
    times.sort((a, b) => a - b);
    return { fastestMs: Number(times[0].toFixed(3)), medianMs: Number(times[(RUNS - 1) / 2].toFixed(3)) };
  };
  const bodies = Array.from({ length: 256 }, (_, i) => `B${i}`);
  const policy = engine.createAspectPolicy({ bodies, aspects: Array.from({ length: 64 }, (_, i) => ({ type: `c${i}`, angle: (i * 180) / 63, orb: 1.4 })) });
  const rows = bodies.map((body, i) => ({ body, lon: (i * 137.50776405003785) % 360, speed: (i % 7) - 3 }));
  const declinations = Array.from({ length: 256 }, (_, i) => ({ body: `B${i}`, lon: i, lat: ((i * 7.3) % 180) - 90 }));
  const chart = engine.natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006 });
  const ordinary = engine.createAspectPolicy();
  process.stdout.write(JSON.stringify({
    version: engine.ENGINE_VERSION,
    counts: {
      configuredWorst: engine.findConfiguredAspects(rows, policy).aspects.length,
      declinationWorst: engine.findDeclinationAspects(declinations, 23.44, { orb: 90, luminaryOrb: 90 }).length
    },
    configuredWorst: timed(() => engine.findConfiguredAspects(rows, policy)),
    declinationWorst: timed(() => engine.findDeclinationAspects(declinations, 23.44, { orb: 90, luminaryOrb: 90 })),
    configuredChart: timed(() => engine.findConfiguredAspects(chart.bodies, ordinary)),
    chartDeclinations: timed(() => engine.chartDeclinations(chart))
  }));
} else {
  const self = fileURLToPath(import.meta.url);
  const builds = process.argv.slice(2).map((argument) => argument.split("="));
  const rounds = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const results = {};
    for (const [label, path] of builds) {
      results[label] = JSON.parse(execFileSync(process.execPath, [self, "--one", resolve(path)], { encoding: "utf8" }));
    }
    rounds.push({ loadAverage: loadavg().map((value) => Number(value.toFixed(2))), results });
  }
  const KEYS = ["configuredWorst", "declinationWorst", "configuredChart", "chartDeclinations"];
  const fastest = Object.fromEntries(builds.map(([label]) => [label, {
    version: rounds[0].results[label].version,
    counts: rounds[0].results[label].counts,
    ...Object.fromEntries(KEYS.map((key) => [`${key}Ms`, Math.min(...rounds.map((round) => round.results[label][key].fastestMs))]))
  }]));
  const first = builds[0][0];
  const relative = Object.fromEntries(["configuredWorstMs", "declinationWorstMs"].map((key) => [key,
    Object.fromEntries(builds.map(([label]) => [label, Number((fastest[label][key] / fastest[first][key]).toFixed(2))]))]));
  console.log(JSON.stringify({ runtime: process.version, platform: `${process.platform}-${process.arch}`, cpus: cpus().length,
    rounds: ROUNDS, runsPerRound: RUNS, fastest, relativeToFirst: relative, perRound: rounds }, null, 2));
}
