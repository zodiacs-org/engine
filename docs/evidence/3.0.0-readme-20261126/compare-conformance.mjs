// Compares a conformance run on this build with the committed results it is
// checked against, vector by vector, and prints the L1 summary README.md and
// docs/comparison.md quote:
//
//   node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out RUN.json
//   node docs/evidence/3.0.0-readme-20261126/compare-conformance.mjs RUN.json conformance/results/zodiacs-engine.json
//
// (and the same with `--ephemeris astronomy-engine` against
// conformance/results/zodiacs-engine-astronomy-engine.json). It prints one
// JSON object: the run's totals; how many vectors have the same verdict and
// the same residual as the committed file (the harness writes each vector's
// residuals under `residual`, an object of named values), how many residual
// values the run holds, the largest difference, and each residual value that
// differs, with the significant digit where it first differs;
// each other recorded value (`meta`, `detail`) that differs; whether every
// summary figure (the counts of each level and kind, and each kind's
// residual median, 95th percentile and largest) is the same once rounded to
// the three decimals README.md's table gives; and the L1 residual summary.
// Until 3.0.0 it compared a field the harness does not write (`residuals`),
// so it counted every vector as equal.
import { readFileSync } from "node:fs";

const [runPath, committedPath] = process.argv.slice(2);
if (!runPath || !committedPath) throw new Error("usage: compare-conformance.mjs RUN.json COMMITTED.json");
const run = JSON.parse(readFileSync(runPath, "utf8"));
const committed = JSON.parse(readFileSync(committedPath, "utf8"));
const byId = new Map(committed.results.map((result) => [result.id, result]));

/** The position, counted from 1, of the first significant digit where two numbers' 17-digit forms differ; null where they are equal. */
function firstDifferingDigit(a, b) {
  if (Object.is(a, b)) return null;
  if (typeof a !== "number" || typeof b !== "number" || Math.sign(a) !== Math.sign(b)) return 1;
  const [ma, ea] = Math.abs(a).toExponential(16).split("e");
  const [mb, eb] = Math.abs(b).toExponential(16).split("e");
  if (ea !== eb) return 1;
  const da = ma.replace(".", "");
  const db = mb.replace(".", "");
  for (let i = 0; i < da.length; i += 1) if (da[i] !== db[i]) return i + 1;
  return null;
}

/** Every number in a JSON value, by its path. */
function numbers(value, path = "", out = new Map()) {
  if (typeof value === "number") out.set(path, value);
  else if (Array.isArray(value)) value.forEach((item, index) => numbers(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) numbers(item, path ? `${path}.${key}` : key, out);
  return out;
}

let sameVerdict = 0;
let sameResidual = 0;
let residualValues = 0;
const residualDiffers = [];
const otherDiffers = [];
for (const result of run.results) {
  const other = byId.get(result.id);
  residualValues += numbers(result.residual ?? null).size;
  if (other?.verdict === result.verdict) sameVerdict += 1;
  if (other && JSON.stringify(other.residual ?? null) === JSON.stringify(result.residual ?? null)) sameResidual += 1;
  else if (other) {
    const mine = numbers(result.residual ?? null);
    const theirs = numbers(other.residual ?? null);
    for (const key of new Set([...mine.keys(), ...theirs.keys()])) {
      const digit = firstDifferingDigit(mine.get(key), theirs.get(key));
      if (digit !== null) residualDiffers.push({ id: result.id, value: key, run: mine.get(key) ?? null, committed: theirs.get(key) ?? null, firstDifferingSignificantDigit: digit });
    }
  }
  if (other) {
    for (const field of ["meta", "detail"]) {
      if (JSON.stringify(other[field] ?? null) === JSON.stringify(result[field] ?? null)) continue;
      const mine = numbers(result[field] ?? null);
      const theirs = numbers(other[field] ?? null);
      const keys = new Set([...mine.keys(), ...theirs.keys()]);
      const changed = [...keys].filter((key) => firstDifferingDigit(mine.get(key), theirs.get(key)) !== null);
      otherDiffers.push({
        id: result.id,
        field,
        numbers: changed.map((key) => ({ value: key, run: mine.get(key) ?? null, committed: theirs.get(key) ?? null, firstDifferingSignificantDigit: firstDifferingDigit(mine.get(key), theirs.get(key)) })),
        otherThanNumbers: JSON.stringify(stripNumbers(result[field] ?? null)) !== JSON.stringify(stripNumbers(other[field] ?? null))
      });
    }
  }
}

/** A JSON value with every number replaced by 0, to see whether anything but numbers differs. */
function stripNumbers(value) {
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) return value.map(stripNumbers);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stripNumbers(item)]));
  return value;
}

/** Every summary figure, each number rounded to three decimals. */
const rounded = (summary) => JSON.stringify(summary, (key, value) => (typeof value === "number" && !Number.isInteger(value) ? Number(value.toFixed(3)) : value));
const summaryFiguresEqualToThreeDecimals = rounded(run.summary) === rounded(committed.summary);
const summaryFiguresEqualToTheBit = JSON.stringify(run.summary) === JSON.stringify(committed.summary);

const l1 = run.summary.byKind["position.apparent.ecliptic-true-of-date"];
console.log(
  JSON.stringify(
    {
      run: runPath.split("/").pop(),
      committed: committedPath,
      adapterEngineVersion: run.adapter.engineVersion,
      committedEngineVersion: committed.adapter.engineVersion,
      total: run.summary.total,
      vectors: run.results.length,
      committedVectors: committed.results.length,
      sameVerdict,
      sameResidual,
      residualValues,
      largestResidualDifference: residualDiffers.reduce((largest, d) => Math.max(largest, Math.abs((d.run ?? NaN) - (d.committed ?? NaN))), 0),
      residualDiffers,
      otherDiffers,
      summaryFiguresEqualToThreeDecimals,
      summaryFiguresEqualToTheBit,
      configurationDiffers: Object.keys(run.adapter.configuration).filter(
        (key) => run.adapter.configuration[key] !== committed.adapter.configuration[key]
      ),
      l1: { pass: l1.pass, fail: l1.fail, unsupported: l1.unsupported, lon: l1.residuals.lon, lat: l1.residuals.lat }
    },
    null,
    2
  )
);
