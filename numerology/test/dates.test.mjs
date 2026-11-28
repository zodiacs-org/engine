import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseGregorianDate, lifePath, birthday, NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS
} from "../.build/index.js";

const fixtures = JSON.parse(readFileSync(new URL("fixtures/dates.json", import.meta.url), "utf8"));
const components = ["year", "month", "day"];

// Separate positional integer implementation for expected paths and receipt replay.
function expectedPath(input, policy) {
  const path = [input];
  while (input > 9 && !(policy === "preserve" && [11, 22, 33].includes(input))) {
    let sum = 0;
    while (input > 0) {
      sum += input % 10;
      input = Math.floor(input / 10);
    }
    input = sum;
    path.push(input);
  }
  return path;
}

function pathOf(result, policy) {
  const path = [Number(result.receipt.input), ...result.receipt.steps.map((step) => Number(step.output))];
  assert.deepEqual(path, expectedPath(path[0], policy));
  assert.equal(result.value, path.at(-1));
  assert.equal(result.receipt.masterNumbers, policy);
  assert.equal(result.meaning, NUMBER_MEANINGS[result.value]);
  for (const [index, step] of result.receipt.steps.entries()) {
    assert.equal(step.input, String(path[index]));
    assert.deepEqual(step.digits, [...step.input].map(Number));
    assert.equal(step.digits.reduce((a, b) => a + b, 0), path[index + 1]);
  }
  return path;
}

function debtsOf(path, source) {
  return path.flatMap((number, stage) => [13, 14, 16, 19].includes(number)
    ? [{ number, stage, source, meaning: KARMIC_DEBT_MEANINGS[number] }] : []);
}

function checkLifeReceipt(result, date, method, policy) {
  const receipt = result.receipt;
  assert.equal(receipt.schema, "numerology-life-path/1");
  assert.equal(receipt.date.iso, date);
  assert.equal(receipt.date.calendar, "proleptic-gregorian");
  assert.equal(receipt.method, method);
  assert.equal(receipt.masterNumbers, policy);
  let inputs;
  let debts = [];
  if (method === "components") {
    assert.deepEqual(receipt.components.map((row) => row.component), components);
    inputs = receipt.components.map(({ component, reduction }) => {
      assert.equal(reduction.receipt.input, String(receipt.date[component]));
      debts.push(...debtsOf(pathOf(reduction, policy), component));
      return reduction.value;
    });
  } else {
    assert.deepEqual(receipt.components, []);
    inputs = [...date.replaceAll("-", "")].map(Number);
  }
  assert.deepEqual(receipt.sum.inputs, inputs);
  assert.equal(receipt.sum.output, inputs.reduce((a, b) => a + b, 0));
  assert.equal(receipt.reduction.receipt.input, String(receipt.sum.output));
  debts.push(...debtsOf(pathOf(receipt.reduction, policy), "total"));
  assert.deepEqual(result.karmicDebts, debts);
  assert.equal(result.value, receipt.reduction.value);
  assert.equal(result.meaning, receipt.reduction.meaning);
}

for (const fixture of fixtures.lifePaths) {
  test(`handwritten life-path fixture: ${fixture.id}`, () => {
    const result = lifePath(fixture.date, { method: fixture.method, masterNumbers: fixture.policy });
    checkLifeReceipt(result, fixture.date, fixture.method, fixture.policy);
    assert.deepEqual(result.receipt.sum.inputs, fixture.inputs);
    assert.deepEqual(result.receipt.components.map((row) => pathOf(row.reduction, fixture.policy)), fixture.components);
    assert.deepEqual(pathOf(result.receipt.reduction, fixture.policy), fixture.path);
    assert.deepEqual(result.karmicDebts.map(({ number, stage, source }) => ({ number, stage, source })), fixture.debts);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  });
}

