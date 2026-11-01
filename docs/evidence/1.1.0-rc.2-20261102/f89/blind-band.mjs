/*
 * E3 (b) of the F-89 preregistration (PREREGISTRATION.md, section 5): how far
 * past a target a planet's station can take it and still have both crossings
 * missed by a plain scan at a fixed 5-day step, on this build's own
 * longitudes. A port of zodiacs.org's
 * docs/platform/evidence/claims-engine-references-20261012/tools/blind-band.mjs
 * (site main 9a67f761), which ran on engine 1.0.0.
 *
 *   node blind-band.mjs [--out FILE]
 *
 * It needs a build (npm run build), which it loads from the repository's
 * dist/, or from ZODIACS_ENGINE_DIST, and uses the root entry's `positions`,
 * `searchLongitudeCrossingsWith` and `ENGINE_VERSION`. For each Saturn and
 * Jupiter station from 2019 to 2024, the zeros of the longitude's speed that
 * the engine's crossing search finds at a 5-day step, it records f″, the
 * second derivative of the longitude, by a central difference over ±1 day,
 * and the band f″h²/8 (h = 5 days) within which both crossings can fall
 * inside one cell. At each of 100 phases of the 5-day grid (0.05 day apart)
 * it samples the longitude every 5 days over 40 days around the station, and
 * counts the phases at which a plain sign-change scan finds neither crossing
 * of a target placed a given depth short of the station's longitude:
 *
 * - check: at the figure that README.md and dist/crossings.d.ts state for the
 *   body, no phase misses, at any station;
 * - control: at 0.9 times the station's own band, at least one phase misses,
 *   at every station.
 *
 * It also checks that the stated figures are the largest band of each body
 * rounded up to two significant figures, as the preregistration fixes them,
 * and that it found the 12 Saturn and 11 Jupiter stations the preregistration
 * names. It writes blind-band.json beside it (default), with no time, machine
 * or commit in it, so that a rerun on the same build gives the same bytes,
 * and exits 1 if any check fails. The figures describe a fixed-step scan of
 * the engine's own motion, not the sky.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const args = new Map();
for (let index = 0; index < argv.length; index += 2) args.set(argv[index], argv[index + 1]);
for (const key of args.keys()) if (key !== "--out") throw new Error(`Unknown option ${key}.`);
const out = args.get("--out") ?? fileURLToPath(new URL("blind-band.json", import.meta.url));
const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(repository, "dist"));
const { ENGINE_VERSION, positions, searchLongitudeCrossingsWith } = await import(pathToFileURL(resolve(dist, "index.js")).href);

const DAY = 86_400_000;
const STEP_DAYS = 5;
const PHASES = 100;
const WINDOW_DAYS = 40;
const BODIES = ["Saturn", "Jupiter"];
/** The station counts the preregistration names (E3 b). */
const EXPECTED_STATIONS = { Saturn: 12, Jupiter: 11 };
const lonAt = (body, ms) => positions(new Date(ms)).find((row) => row.body === body).lon;
const speedAt = (body, date) => positions(date).find((row) => row.body === body).speed;
/** The signed difference lon − target, degrees in [−180, 180). */
const offset = (lon, target) => ((lon - target + 540) % 360) - 180;
/** Rounded up to two significant figures, as src/calc.ts rounds its bounds. */
const up2 = (x) => {
  const unit = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Number((Math.ceil(x / unit) * unit).toPrecision(2));
};

/** The figures a text states: "up to X° for Saturn and Y° for Jupiter at their stations from 2019 to 2024". */
function stated(name, text) {
  const match = text.match(/up to ([0-9.]+)° for Saturn and ([0-9.]+)° for Jupiter at their stations from 2019 to 2024/u);
  if (!match) throw new Error(`${name} states no blind-band figures.`);
  return { Saturn: Number(match[1]), Jupiter: Number(match[2]) };
}
const prose = (text) => text.replace(/\s+/gu, " ");
const declarations = readFileSync(resolve(dist, "crossings.d.ts"), "utf8")
  .split("\n")
  .map((line) => line.replace(/^\s*\*\s?/u, ""))
  .join("\n");
