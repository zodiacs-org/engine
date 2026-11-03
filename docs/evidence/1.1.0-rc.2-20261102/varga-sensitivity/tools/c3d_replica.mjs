/*
 * C3d on F3b's geometry, without a formal run (the amendment "2026-11-03,
 * review 1: C3d and the seam input F3b", PREREGISTRATION.md, section 13): the
 * search core of the built dist/vedic.js, run on synthetic longitudes shaped
 * like each planted backward-step case, once with the seam walks the build's
 * own seam finder gives on the case's clock and once with none, as C3d's
 * build has them. It is review 1's replica (programme notes,
 * review1/b/c3d-replica.mjs) made a tool: no vargaSensitivity call, no
 * evaluation of the engine's positions, and no case of F2, F3 or F4 is run.
 *
 *   node c3d_replica.mjs [--out FILE]
 *
 * The core is the built text from `function firstWhere(` up to
 * `function subset(` (firstWhere, runOf, seamWalks and searchRuns), with the
 * names it takes from the rest of the file bound as the file declares them
 * (each declaration is checked): the exact tick of a longitude (as
 * checker.mjs computes it), the circle in ticks, the rounding slack, the
 * ΔT model's handover and the day; and `timeBasis`, which seamWalks reads,
 * from the build's public time entry (dist/time.js), which runs the same code.
 *
 * Each case's synthetic Ascendant moves at the rate the case recorded between
 * its crossing and the seam, crosses the case's boundary B at its planted
 * millisecond m, and steps back at the seam z by the case's UT1 step:
 * x(t) = B + r (u(t) - m + 0.5), u(t) = t before z and t + step from z on.
 * The rates are the Ascendant's derived bounds at the case's latitude with
 * lahiri's a, 0.0003 degree a day (src/vedic/varga-time.ts), the run is the
 * D60 run of F1 that holds the birth, and the span is the birth plus and
 * minus the case's horizon. For each case it reports the `next` change with
 * the walks and without, and whether each gives the case's expected
 * millisecond and boundary. The cases are F3b's (seams-f3b.json), where the
 * build without walks must miss the change, and, for contrast, F3's backward
 * plants (seams.json, cases 2 and 3), where it finds it (review 1).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FOLDER, ROOT, options } from "./load.mjs";

const args = options(process.argv.slice(2), ["--out"]);
const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? resolve(ROOT, "dist"));
const text = readFileSync(resolve(dist, "vedic.js"), "utf8");
const time = await import(pathToFileURL(resolve(dist, "time.js")).href);
const changes = JSON.parse(readFileSync(resolve(ROOT, "src/vedic/fixtures/varga-changes.json"), "utf8"));

const DAY = 86_400_000;
const DEG = Math.PI / 180;

/** floor(lon × 7560) for the exact binary value of a finite double lon ≥ 0 (checker.mjs's exactTicks). */
function exactTicks(lon) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, lon);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  const exponent = (biased === 0 ? 1 : biased) - 1075;
  const product = mantissa * 7560n;
  return Number(exponent >= 0 ? product << BigInt(exponent) : product >> BigInt(-exponent));
}

// The core, and the names it takes from the rest of the file, each bound to the value the file declares.
const from = text.indexOf("function firstWhere(");
const to = text.indexOf("function subset(");
if (from < 0 || !(to > from)) throw new Error("dist/vedic.js holds no search core from firstWhere to subset");
const core = text.slice(from, to);
const declared = (base, value) => {
  const names = [...new Set(core.match(new RegExp(`\\b${base}\\d*\\b`, "gu")) ?? [])];
  if (names.length !== 1) throw new Error(`the core names ${base} as ${names.join(", ") || "nothing"}`);
  if (!text.includes(`var ${names[0]} = ${value};`)) throw new Error(`dist/vedic.js does not declare var ${names[0]} = ${value};`);
  return names[0];
};
const bound = {
  [declared("CIRCLE", "2721600")]: 2_721_600,
  [declared("SLACK", "1e-9")]: 1e-9,
  [declared("KNOTS", "(1941 - 2e3) * 365.25")]: (1941 - 2000) * 365.25,
  [declared("DAY", "864e5")]: DAY,
  ticksOf: exactTicks,
  timeBasis: time.timeBasis,
  Spent: class Spent {}
};
const make = new Function(...Object.keys(bound), `${core}\nreturn { runOf, seamWalks, searchRuns };`);
const { runOf, seamWalks, searchRuns } = make(...Object.values(bound));