for (const fixture of fixtures.birthdays) {
  test(`handwritten birthday fixture: ${fixture.date}, ${fixture.policy}`, () => {
    const result = birthday(fixture.date, { masterNumbers: fixture.policy });
    assert.deepEqual(pathOf(result.receipt.reduction, fixture.policy), fixture.path);
    assert.deepEqual(result.karmicDebts, debtsOf(fixture.path, "day"));
    assert.equal(result.value, fixture.path.at(-1));
    assert.equal(result.meaning, NUMBER_MEANINGS[result.value]);
    assert.equal(result.receipt.schema, "numerology-birthday/1");
    assert.equal(result.receipt.date.iso, fixture.date);
    assert.equal(result.receipt.masterNumbers, fixture.policy);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  });
}

test("full date receipt includes a component sum and original civil date", () => {
  const reduceOne = (input, digits, output) => ({
    value: output, meaning: NUMBER_MEANINGS[output], karmicDebts: [],
    receipt: { schema: "numerology-reduction/1", input: String(input), masterNumbers: "preserve",
      steps: [{ input: String(input), digits, output: String(output) }], stopReason: "single-digit" }
  });
  assert.deepEqual(lifePath("2001-12-21"), {
    value: 9, meaning: NUMBER_MEANINGS[9], karmicDebts: [],
    receipt: {
      schema: "numerology-life-path/1",
      date: { calendar: "proleptic-gregorian", iso: "2001-12-21", year: 2001, month: 12, day: 21 },
      method: "components", masterNumbers: "preserve",
      components: [
        { component: "year", reduction: reduceOne(2001, [2, 0, 0, 1], 3) },
        { component: "month", reduction: reduceOne(12, [1, 2], 3) },
        { component: "day", reduction: reduceOne(21, [2, 1], 3) }
      ],
      sum: { inputs: [3, 3, 3], output: 9 },
      reduction: { value: 9, meaning: NUMBER_MEANINGS[9], karmicDebts: [],
        receipt: { schema: "numerology-reduction/1", input: "9", masterNumbers: "preserve",
          steps: [], stopReason: "single-digit" } }
    }
  });
});

test("strict Gregorian syntax, calendar boundaries, and leap centuries", () => {
  for (const input of ["0001-01-01", "0099-12-31", "0100-03-01", "0400-02-29",
    "1582-10-10", "1600-02-29", "1900-02-28", "2000-02-29", "2400-02-29", "9999-12-31"]) {
    const [year, month, day] = input.split("-").map(Number);
    assert.deepEqual(parseGregorianDate(input), { calendar: "proleptic-gregorian", iso: input, year, month, day });
  }
  for (const input of ["", "0000-01-01", "10000-01-01", "-0001-01-01", "+002000-01-01",
    "2000-00-01", "2000-13-01", "2000-01-00", "2000-01-32", "2000-04-31", "2000-02-30",
    "0100-02-29", "1900-02-29", "2100-02-29", "2001-02-29", "2000-1-01", "2000-01-1",
    " 2000-01-01", "2000-01-01 ", "2000-01-01\n", "2000/01/01", "01-01-2000",
    "2000-01-01T00:00:00Z", "2000-01-01T00:00:00+14:00", "２０００-０１-０１", "٢٠٠٠-٠١-٠١"]) {
    for (const calculate of [parseGregorianDate, lifePath, birthday]) {
      assert.throws(() => calculate(input), RangeError, input);
    }
  }
  const malicious = { toString() { throw new Error("must not coerce"); } };
  for (const input of [null, undefined, 20000101, 0n, true, [], {}, new Date(0), new String("2000-01-01"), malicious]) {
    for (const calculate of [parseGregorianDate, lifePath, birthday]) {
      assert.throws(() => calculate(input), TypeError);
    }
  }
});

test("exhaustive Gregorian cycle agrees with independent UTC Date normalization", () => {
  for (let year = 1600; year < 2000; year++) {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 32; day++) {
        const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const reference = new Date(Date.UTC(year, month - 1, day));
        const valid = reference.getUTCFullYear() === year && reference.getUTCMonth() === month - 1;
        if (valid) assert.equal(parseGregorianDate(iso).day, day);
        else assert.throws(() => parseGregorianDate(iso), RangeError);
      }
    }
  }
});

