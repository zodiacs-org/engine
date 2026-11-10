import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkedPlanetSource, PLANET_SOURCE } from "./generate-planet-data.mjs";
import { parsePluto, PLUTO_SHAPE, readPlutoInputs, rustPlutoData, validatePluto } from "./generate-pluto-data.mjs";

const source = readFileSync(new URL(`../${PLANET_SOURCE.path}`, import.meta.url), "utf8");

test("Pluto generation rejects a changed reviewed source and dependency identity", () => {
  checkedPlanetSource(source);
  assert.throws(() => checkedPlanetSource(source.replace("-26.118207232108", "-26.118207232109")),
    /Unreviewed planetary input/);
  assert.deepEqual(parsePluto(source), readPlutoInputs());
});

test("Pluto parsing reads literal tables and constants without evaluating source", () => {
  const expected = readPlutoInputs();
  assert.deepEqual(parsePluto(`throw 42;\n${source}\nthrow 43;`), expected);
  for (const expression of ["(globalThis.__rustcorePlutoExecuted = 1)", "-26 + 1", "NaN", "Infinity", '"-26"', "1e999"]) {
    assert.throws(() => parsePluto(source.replace("-26.118207232108", expression)));
  }
  assert.equal(globalThis.__rustcorePlutoExecuted, undefined);
  for (const replacement of ["51 + 0", "51.5", "NaN", '"51"']) {
    assert.throws(() => parsePluto(source.replace("PLUTO_NUM_STATES = 51", `PLUTO_NUM_STATES = ${replacement}`)));
  }
  assert.throws(() => parsePluto(source.replace("PlutoStateTable =", "AnotherTable =")), /Expected one PlutoStateTable/);
  assert.throws(() => parsePluto(`${source}\nconst SUN_GM = 1;`), /Expected one SUN_GM/);
  assert.throws(() => parsePluto(`${source}\n${source}`), /Expected one PlutoStateTable/);
});

test("Pluto table structure, clock spacing and mass values are validated", () => {
  const data = readPlutoInputs();
  assert.deepEqual(data.shape, PLUTO_SHAPE);
  for (const mutate of [
    copy => { delete copy.masses; },
    copy => { copy.shape.dt = 145; },
    copy => { copy.masses.pop(); },
    copy => { copy.masses[0] = 0; },
    copy => { copy.masses[1] = NaN; },
    copy => { copy.states.pop(); },
    copy => { copy.states[0].pop(); },
    copy => { copy.states[0][0] += 1; },
    copy => { copy.states[25][0] = "0"; },
    copy => { copy.states[1][1].pop(); },
    copy => { copy.states[1][1][0] = Infinity; },
    copy => { copy.states[1][2][0] = "1"; }
  ]) {
    const changed = structuredClone(data);
    mutate(changed);
    assert.throws(() => validatePluto(changed));
    assert.throws(() => rustPlutoData(changed));
  }
});

test("generated Pluto data preserves every binary64 value in source order", () => {
  const data = readPlutoInputs();
  const output = rustPlutoData(data);
  assert.equal(output, rustPlutoData(readPlutoInputs()));
  assert.match(output, /rustcore\/NOTICE/);
  assert(output.includes(PLANET_SOURCE.sha256));
  assert(output.includes(PLANET_SOURCE.version));
  assert(Buffer.byteLength(output) < 2_000_000);
  const expected = [data.shape.timeStep, data.shape.dt, ...data.masses, ...data.states.flat(2)];
  const translated = [...output.matchAll(/f64::from_bits\(0x([0-9a-f]{16})\)/g)]
    .map(match => Buffer.from(match[1], "hex").readDoubleBE());
  assert.equal(translated.length, expected.length);
  expected.forEach((value, index) => assert(Object.is(value, translated[index]), `Pluto value ${index}`));
  data.states[0][1][0] = -0;
  assert.match(rustPlutoData(data), /f64::from_bits\(0x8000000000000000\)/);
});
