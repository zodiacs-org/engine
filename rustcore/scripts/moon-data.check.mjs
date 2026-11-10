import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkedPlanetSource, PLANET_SOURCE } from "./generate-planet-data.mjs";
import { MOON_SHAPE, parseMoonCalls, readMoonInputs, rustMoonData, validateMoon } from "./generate-moon-data.mjs";

const source = readFileSync(new URL(`../${PLANET_SOURCE.path}`, import.meta.url), "utf8");
const section = source.match(/^function CalcMoon\(time\) \{[\s\S]*?^\}/m)[0];

test("lunar extraction is pinned to the complete reviewed source", () => {
  checkedPlanetSource(source);
  assert.throws(() => checkedPlanetSource(source.replace("22639.5000", "22639.5001")), /Unreviewed planetary input/);
  assert.deepEqual(parseMoonCalls(source), readMoonInputs());
});

test("lunar parser extracts only literal coefficients without executing source", () => {
  const expected = readMoonInputs();
  assert.deepEqual(parseMoonCalls(`throw 42;\n${section}\nthrow 43;`), expected);
  for (const expression of ["(globalThis.__rustcoreMoonExecuted = 1)", "13.9020 + 0",
    "NaN", "Infinity", "null", "1e999", '"13.9020"']) {
    assert.throws(() => parseMoonCalls(section.replace("13.9020", expression)));
  }
  assert.equal(globalThis.__rustcoreMoonExecuted, undefined);
  assert.throws(() => parseMoonCalls(`${section}\n${section}`), /Expected one CalcMoon/);
  assert.throws(() => parseMoonCalls(section.replace("function CalcMoon", "function Another")), /Expected one CalcMoon/);
  assert.throws(() => parseMoonCalls(section.replace("AddSol(13.9020", "Other(13.9020")), /solar term count/);
  assert.throws(() => parseMoonCalls(section.replace("N += ADDN(-526.069", "N += Other(-526.069")), /latitude term count/);
});

test("lunar table sizes, coefficient types and signed harmonic bounds are checked", () => {
  const data = readMoonInputs();
  assert.equal(data.solar.length, MOON_SHAPE.solar);
  assert.equal(data.latitude.length, MOON_SHAPE.latitude);
  for (const mutate of [
    copy => { delete copy.latitude; },
    copy => { copy.solar.pop(); },
    copy => { copy.latitude.pop(); },
    copy => { copy.solar[0].pop(); },
    copy => { copy.solar[0][0] = NaN; },
    copy => { copy.solar[0][0] = "13.9020"; },
    copy => { copy.latitude[0][0] = Infinity; },
    copy => { copy.solar[0][4] = 5; },
    copy => { copy.solar[0][5] = -4; },
    copy => { copy.solar[0][6] = 5; },
    copy => { copy.solar[0][7] = -7; },
    copy => { copy.latitude[0][1] = 0.5; }
  ]) {
    const changed = structuredClone(data);
    mutate(changed);
    assert.throws(() => validateMoon(changed));
    assert.throws(() => rustMoonData(changed));
  }
});

test("generated lunar tables preserve every coefficient bit and argument in source order", () => {
  const data = readMoonInputs();
  const output = rustMoonData(data);
  assert.equal(output, rustMoonData(readMoonInputs()));
  assert.match(output, /rustcore\/NOTICE/);
  assert(output.includes(PLANET_SOURCE.sha256));
  assert(output.includes(PLANET_SOURCE.version));
  assert(Buffer.byteLength(output) < 2_000_000);
  const rows = [...data.solar, ...data.latitude];
  const values = rows.flatMap(row => row.slice(0, row.length - 4));
  const translated = [...output.matchAll(/f64::from_bits\(0x([0-9a-f]{16})\)/g)]
    .map(match => Buffer.from(match[1], "hex").readDoubleBE());
  assert.equal(translated.length, values.length);
  values.forEach((value, index) => assert(Object.is(value, translated[index]), `coefficient ${index}`));
  const argumentsList = [...output.matchAll(/\], \[([-\d, ]+)\]\),/g)]
    .map(match => match[1].split(",").map(Number));
  assert.deepEqual(argumentsList, rows.map(row => row.slice(-4)));
  data.solar[0][0] = -0;
  assert.match(rustMoonData(data), /f64::from_bits\(0x8000000000000000\)/);
});