const figures = {
  "README.md": stated("README.md", prose(readFileSync(resolve(repository, "README.md"), "utf8"))),
  "dist/crossings.d.ts": stated("dist/crossings.d.ts", prose(declarations))
};

/**
 * The longitudes a plain scan samples around a station: for each phase, every
 * 5 days over 40 days from 20 days before the station, shifted by the phase.
 */
function samples(body, stationMs) {
  return Array.from({ length: PHASES }, (_, phase) => {
    const start = stationMs - 20 * DAY + (phase / PHASES) * STEP_DAYS * DAY;
    return Array.from({ length: WINDOW_DAYS / STEP_DAYS + 1 }, (_, k) => lonAt(body, start + k * STEP_DAYS * DAY));
  });
}

/** Phases, out of 100, at which a plain scan finds neither crossing of a target `depth` short of the station. */
function missedPhases(grid, top, maximum, depth) {
  const target = maximum ? top - depth : top + depth;
  return grid.filter((longitudes) =>
    longitudes.slice(1).every((lon, k) => Math.sign(offset(lon, target)) === Math.sign(offset(longitudes[k], target)))
  ).length;
}

const rows = [];
const bodies = {};
for (const body of BODIES) {
  const found = searchLongitudeCrossingsWith(speedAt, body, 0, new Date("2019-01-01T00:00:00Z"), new Date("2024-12-31T00:00:00Z"), {
    stepDays: STEP_DAYS
  });
  if (found.status !== "complete") throw new Error(`The station search for ${body} was refused.`);
  let largest = 0;
  for (const station of found.crossings) {
    const t = station.at.getTime();
    const second = lonAt(body, t + DAY) - 2 * lonAt(body, t) + lonAt(body, t - DAY);
    const band = (Math.abs(second) * STEP_DAYS ** 2) / 8;
    largest = Math.max(largest, band);
    // Direct motion before the station makes it a maximum of the longitude.
    const maximum = speedAt(body, new Date(t - DAY)) > 0;
    const grid = samples(body, t);
    const top = lonAt(body, t);
    rows.push({
      body,
      station: station.at.toISOString(),
      secondDerivativeDegPerDay2: Number(second.toExponential(4)),
      bandDeg: Number(band.toFixed(5)),
      atStatedFigure: { depthDeg: figures["README.md"][body], missedPhasesOf100: missedPhases(grid, top, maximum, figures["README.md"][body]) },
      atNineTenthsOfBand: { depthDeg: Number((0.9 * band).toPrecision(6)), missedPhasesOf100: missedPhases(grid, top, maximum, 0.9 * band) }
    });
  }
  bodies[body] = { stations: found.crossings.length, largestBandDeg: Number(largest.toPrecision(6)), roundedUpDeg: up2(largest) };
}

const verdict = (pass) => (pass ? "pass" : "fail");
const checks = {
  stations: verdict(BODIES.every((body) => bodies[body].stations === EXPECTED_STATIONS[body])),
  statedFigures: verdict(
    BODIES.every((body) => figures["README.md"][body] === bodies[body].roundedUpDeg && figures["dist/crossings.d.ts"][body] === bodies[body].roundedUpDeg)
  ),
  noMissAtStatedFigure: verdict(rows.every((row) => row.atStatedFigure.missedPhasesOf100 === 0)),
  controlMissAtNineTenthsOfBand: verdict(rows.every((row) => row.atNineTenthsOfBand.missedPhasesOf100 > 0))
};
const result = {
  engine: ENGINE_VERSION,
  check: "E3 (b), docs/evidence/1.1.0-rc.2-20261102/f89/PREREGISTRATION.md",
  stepDays: STEP_DAYS,
  phasesOf: PHASES,
  windowDays: WINDOW_DAYS,
  rule: "a plain scan misses both crossings only when they fall inside one cell: depth < f″·h²/8",
  statedFigures: figures,
  bodies,
  stations: rows,
  checks
};
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ engine: ENGINE_VERSION, bodies, checks }, null, 2));
process.exit(Object.values(checks).every((value) => value === "pass") ? 0 : 1);