/** The Ascendant's derived rate bounds, degrees a millisecond (src/vedic/varga-time.ts), for lahiri's a. */
function rates(latitude, a = 0.0003) {
  const phi = Math.abs(latitude) * DEG;
  const tilted = Math.cos(phi + 23.5 * DEG);
  return [
    (0.99 * 360.9856 * Math.sqrt(Math.cos(phi) ** 2 - Math.sin(23.5 * DEG) ** 2) - 5e-5 / tilted - a) / DAY,
    ((1.01 * 360.9856 * Math.cos(phi)) / tilted + a) / DAY
  ];
}

const D60 = changes.varga.D60.filter((row) => row[3] === 1).map((row) => row[0]).sort((a, b) => a - b);

function replicate(corpus, entry) {
  const z = entry.seamAtMs;
  const step = entry.steps.ut1Ms;
  const { atMs: m, boundaryTicks: B } = entry.expected;
  const r = (entry.checks.lonSeamMinus1 - entry.checks.lonAt) / (z - 1 - m);
  const x = (t) => {
    const u = t < z ? t : t + step;
    return ((((B / 7560 + r * (u - m + 0.5)) % 360) + 360) % 360);
  };
  const t0 = Date.parse(entry.input.utc);
  const span = entry.options.horizonMinutes * 60_000;
  const [lo, hi] = [t0 - span, t0 + span];
  const run = runOf(D60, exactTicks(x(t0)));
  const walks = seamWalks(lo, hi, entry.input.timeScale, entry.input.deltaT);
  const next = (walked) => {
    const result = searchRuns(x, 1, rates(entry.input.latitude), [run], t0, lo, hi, walked);
    if (typeof result === "string") return { refused: result };
    const found = result[1][0];
    return found === null ? null : { at: new Date(found[0]).toISOString(), atMs: found[0], afterSeamMs: found[0] - z, boundaryTicks: found[1] };
  };
  const withWalks = next(walks);
  const without = next([]);
  const gives = (found) => found !== null && !found.refused && found.atMs === m && found.boundaryTicks === B;
  let recross = null;
  for (let t = z; t < z + 1_000 && recross === null; t += 1) if (exactTicks(x(t)) >= B) recross = t;
  return {
    corpus,
    id: entry.id,
    clock: entry.clock,
    seamAtMs: z,
    stepMs: step,
    expectedNextAtMs: m,
    boundaryTicks: B,
    birthBeforeSeamMs: z - t0,
    horizonMinutes: entry.options.horizonMinutes,
    rateDegreesPerMs: r,
    syntheticRecrossAfterSeamMs: recross === null ? null : recross - z,
    caseRecrossAfterSeamMs: entry.undoneWindow ? entry.undoneWindow.recrossAtMs - z : null,
    birthRun: run,
    seamWalks: walks,
    nextWithWalks: withWalks,
    nextWithoutWalks: without,
    realBuildGivesExpected: gives(withWalks),
    seamBlindBuildFailsM6: !gives(without)
  };
}

const readCorpus = (name) => {
  const path = resolve(FOLDER, name);
  const raw = readFileSync(path);
  return { path, sha256: createHash("sha256").update(raw).digest("hex"), corpus: JSON.parse(raw) };
};
const f3b = readCorpus("seams-f3b.json");
const f3 = readCorpus("seams.json");
const backwardPlants = (corpus) => corpus.cases.filter((entry) => entry.status === "planted" && entry.point === "Ascendant" && entry.steps.ut1Ms < 0);
const rows = [
  ...backwardPlants(f3b.corpus).map((entry) => replicate("F3b", entry)),
  ...backwardPlants(f3.corpus).map((entry) => replicate("F3", entry))
];
const report = {
  tool: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/c3d_replica.mjs",
  vedicJs: { sha256: createHash("sha256").update(text).digest("hex"), coreBytes: Buffer.byteLength(core) },
  node: process.version,
  platform: `${process.platform} ${process.arch}`,
  corpora: { F3b: { file: "seams-f3b.json", sha256: f3b.sha256 }, F3: { file: "seams.json", sha256: f3.sha256 } },
  cases: rows,
  f3bEveryCase: {
    realBuildGivesExpected: rows.filter((row) => row.corpus === "F3b").every((row) => row.realBuildGivesExpected),
    seamBlindBuildFailsM6: rows.filter((row) => row.corpus === "F3b").every((row) => row.seamBlindBuildFailsM6)
  }
};
const output = `${JSON.stringify(report, null, 1)}\n`;
if (args.has("--out")) writeFileSync(resolve(String(args.get("--out"))), output);
process.stdout.write(output);
process.exitCode = report.f3bEveryCase.realBuildGivesExpected && report.f3bEveryCase.seamBlindBuildFailsM6 ? 0 : 1;
