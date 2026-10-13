// Translate reviewed installed coefficients only. No source evaluation or network reads.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const PLANET_SOURCE = Object.freeze({
  name: "astronomy-engine",
  version: "2.1.19",
  path: "node_modules/astronomy-engine/esm/astronomy.js",
  sha256: "068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7",
  integrity: "sha512-8yWKNf7UeNbH458h3sAJ6ZgAjE5jTXp/mNNRFoC20j2SHwZIjAQeEsBB2Q3uCFRaTCCJRv33K2XhkhZQMXoX6w=="
});

export const VSOP_BODIES = Object.freeze([
  "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"
]);

// Planet -> longitude/latitude/radius -> polynomial order -> number of terms.
// Earth's empty latitude order is intentional and must not be discarded.
export const VSOP_SHAPE = Object.freeze([
  [[7, 5], [7, 2], [6, 2]],
  [[10, 3], [3, 1], [8, 1]],
  [[28, 3, 1], [0, 2], [14, 2, 1]],
  [[49, 7, 2], [5, 3], [19, 4, 2]],
  [[29, 9, 3], [6, 1], [19, 5]],
  [[33, 12, 4], [9, 3], [23, 6, 1]],
  [[39, 6], [5, 1], [24, 1]],
  [[10, 3], [5], [12]]
].map(coordinates => Object.freeze(coordinates.map(Object.freeze))));

export function checkedPlanetSource(text) {
  assert.equal(createHash("sha256").update(text).digest("hex"), PLANET_SOURCE.sha256,
    `Unreviewed planetary input: ${PLANET_SOURCE.path}. Review provenance and parity before changing its pin.`);
  return text;
}

export function checkedPlanetPackages(installed, local, localLock, reference, referenceLock) {
  const { name, version, integrity } = PLANET_SOURCE;
  assert.equal(installed.name, name, "Planetary source package name");
  assert.equal(installed.version, version, "Planetary source package version");
  assert.equal(installed.license, "MIT", "Planetary source licence");
  for (const [label, manifest, lock, kind] of [
    ["rustcore", local, localLock, "devDependencies"],
    ["reference", reference, referenceLock, "dependencies"]
  ]) {
    assert.equal(manifest[kind]?.[name], version, `${label} planetary version must be exactly pinned`);
    assert.equal(lock.packages?.[""]?.[kind]?.[name], version, `${label} planetary lock root version`);
    assert.equal(lock.packages?.[`node_modules/${name}`]?.version, version,
      `${label} planetary installed lock version`);
    assert.equal(lock.packages?.[`node_modules/${name}`]?.integrity, integrity,
      `${label} planetary lock integrity`);
  }
}

export function validateVsop(data) {
  assert(data && typeof data === "object" && !Array.isArray(data), "VSOP object required");
  assert.deepEqual(Object.keys(data), VSOP_BODIES, "VSOP body names and order");
  const arrays = VSOP_BODIES.map(body => data[body]);
  for (const [planet, coordinates] of arrays.entries()) {
    assert(Array.isArray(coordinates), "VSOP coordinates must be arrays");
    assert.equal(coordinates.length, 3, "VSOP coordinates must be longitude, latitude, radius");
    for (const [coordinate, orders] of coordinates.entries()) {
      assert(Array.isArray(orders), "VSOP orders must be arrays");
      assert.deepEqual(orders.map(terms => {
        assert(Array.isArray(terms), "VSOP terms must be arrays");
        return terms.length;
      }), VSOP_SHAPE[planet][coordinate], "VSOP coefficient table shape");
      for (const terms of orders) {
        for (const term of terms) {
          assert(Array.isArray(term) && term.length === 3 && term.every(Number.isFinite),
            "VSOP terms must contain finite amplitude, phase, frequency numbers");
        }
      }
    }
  }
  return arrays;
}

export function parseVsopLiteral(source) {
  // Only this literal is parsed. Quoting its known property names makes it
  // strict JSON; functions, expressions, comments and other JS syntax fail.
  const matches = [...source.matchAll(/^const vsop = (\{[\s\S]*?^\});$/gm)];
  assert.equal(matches.length, 1, "Expected one VSOP literal");
  const literal = matches[0][1];
  const keys = [...literal.matchAll(/\b([A-Za-z]+):/g)].map(match => match[1]);
  assert.deepEqual(keys, VSOP_BODIES, "VSOP literal body names and order");
  const data = JSON.parse(literal.replace(/\b([A-Za-z]+):/g, '"$1":'));
  validateVsop(data);
  return data;
}

export function readPlanetInputs() {
  const json = path => JSON.parse(readFileSync(join(root, path), "utf8"));
  checkedPlanetPackages(json("node_modules/astronomy-engine/package.json"),
    json("package.json"), json("package-lock.json"),
    json("../package.json"), json("../package-lock.json"));
  return parseVsopLiteral(checkedPlanetSource(readFileSync(join(root, PLANET_SOURCE.path), "utf8")));
}

function rustNumber(value) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(value);
  return `f64::from_bits(0x${buffer.toString("hex")})`;
}

export function rustPlanetData(data) {
  const planets = validateVsop(data);
  const lines = [
    "// Generated from astronomy-engine's digest-checked VSOP literal.",
    "// Copyright (c) 2019-2023 Don Cross <cosinekitty@gmail.com>, MIT License.",
    "// Retain rustcore/NOTICE and rustcore/PROVENANCE.md when redistributing.",
    "// Do not edit. Rebuild with scripts/generate-planet-data.mjs.",
    `pub const PLANET_SOURCE_VERSION: &str = ${JSON.stringify(PLANET_SOURCE.version)};`,
    `pub const PLANET_SOURCE_SHA256: &str = ${JSON.stringify(PLANET_SOURCE.sha256)};`,
    `pub const VSOP_BODIES: &[&str] = &[${VSOP_BODIES.map(body => JSON.stringify(body)).join(", ")}];`,
    "pub const VSOP: &[&[&[&[[f64; 3]]]]] = &["
  ];
  for (const [index, coordinates] of planets.entries()) {
    lines.push(`    &[ // ${VSOP_BODIES[index]}`);
    for (const orders of coordinates) {
      lines.push("        &[");
      for (const terms of orders) {
        lines.push("            &[");
        for (const term of terms) lines.push(`                [${term.map(rustNumber).join(", ")}],`);
        lines.push("            ],");
      }
      lines.push("        ],");
    }
    lines.push("    ],");
  }
  lines.push("];", "");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 4 && process.argv[2] === "--rust", "Expected --rust OUT_DIR");
  const data = readPlanetInputs();
  const output = join(process.argv[3], "planet_data.rs");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, rustPlanetData(data));
}
