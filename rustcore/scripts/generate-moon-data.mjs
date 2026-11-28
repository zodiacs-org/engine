// Extract literal lunar coefficients from the digest-checked local MIT source.
// No JavaScript source evaluation and no network reads occur here.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkedPlanetSource, PLANET_SOURCE, readPlanetInputs } from "./generate-planet-data.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const MOON_SHAPE = Object.freeze({ solar: 104, latitude: 10 });
const multipliers = [4, 3, 4, 6];

export function validateMoon(data) {
  assert(data && typeof data === "object" && !Array.isArray(data), "Moon tables required");
  assert.deepEqual(Object.keys(data), ["solar", "latitude"], "Moon table names and order");
  for (const [name, coefficientCount] of [["solar", 4], ["latitude", 1]]) {
    assert(Array.isArray(data[name]), "Moon terms must be arrays");
    assert.equal(data[name].length, MOON_SHAPE[name], `Moon ${name} term count`);
    for (const row of data[name]) {
      assert(Array.isArray(row) && row.length === coefficientCount + 4,
        "Moon coefficient and argument shape");
      assert(row.slice(0, coefficientCount).every(Number.isFinite), "Moon coefficients must be finite");
      row.slice(coefficientCount).forEach((value, index) => {
        assert(Number.isInteger(value) && Math.abs(value) <= multipliers[index],
          "Moon argument must be an integer inside the harmonic bounds");
      });
    }
  }
  return data;
}

export function parseMoonCalls(source) {
  const sections = [...source.matchAll(/^function CalcMoon\(time\) \{[\s\S]*?^\}/gm)];
  assert.equal(sections.length, 1, "Expected one CalcMoon function");
  const section = sections[0][0];
  const read = pattern => [...section.matchAll(pattern)].map(match => {
    const parts = match[1].split(",").map(part => part.trim());
    // In particular unary plus in the ADDN rows is accepted; expressions,
    // comments, NaN, strings and nested function calls are not.
    assert(parts.every(part => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(part)),
      "Moon arguments must be numeric literals");
    return parts.map(Number);
  });
  return validateMoon({
    solar: read(/^    AddSol\((.*)\);$/gm),
    latitude: read(/^    N \+= ADDN\((.*)\);$/gm)
  });
}

export function readMoonInputs() {
  // Reuse the planetary manifest/lock/integrity checks before sharing its
  // installed source. Checking the full source also pins the lunar algorithm.
  readPlanetInputs();
  return parseMoonCalls(checkedPlanetSource(readFileSync(join(root, PLANET_SOURCE.path), "utf8")));
}

function rustNumber(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(value);
  return `f64::from_bits(0x${buffer.toString("hex")})`;
}

export function rustMoonData(data) {
  validateMoon(data);
  const lines = [
    "// Generated from astronomy-engine's digest-checked CalcMoon coefficient calls.",
    "// Copyright (c) 2019-2023 Don Cross <cosinekitty@gmail.com>, MIT License.",
    "// Retain rustcore/NOTICE and rustcore/PROVENANCE.md when redistributing.",
    "// Do not edit. Rebuild with scripts/generate-moon-data.mjs.",
    `pub const MOON_SOURCE_VERSION: &str = ${JSON.stringify(PLANET_SOURCE.version)};`,
    `pub const MOON_SOURCE_SHA256: &str = ${JSON.stringify(PLANET_SOURCE.sha256)};`
  ];
  for (const [name, constant, count] of [["solar", "SOLAR", 4], ["latitude", "LATITUDE", 1]]) {
    lines.push(`pub const ${constant}: &[([f64; ${count}], [i8; 4])] = &[`);
    for (const row of data[name]) {
      lines.push(`    ([${row.slice(0, count).map(rustNumber).join(", ")}], [${row.slice(count).join(", ")}]),`);
    }
    lines.push("];", "");
  }
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 4 && process.argv[2] === "--rust", "Expected --rust OUT_DIR");
  const data = readMoonInputs();
  const output = join(process.argv[3], "moon_data.rs");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rustMoonData(data));
}
