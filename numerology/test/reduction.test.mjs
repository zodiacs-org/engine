import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  reduceInteger, MAX_INTEGER_DIGITS, NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS
} from "../.build/index.js";

const cases = JSON.parse(readFileSync(new URL("fixtures/reductions.json", import.meta.url), "utf8"));

function replay(result) {
  let current = result.receipt.input;
  const path = [current];
  for (const step of result.receipt.steps) {
    assert.equal(step.input, current);
    assert.deepEqual(step.digits, [...current].map(Number));
    // Independently replay with arbitrary-precision positional arithmetic.
    let remaining = BigInt(current);
    let total = 0n;
    do {
      total += remaining % 10n;
      remaining /= 10n;
    } while (remaining > 0n);
    assert.equal(step.output, String(total));
    assert(total < BigInt(current));
    assert(current.length > 1);
    if (result.receipt.masterNumbers === "preserve") {
      assert(!["11", "22", "33"].includes(current));
    }
    current = step.output;
    path.push(current);
  }
  assert.equal(String(result.value), current);
  assert.equal(result.receipt.stopReason,
    current.length === 1 ? "single-digit" : "master-number");
  assert(current.length === 1 ||
    (result.receipt.masterNumbers === "preserve" && ["11", "22", "33"].includes(current)));
  const debts = path.flatMap((value, stage) =>
    ["13", "14", "16", "19"].includes(value) ? [{ number: Number(value), stage }] : []);
  assert.deepEqual(result.karmicDebts.map(({ number, stage }) => ({ number, stage })), debts);
  assert.equal(result.meaning, NUMBER_MEANINGS[result.value]);
  for (const debt of result.karmicDebts) {
    assert.equal(debt.meaning, KARMIC_DEBT_MEANINGS[debt.number]);
  }
  return path;
}

for (const fixture of cases) {
  test(`handwritten reduction fixture: ${fixture.id}`, () => {
    const result = reduceInteger(fixture.input, { masterNumbers: fixture.policy });
    assert.equal(result.value, fixture.value);
    assert.deepEqual(replay(result), fixture.path);
    assert.deepEqual(result.karmicDebts.map(({ number, stage }) => ({ number, stage })), fixture.debts);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  });
}

test("receipt schema and full intermediate-debt example", () => {
  assert.deepEqual(reduceInteger(49), {
    value: 4,
    meaning: NUMBER_MEANINGS[4],
    karmicDebts: [{ number: 13, stage: 1, meaning: KARMIC_DEBT_MEANINGS[13] }],
    receipt: {
      schema: "numerology-reduction/1", input: "49", masterNumbers: "preserve",
      steps: [
        { input: "49", digits: [4, 9], output: "13" },
        { input: "13", digits: [1, 3], output: "4" }
      ],
      stopReason: "single-digit"
    }
  });
});

test("equivalent supported integer representations and options", () => {
  for (const fixture of cases) {
    const opts = { masterNumbers: fixture.policy };
    const expected = reduceInteger(fixture.input, opts);
    assert.deepEqual(reduceInteger(BigInt(fixture.input), opts), expected);
    if (BigInt(fixture.input) <= BigInt(Number.MAX_SAFE_INTEGER)) {
      assert.deepEqual(reduceInteger(Number(fixture.input), opts), expected);
    }
    assert.deepEqual(opts, { masterNumbers: fixture.policy });
  }
  assert.deepEqual(reduceInteger(-0), reduceInteger(0));
  assert.deepEqual(reduceInteger(29), reduceInteger(29, { masterNumbers: undefined }));
});

test("invalid integers reject without coercion", () => {
  for (const input of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, -1n,
    "", " ", " 11", "11 ", "+11", "-0", "1.0", "1e2", "0x10", "1_000", "１２", "١١", "11\n"]) {
    assert.throws(() => reduceInteger(input), RangeError, String(input));
  }
  for (const input of [null, undefined, true, [], {}, new Number(11), { toString: () => "11" }]) {
    assert.throws(() => reduceInteger(input), TypeError);
  }
});

