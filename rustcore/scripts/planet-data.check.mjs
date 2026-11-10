import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  checkedPlanetPackages, checkedPlanetSource, parseVsopLiteral, PLANET_SOURCE,
  readPlanetInputs, rustPlanetData, validateVsop, VSOP_BODIES, VSOP_SHAPE
} from "./generate-planet-data.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read(PLANET_SOURCE.path);
const json = path => JSON.parse(read(path));
const packages = [json("node_modules/astronomy-engine/package.json"),
  json("package.json"), json("package-lock.json"),
  json("../package.json"), json("../package-lock.json")];

test("planetary input rejects byte changes before extraction", () => {
  assert.equal(checkedPlanetSource(source), source);
  assert.throws(() => checkedPlanetSource(`${source}\n`), /Unreviewed planetary input/);
  assert.throws(() => checkedPlanetSource(source.replace("4.40250710144", "4.40250710145")),
    /Unreviewed planetary input/);
  assert.throws(() => checkedPlanetSource(""), /Unreviewed planetary input/);
});

test("installed, manifest and lockfile planetary identities remain consistent", () => {
  checkedPlanetPackages(...packages);
  for (const key of ["name", "version", "license"]) {
    const changed = structuredClone(packages);
    changed[0][key] = "unreviewed";
    assert.throws(() => checkedPlanetPackages(...changed), /Planetary source/);
  }
  for (const [manifestIndex, lockIndex, kind] of [
    [1, 2, "devDependencies"], [3, 4, "dependencies"]
  ]) {
    for (const variant of ["manifest", "root", "version", "integrity", "missing"]) {
      const changed = structuredClone(packages);
      if (variant === "manifest") changed[manifestIndex][kind][PLANET_SOURCE.name] = "^2.1.19";
      else if (variant === "root") changed[lockIndex].packages[""][kind][PLANET_SOURCE.name] = "2.1.18";
      else if (variant === "missing") delete changed[lockIndex].packages;
      else changed[lockIndex].packages["node_modules/astronomy-engine"][variant] = "unreviewed";
      assert.throws(() => checkedPlanetPackages(...changed), /planetary/);
    }
  }
});

test("the VSOP parser accepts only literal arrays and never executes JavaScript", () => {
  const data = readPlanetInputs();
  const literal = source.match(/^const vsop = (\{[\s\S]*?^\});$/m)[0];
  assert.deepEqual(parseVsopLiteral(literal), data);
  assert.deepEqual(parseVsopLiteral(`throw new Error("must not execute");\n${literal}\nthrow 42;`), data);
  for (const expression of ["(globalThis.__rustcorePlanetParserExecuted = 1)",
    "(() => 4.40250710144)()", "4.40250710144 + 0", "NaN", "Infinity", "null", '"4.40250710144"', "1e999"]) {
    assert.throws(() => parseVsopLiteral(literal.replace("4.40250710144", expression)));
  }
  assert.equal(globalThis.__rustcorePlanetParserExecuted, undefined);
  assert.throws(() => parseVsopLiteral(`${literal}\n${literal}`), /Expected one VSOP/);
  assert.throws(() => parseVsopLiteral(literal.replace("const vsop", "const other")), /Expected one VSOP/);
  assert.throws(() => parseVsopLiteral(literal.replace("Venus:", "Mercury:")), /body names and order/);
  assert.throws(() => parseVsopLiteral(literal.replace("Mercury:", "Sun:")), /body names and order/);
});

test("every coordinate, polynomial order and coefficient shape is checked", () => {
  const data = readPlanetInputs();
  const arrays = validateVsop(data);
  assert.deepEqual(Object.keys(data), VSOP_BODIES);
  assert.deepEqual(arrays.map(coordinates => coordinates.map(orders => orders.map(terms => terms.length))),
    VSOP_SHAPE);
  for (const mutate of [
    copy => { delete copy.Mercury; },
    copy => { copy.Mercury.pop(); },
    copy => { copy.Mercury[0].pop(); },
    copy => { copy.Mercury[0][0].pop(); },
    copy => { copy.Mercury[0][0][0].pop(); },
    copy => { copy.Mercury[0][0][0][0] = NaN; },
    copy => { copy.Mercury[0][0][0][0] = Infinity; },
    copy => { copy.Mercury[0][0][0][0] = "4.4"; },
    copy => { copy.Mercury[0] = null; },
    copy => { copy.Earth[1][0].push([0, 0, 0]); }
  ]) {
    const changed = structuredClone(data);
    mutate(changed);
    assert.throws(() => validateVsop(changed));
    assert.throws(() => rustPlanetData(changed));
  }
});

test("Rust coefficients retain all binary64 bits in original order with deterministic output", () => {
  const data = readPlanetInputs();
  const generated = rustPlanetData(data);
  assert.equal(generated, rustPlanetData(readPlanetInputs()));
  assert.match(generated, /rustcore\/NOTICE/);
  assert.match(generated, /rustcore\/PROVENANCE.md/);
  assert(generated.includes(PLANET_SOURCE.sha256));
  assert(generated.includes(PLANET_SOURCE.version));
  assert(Buffer.byteLength(generated) < 2_000_000);
  const values = validateVsop(data).flat(4);
  const translated = [...generated.matchAll(/f64::from_bits\(0x([0-9a-f]{16})\)/g)]
    .map(match => Buffer.from(match[1], "hex").readDoubleBE());
  assert.equal(translated.length, values.length);
  values.forEach((value, index) => assert(Object.is(value, translated[index]), `coefficient ${index}`));
  // An explicit signed zero confirms the formatter is bit-preserving even
  // though the pinned source's decimal coefficients do not require one.
  data.Mercury[0][0][0][0] = -0;
  assert.match(rustPlanetData(data), /f64::from_bits\(0x8000000000000000\)/);
});

test("the complete installed MIT permission and warranty text is retained", () => {
  const normalize = text => text.replace(/\s+/g, " ").trim();
  const permission = source.match(/Permission is hereby granted,[\s\S]*?SOFTWARE\./)[0];
  assert(normalize(read("NOTICE")).includes(normalize(permission)));
  assert(read("NOTICE").includes("Copyright (c) 2019-2023 Don Cross <cosinekitty@gmail.com>"));
});
