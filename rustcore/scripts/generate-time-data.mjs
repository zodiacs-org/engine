// Translate reviewed local inputs only. No source evaluation or network reads.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const SOURCE_DIGESTS = Object.freeze({
  "src/deltat.ts": "2ce7e227bdf0e75bc2401793b8b09ed4113d80d8845376fbec7d0129c12f8b27",
  "src/time-scale-data.ts": "44c6b80db298e55a050b59cb75975ba2059abb775b16b849022ee5a5849280a0"
});

export function checkedSource(path, text) {
  assert.equal(createHash("sha256").update(text).digest("hex"), SOURCE_DIGESTS[path],
    `Unreviewed time input: ${path}. Review provenance and parity before changing its pin.`);
  return text;
}

function capture(source, pattern) {
  const value = source.match(pattern)?.[1];
  assert(value !== undefined, `Missing time data: ${pattern}`);
  return value;
}
const scalar = (source, name) => JSON.parse(capture(source,
  new RegExp(`\\b${name}:\\s*("[^"\\n]*"|-?\\d+(?:\\.\\d+)?)`)));
const array = (source, name) => JSON.parse(`[${capture(source,
  new RegExp(`\\b${name}(?:\\s*=|:)[^\\[]*\\[([^\\]]*)\\]`))}]`);
const object = (source, name) => capture(source,
  new RegExp(`const ${name}[^=]*=[^\\{]*\\{([\\s\\S]*?)\\n\\}\\);`));

export function readTimeInputs() {
  const sources = Object.fromEntries(Object.keys(SOURCE_DIGESTS).map(path => [path,
    checkedSource(path, readFileSync(join(root, "..", path), "utf8"))]));
  const delta = sources["src/deltat.ts"];
  const time = sources["src/time-scale-data.ts"];
  const dt = object(delta, "DELTA_T_TABLE");
  const leap = object(time, "LEAP_SECOND_LIST");
  const ut1 = object(time, "UT1_DATA");
  const table = Object.fromEntries(["version", "digest", "from", "observedTo", "predictedTo"]
    .map(key => [key, scalar(dt, key)]));
  table.knots = array(dt, "knots");
  const leapList = Object.fromEntries(["source", "sha256", "updated", "expires"]
    .map(key => [key, scalar(leap, key)]));
  leapList.changes = JSON.parse(capture(leap, /(\[\[[^;]*?\]\])/));
  const ut1Data = Object.fromEntries([
    "version", "source", "sha256", "earlySource", "earlySha256", "digest", "from", "finalsFrom",
    "observedTo", "to", "step", "head", "first", "slope", "radix", "packed", "bound", "earlyError", "firstYear"
  ].map(key => [key, scalar(ut1, key)]));
  ut1Data.observedErrors = array(ut1, "observedErrors");
  ut1Data.predictedErrors = array(ut1, "predictedErrors");
  const bounds = Object.fromEntries([
    "UT1_FROM_MS", "UT1_FINALS_FROM_MS", "UT1_OBSERVED_TO_MS", "UT1_TO_MS", "UT1_GRID_BEFORE", "LEAP_SECONDS_EXPIRE_MS"
  ].map(name => [name, Number(capture(time, new RegExp(`const ${name} = (\\d+);`)))]));
  assert.equal(createHash("sha256").update(JSON.stringify([
    table.from, table.observedTo, table.predictedTo, ...table.knots
  ])).digest("hex").slice(0, 16), table.digest, "Delta T table identity");
  // Same identity payload as the parent scripts/build-time-scales.mjs.
  assert.equal(createHash("sha256").update(JSON.stringify([
    leapList.changes, leapList.expires, ut1Data.from, ut1Data.finalsFrom,
    ut1Data.observedTo, ut1Data.to, ut1Data.step, ut1Data.head,
    ut1Data.first, ut1Data.slope, ut1Data.radix, ut1Data.packed
  ])).digest("hex").slice(0, 16), ut1Data.digest, "UT1 table identity");
  const alphabet = "#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_abcdefghijklmnopqrstuvwxyz{|}~";
  const count = bounds.UT1_GRID_BEFORE + Math.ceil((ut1Data.to - ut1Data.finalsFrom) / ut1Data.step) + 1;
  const knots = [ut1Data.first];
  let step = ut1Data.slope;
  for (let i = 1; i < count; i++) {
    knots.push(knots[i - 1] + step);
    if (i + 1 < count) {
      const pair = i - 1;
      const code = alphabet.indexOf(ut1Data.packed[pair >> 1]);
      assert(code >= 0 && code < ut1Data.radix ** 2, "Invalid packed UT1 pair");
      step += (pair & 1 ? code % ut1Data.radix : Math.floor(code / ut1Data.radix)) - (ut1Data.radix - 1) / 2;
    }
  }
  assert(knots.every(Number.isSafeInteger), "UT1 knots must retain exact integer milliseconds");
  return { table, leapList, ut1Data, bounds, knots,
    sx: array(delta, "SX"), sy: array(delta, "SY"), sig: array(delta, "SIG") };
}