test("invalid options and misspellings reject", () => {
  for (const options of [null, false, "preserve", [], 0]) {
    assert.throws(() => reduceInteger(11, options), TypeError);
  }
  for (const options of [{ masterNumbers: null }, { masterNumbers: true },
    { masterNumbers: "Preserve" }, { masterNumber: "reduce" }, { [Symbol("option")]: 1 }]) {
    assert.throws(() => reduceInteger(11, options), RangeError);
  }
});

test("decimal allocation bound includes leading zeroes", () => {
  assert.equal(MAX_INTEGER_DIGITS, 1024);
  replay(reduceInteger("9".repeat(MAX_INTEGER_DIGITS)));
  assert.equal(reduceInteger("0".repeat(MAX_INTEGER_DIGITS)).value, 0);
  assert.throws(() => reduceInteger("9".repeat(MAX_INTEGER_DIGITS + 1)), RangeError);
  assert.throws(() => reduceInteger("0".repeat(MAX_INTEGER_DIGITS + 1)), RangeError);
  assert.throws(() => reduceInteger(10n ** BigInt(MAX_INTEGER_DIGITS)), RangeError);
});

test("every result layer and meaning table is immutable", () => {
  const result = reduceInteger(49);
  for (const object of [result, result.receipt, result.receipt.steps,
    ...result.receipt.steps, ...result.receipt.steps.map((s) => s.digits),
    result.karmicDebts, ...result.karmicDebts, NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS]) {
    assert(Object.isFrozen(object));
  }
  assert.throws(() => { result.receipt.steps[0].digits[0] = 0; }, TypeError);
  assert.throws(() => { result.karmicDebts[0].stage = 0; }, TypeError);
  assert.deepEqual(reduceInteger(49), result);
  assert.notEqual(reduceInteger(49), result);
  assert.notEqual(reduceInteger(49).receipt, result.receipt);
});

test("all supported numbers and debts have original nonempty meaning text", () => {
  assert.deepEqual(Object.keys(NUMBER_MEANINGS).map(Number), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);
  assert.deepEqual(Object.keys(KARMIC_DEBT_MEANINGS).map(Number), [13, 14, 16, 19]);
  const meanings = [...Object.values(NUMBER_MEANINGS), ...Object.values(KARMIC_DEBT_MEANINGS)];
  for (const text of meanings) assert.equal(typeof text === "string" && text.trim().length > 0, true);
  assert.equal(new Set(meanings).size, meanings.length);
});

test("exhaustive integer properties against the independent digital-root formula", () => {
  for (let input = 0; input <= 9999; input++) {
    const reduced = reduceInteger(input, { masterNumbers: "reduce" });
    const expected = input === 0 ? 0 : 1 + ((input - 1) % 9);
    assert.equal(reduced.value, expected);
    replay(reduced);
    const preserved = reduceInteger(input);
    replay(preserved);
    assert.equal(preserved.value === 0 ? 0 : 1 + ((preserved.value - 1) % 9), expected);
    assert.deepEqual(reduceInteger(preserved.value), {
      value: preserved.value, meaning: preserved.meaning, karmicDebts: [],
      receipt: { schema: "numerology-reduction/1", input: String(preserved.value),
        masterNumbers: "preserve", steps: [], stopReason: preserved.receipt.stopReason }
    });
  }
});

test("seeded long-decimal properties preserve exact arithmetic beyond safe integers", () => {
  let seed = 0x4e554d31;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let sample = 0; sample < 250; sample++) {
    const length = 17 + next() % 496;
    const decimal = String(1 + next() % 9) + Array.from({ length: length - 1 }, () => next() % 10).join("");
    const exact = BigInt(decimal);
    const expected = Number(1n + (exact - 1n) % 9n);
    const result = reduceInteger(decimal, { masterNumbers: "reduce" });
    assert.equal(result.value, expected);
    replay(result);
    const preserved = reduceInteger(decimal);
    replay(preserved);
    assert.equal(Number(1n + (BigInt(preserved.value) - 1n) % 9n), expected);
    assert.deepEqual(reduceInteger(exact), preserved);
    assert.deepEqual(reduceInteger("000" + decimal), preserved);
  }
});