test("seeded civil-date arithmetic, debt provenance, and birthday properties", () => {
  let seed = 0x4e554d32;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let sample = 0; sample < 1000; sample++) {
    const year = 1 + next() % 9999;
    const month = 1 + next() % 12;
    const day = 1 + next() % 28;
    const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const single = (n) => 1 + (n - 1) % 9;
    for (const policy of ["preserve", "reduce"]) {
      for (const method of ["components", "whole-date"]) {
        const result = lifePath(date, { method, masterNumbers: policy });
        const total = method === "components"
          ? [year, month, day].map((n) => expectedPath(n, policy).at(-1)).reduce((a, b) => a + b, 0)
          : [...date.replaceAll("-", "")].reduce((a, b) => a + Number(b), 0);
        assert.equal(result.value, expectedPath(total, policy).at(-1));
        assert.equal(single(result.value), single(year + month + day));
        if (policy === "reduce") assert.equal(result.value, single(year + month + day));
        checkLifeReceipt(result, date, method, policy);
      }
      const result = birthday(date, { masterNumbers: policy });
      const path = expectedPath(day, policy);
      assert.equal(result.value, path.at(-1));
      assert.deepEqual(result.karmicDebts, debtsOf(path, "day"));
      assert.deepEqual(pathOf(result.receipt.reduction, policy), path);
    }
  }
  // Cover every day, including days outside the seeded always-valid subset.
  for (let day = 1; day <= 31; day++) {
    const date = `2000-01-${String(day).padStart(2, "0")}`;
    for (const policy of ["preserve", "reduce"]) {
      assert.equal(birthday(date, { masterNumbers: policy }).value, expectedPath(day, policy).at(-1));
      assert.equal(birthday(date, { masterNumbers: policy }).value,
        birthday(`9999-12-${String(day).padStart(2, "0")}`, { masterNumbers: policy }).value);
    }
  }
});

test("defaults, strict options, snapshots, and deep immutability", () => {
  const date = "1990-04-13";
  const options = Object.freeze({ method: "components", masterNumbers: "preserve" });
  assert.deepEqual(lifePath(date), lifePath(date, options));
  assert.deepEqual(lifePath(date), lifePath(date, { method: undefined, masterNumbers: undefined }));
  assert.deepEqual(birthday(date), birthday(date, { masterNumbers: undefined }));
  for (const calculate of [lifePath, birthday]) {
    for (const options of [null, false, [], "components", 1]) {
      assert.throws(() => calculate(date, options), TypeError);
    }
    for (const options of [{ masterNumbers: null }, { masterNumbers: false }, { masterNumbers: "PRESERVE" },
      { masterNumber: "reduce" }, { timezone: "UTC" }, { [Symbol("unknown")]: true }]) {
      assert.throws(() => calculate(date, options), RangeError);
    }
  }
  for (const method of [null, false, "whole", "Components", 0]) {
    assert.throws(() => lifePath(date, { method }), RangeError);
  }
  assert.throws(() => birthday(date, { method: "components" }), RangeError);
  let policyReads = 0;
  let methodReads = 0;
  lifePath(date, {
    get masterNumbers() { policyReads++; return "preserve"; },
    get method() { methodReads++; return "components"; }
  });
  assert.equal(policyReads, 1);
  assert.equal(methodReads, 1);
  function frozen(value) {
    if (value === null || typeof value !== "object") return;
    assert(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
  for (const result of [parseGregorianDate(date), lifePath(date), lifePath(date, { method: "whole-date" }), birthday(date)]) {
    frozen(result);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
  assert.notEqual(lifePath(date).receipt, lifePath(date).receipt);
  assert.notEqual(birthday(date).receipt, birthday(date).receipt);
  assert.notEqual(parseGregorianDate(date), parseGregorianDate(date));
});

test("civil-date calculations are identical across host timezones", () => {
  const script = `import {lifePath,birthday,parseGregorianDate} from './.build/index.js';
    console.log(JSON.stringify(['0001-01-01','2000-02-29','9999-12-31'].map(date =>
      [parseGregorianDate(date),lifePath(date),lifePath(date,{method:'whole-date'}),birthday(date)])));`;
  const outputs = ["UTC", "Pacific/Kiritimati", "America/New_York"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: new URL("../", import.meta.url), env: { ...process.env, TZ }, encoding: "utf8"
    }));
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[0], outputs[2]);
});
