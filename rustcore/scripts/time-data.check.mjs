import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkedSource, readTimeInputs, rustTimeData, SOURCE_DIGESTS, tsTimeData } from "./generate-time-data.mjs";

test("time inputs reject byte changes before extraction", () => {
  for (const path of Object.keys(SOURCE_DIGESTS)) {
    const text = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.equal(checkedSource(path, text), text);
    assert.throws(() => checkedSource(path, `${text}\n`), /Unreviewed time input/);
    assert.throws(() => checkedSource(path, text.replace(/\d/, "9")), /Unreviewed time input/);
  }
});

test("generated Rust and TypeScript data are deterministic and retain provenance", () => {
  const first = readTimeInputs();
  const second = readTimeInputs();
  assert.deepEqual(first, second);
  assert.equal(rustTimeData(first), rustTimeData(second));
  assert.equal(tsTimeData(first), tsTimeData(second));
  for (const output of [rustTimeData(first), tsTimeData(first)]) {
    assert.match(output, /CC BY 4.0/);
    assert.match(output, /rustcore\/NOTICE/);
    assert.match(output, /rustcore\/PROVENANCE.md/);
    assert(output.length < 2_000_000);
    assert(output.includes(first.table.digest));
    assert(output.includes(first.ut1Data.digest));
  }
  // The two first decoded entries expose an off-by-one error in the packed
  // difference decoder before any interpolation can conceal it.
  assert.equal(first.knots[0], first.ut1Data.first);
  assert.equal(first.knots[1], first.ut1Data.first + first.ut1Data.slope);
  assert.equal(first.knots.length, first.bounds.UT1_GRID_BEFORE +
    Math.ceil((first.ut1Data.to - first.ut1Data.finalsFrom) / first.ut1Data.step) + 1);
  assert(first.knots.every(Number.isSafeInteger));
  assert.equal(first.sy.length, first.sx.length + (1945 - 1850) / 5 + 1);
});

test("metadata translation preserves literal values and freezes the build snapshot", async () => {
  const data = readTimeInputs();
  // Erase the generated TS type assertions only, then load the output.
  const javascript = tsTimeData(data).replaceAll(" as const", "").replace(" as readonly [number, number]", "");
  const metadata = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
  assert.deepEqual(metadata.DELTA_T_TABLE, data.table);
  assert.deepEqual(metadata.LEAP_SECOND_LIST, data.leapList);
  assert.deepEqual(metadata.UT1_DATA, data.ut1Data);
  assert(Object.isFrozen(metadata.DELTA_T_TABLE));
  assert(Object.isFrozen(metadata.DELTA_T_TABLE.knots));
  assert(Object.isFrozen(metadata.LEAP_SECOND_LIST.changes));
  assert(metadata.LEAP_SECOND_LIST.changes.every(Object.isFrozen));
  assert(Object.isFrozen(metadata.UT1_DATA));
  assert(Object.isFrozen(metadata.UT1_DATA.observedErrors));
  assert(Object.isFrozen(metadata.UT1_DATA.predictedErrors));
});