const banner = `// Generated from digest-checked src/deltat.ts and src/time-scale-data.ts.
// Delta T includes SMH 2016 Table S15 (CC BY 4.0); retain rustcore/NOTICE.
// UT1/leap data provenance and unresolved C04 terms: rustcore/PROVENANCE.md.
// Do not edit. Rebuild with scripts/generate-time-data.mjs.
`;
const rustNumber = number => Number.isInteger(number) ? `${number}.0` : String(number);
export function rustTimeData(data) {
  const lines = [banner];
  const emit = (name, value) => {
    if (typeof value === "string") lines.push(`pub const ${name}: &str = ${JSON.stringify(value)};`);
    else if (typeof value === "number") lines.push(`pub const ${name}: f64 = ${rustNumber(value)};`);
    else lines.push(`pub const ${name}: &[f64] = &[${value.map(rustNumber).join(",")}];`);
  };
  for (const [name, key] of Object.entries({ VERSION: "version", DIGEST: "digest", FROM: "from",
    OBSERVED_TO: "observedTo", PREDICTED_TO: "predictedTo", KNOTS: "knots" })) {
    emit(`DELTA_T_TABLE_${name}`, data.table[key]);
  }
  for (const key of ["sx", "sy", "sig"]) emit(`DELTA_T_${key.toUpperCase()}`, data[key]);
  for (const [name, value] of Object.entries(data.bounds)) emit(name, value);
  for (const [name, key] of Object.entries({ VERSION: "version", DIGEST: "digest", FROM: "from",
    FINALS_FROM: "finalsFrom", OBSERVED_TO: "observedTo", TO: "to", STEP: "step", HEAD: "head",
    BOUND: "bound", EARLY_ERROR: "earlyError", FIRST_YEAR: "firstYear",
    OBSERVED_ERRORS: "observedErrors", PREDICTED_ERRORS: "predictedErrors" })) {
    emit(`UT1_${name}`, data.ut1Data[key]);
  }
  emit("UT1_KNOTS", data.knots);
  lines.push(`pub const LEAP_SECOND_CHANGES: &[(f64, f64)] = &[${data.leapList.changes
    .map(pair => `(${pair.map(rustNumber).join(",")})`).join(",")}];`);
  return `${lines.join("\n")}\n`;
}

export function tsTimeData({ table, leapList, ut1Data }) {
  // Build metadata is immutable, including the reference's mutable UT1 error
  // arrays. The kernel uses compiled tables, not caller-editable metadata.
  return `${banner}
export const DELTA_T_MODEL = "zodiacs-deltat/1";
export const DELTA_T_IERS_MODEL = "iers-utc/1";
export const TIME_SCALE_NAMES = Object.freeze(["utc", "ut1", "tt"] as const);
export const LEAP_SECONDS_FROM = 63072000000;
export const UT1_FALLBACK_BAND = 0.9;
const table = ${JSON.stringify(table)};
export const DELTA_T_TABLE = Object.freeze({ ...table, knots: Object.freeze(table.knots) });
const leapList = ${JSON.stringify(leapList)} as const;
export const LEAP_SECOND_LIST = Object.freeze({ ...leapList,
  changes: Object.freeze(leapList.changes.map(change => Object.freeze(change) as readonly [number, number])) });
const ut1Data = ${JSON.stringify(ut1Data)} as const;
export const UT1_DATA = Object.freeze({ ...ut1Data,
  observedErrors: Object.freeze(ut1Data.observedErrors),
  predictedErrors: Object.freeze(ut1Data.predictedErrors) });
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert(mode === "--rust" || mode === "--typescript", "Expected --rust OUT_DIR or --typescript");
  const data = readTimeInputs();
  const output = mode === "--rust" ? join(process.argv[3], "time_data.rs") : join(root, "generated", "time-data.ts");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, mode === "--rust" ? rustTimeData(data) : tsTimeData(data));
}
