// Extract Pluto state and gravitational constants from the checked MIT source.
// This reads literal data only, with no JavaScript evaluation or network access.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkedPlanetSource, PLANET_SOURCE, readPlanetInputs } from "./generate-planet-data.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const PLUTO_SHAPE = Object.freeze({ states: 51, timeStep: 29200, dt: 146, steps: 201 });
const massNames = ["SUN_GM", "JUPITER_GM", "SATURN_GM", "URANUS_GM", "NEPTUNE_GM"];

export function validatePluto(data) {
  assert(data && typeof data === "object" && !Array.isArray(data), "Pluto data required");
  assert.deepEqual(Object.keys(data), ["shape", "masses", "states"], "Pluto data fields and order");
  assert.deepEqual(data.shape, PLUTO_SHAPE, "Pluto segment shape");
  assert(Array.isArray(data.masses) && data.masses.length === massNames.length, "Pluto mass count");
  assert(data.masses.every(value => Number.isFinite(value) && value > 0), "Pluto positive masses");
  assert(Array.isArray(data.states) && data.states.length === PLUTO_SHAPE.states, "Pluto state count");
  for (const [index, row] of data.states.entries()) {
    assert(Array.isArray(row) && row.length === 3, "Pluto state shape");
    assert.equal(row[0], -730000 + PLUTO_SHAPE.timeStep * index, "Pluto state clock");
    for (const vector of row.slice(1)) {
      assert(Array.isArray(vector) && vector.length === 3, "Pluto vector shape");
      assert(vector.every(Number.isFinite), "Pluto finite state values");
    }
  }
  return data;
}

export function parsePluto(source) {
  const readConstant = name => {
    const matches = [...source.matchAll(new RegExp(`^const ${name} = ([^;]+);$`, "gm"))];
    assert.equal(matches.length, 1, `Expected one ${name} constant`);
    assert(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(matches[0][1]),
      "Pluto constants must be numeric literals");
    return Number(matches[0][1]);
  };
  const tables = [...source.matchAll(/^const PlutoStateTable = (\[[\s\S]*?^\]);$/gm)];
  assert.equal(tables.length, 1, "Expected one PlutoStateTable");
  return validatePluto({
    shape: {
      states: readConstant("PLUTO_NUM_STATES"),
      timeStep: readConstant("PLUTO_TIME_STEP"),
      dt: readConstant("PLUTO_DT"),
      steps: readConstant("PLUTO_NSTEPS")
    },
    masses: massNames.map(readConstant),
    states: JSON.parse(tables[0][1])
  });
}

export function readPlutoInputs() {
  readPlanetInputs();
  return parsePluto(checkedPlanetSource(readFileSync(join(root, PLANET_SOURCE.path), "utf8")));
}

function rustNumber(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(value);
  return `f64::from_bits(0x${buffer.toString("hex")})`;
}

export function rustPlutoData(data) {
  validatePluto(data);
  const lines = [
    "// Generated from astronomy-engine's digest-checked Pluto state table.",
    "// Copyright (c) 2019-2023 Don Cross <cosinekitty@gmail.com>, MIT License.",
    "// Retain rustcore/NOTICE and rustcore/PROVENANCE.md when redistributing.",
    "// Do not edit. Rebuild with scripts/generate-pluto-data.mjs.",
    `pub const PLUTO_SOURCE_VERSION: &str = ${JSON.stringify(PLANET_SOURCE.version)};`,
    `pub const PLUTO_SOURCE_SHA256: &str = ${JSON.stringify(PLANET_SOURCE.sha256)};`,
    `pub const NUM_STATES: usize = ${data.shape.states};`,
    `pub const TIME_STEP: f64 = ${rustNumber(data.shape.timeStep)};`,
    `pub const DT: f64 = ${rustNumber(data.shape.dt)};`,
    `pub const NSTEPS: usize = ${data.shape.steps};`
  ];
  data.masses.forEach((value, index) => lines.push(`pub const ${massNames[index]}: f64 = ${rustNumber(value)};`));
  lines.push("pub const STATES: &[(f64, [f64; 3], [f64; 3])] = &[");
  for (const [tt, position, velocity] of data.states) {
    lines.push(`    (${rustNumber(tt)}, [${position.map(rustNumber).join(", ")}], [${velocity.map(rustNumber).join(", ")}]),`);
  }
  lines.push("];", "");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 4 && process.argv[2] === "--rust", "Expected --rust OUT_DIR");
  const output = join(process.argv[3], "pluto_data.rs");
  const data = readPlutoInputs();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rustPlutoData(data));
}
