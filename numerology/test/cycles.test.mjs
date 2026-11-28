import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  personalYear, personalMonth, personalDay, NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS
} from "../.build/index.js";

const fixtures = JSON.parse(readFileSync(new URL("fixtures/cycles.json", import.meta.url), "utf8"));
const calculators = [personalYear, personalMonth, personalDay];
const cycles = ["personal-year", "personal-month", "personal-day"];
const sources = ["birth-month", "birth-day", "target-year"];

// Independent positional bigint arithmetic, without calling the library reducer.
function pathOfInteger(value, policy) {
  let current = BigInt(value);
  const path = [Number(current)];
  while (current > 9n && !(policy === "preserve" && [11n, 22n, 33n].includes(current))) {
    let sum = 0n;
    for (; current > 0n; current /= 10n) sum += current % 10n;
    current = sum;
    path.push(Number(current));
  }
  return path;
}

function debtsFor(path, source) {
  return path.flatMap((number, stage) => [13, 14, 16, 19].includes(number)
    ? [{ number, stage, source, meaning: KARMIC_DEBT_MEANINGS[number] }] : []);
}

function checkReduction(result, input, policy) {
  const path = pathOfInteger(input, policy);
  assert.deepEqual(result, {
    value: path.at(-1), meaning: NUMBER_MEANINGS[path.at(-1)],
    karmicDebts: debtsFor(path, "unused").map(({ source, ...debt }) => debt),
    receipt: {
      schema: "numerology-reduction/1", input: String(input), masterNumbers: policy,
      steps: path.slice(1).map((output, index) => ({
        input: String(path[index]), digits: [...String(path[index])].map(Number), output: String(output)
      })),
      stopReason: path.at(-1) > 9 ? "master-number" : "single-digit"
    }
  });
  return path;
}

function civil(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { calendar: "proleptic-gregorian", iso, year, month, day };
}

function checkReceipt(result, birth, target, policy, count) {
  const receipt = result.receipt;
  assert.equal(receipt.schema, "numerology-personal-cycle/1");
  assert.equal(receipt.calculation, cycles[count - 1]);
  assert.equal(receipt.convention, "year-components;year-plus-raw-month;month-plus-raw-day/1");
  assert.equal(receipt.yearBoundary, "january-1");
  assert.equal(receipt.monthBoundary, "first-of-month");
  assert.equal(receipt.dayBoundary, "civil-date");
  assert.equal(receipt.masterNumbers, policy);
  assert.deepEqual(receipt.birthDate, civil(birth));
  assert.deepEqual(receipt.targetDate, civil(target));
  assert.deepEqual(receipt.components.map((row) => row.component), sources);
  const inputs = [civil(birth).month, civil(birth).day, civil(target).year];
  const debts = [];
  const reduced = receipt.components.map(({ component, reduction }, index) => {
    const path = checkReduction(reduction, inputs[index], policy);
    debts.push(...debtsFor(path, component));
    return path.at(-1);
  });
  assert.equal(receipt.stages.length, count);
  let value;
  for (const [index, stage] of receipt.stages.entries()) {
    assert.equal(stage.cycle, cycles[index]);
    const expectedInputs = index === 0 ? reduced : [value, index === 1 ? civil(target).month : civil(target).day];
    const output = expectedInputs.reduce((a, b) => a + b, 0);
    assert.deepEqual(stage.sum, { inputs: expectedInputs, output });
    const path = checkReduction(stage.reduction, output, policy);
    debts.push(...debtsFor(path, stage.cycle));
    value = path.at(-1);
  }
  assert.equal(result.value, value);
  assert.equal(result.meaning, NUMBER_MEANINGS[value]);
  assert.deepEqual(result.karmicDebts, debts);
  return receipt;
}

for (const fixture of fixtures.cases) {
  test(`handwritten cycle fixture: ${fixture.id}`, () => {
    for (const [index, calculate] of calculators.entries()) {
      const result = calculate(fixture.birth, fixture.target, { masterNumbers: fixture.policy });
      const receipt = checkReceipt(result, fixture.birth, fixture.target, fixture.policy, index + 1);
      assert.deepEqual(receipt.components.map(({ reduction }) =>
        [Number(reduction.receipt.input), ...reduction.receipt.steps.map((step) => Number(step.output))]),
      fixture.components);
      assert.deepEqual(receipt.stages.map((stage) => stage.sum.inputs), fixture.inputs.slice(0, index + 1));
      assert.deepEqual(receipt.stages.map(({ reduction }) =>
        [Number(reduction.receipt.input), ...reduction.receipt.steps.map((step) => Number(step.output))]),
      fixture.paths.slice(0, index + 1));
      const applicable = [...sources, ...cycles.slice(0, index + 1)];
      assert.deepEqual(result.karmicDebts.map(({ source, number, stage }) => [source, number, stage]),
        fixture.debts.filter(([source]) => applicable.includes(source)));
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    }
  });
}

test("complete small receipt pins the cycle envelope and ordered operations", () => {
  const simple = (input, value, steps = []) => ({
    value, meaning: NUMBER_MEANINGS[value], karmicDebts: [],
    receipt: { schema: "numerology-reduction/1", input: String(input), masterNumbers: "preserve",
      steps, stopReason: "single-digit" }
  });
  const date = { calendar: "proleptic-gregorian", iso: "2000-01-01", year: 2000, month: 1, day: 1 };
  assert.deepEqual(personalDay(date.iso, date.iso), {
    value: 6, meaning: NUMBER_MEANINGS[6], karmicDebts: [],
    receipt: {
      schema: "numerology-personal-cycle/1", calculation: "personal-day",
      convention: "year-components;year-plus-raw-month;month-plus-raw-day/1",
      yearBoundary: "january-1", monthBoundary: "first-of-month", dayBoundary: "civil-date",
      birthDate: date, targetDate: date, masterNumbers: "preserve",
      components: [
        { component: "birth-month", reduction: simple(1, 1) },
        { component: "birth-day", reduction: simple(1, 1) },
        { component: "target-year", reduction: simple(2000, 2,
          [{ input: "2000", digits: [2, 0, 0, 0], output: "2" }]) }
      ],
      stages: [
        { cycle: "personal-year", sum: { inputs: [1, 1, 2], output: 4 }, reduction: simple(4, 4) },
        { cycle: "personal-month", sum: { inputs: [4, 1], output: 5 }, reduction: simple(5, 5) },
        { cycle: "personal-day", sum: { inputs: [5, 1], output: 6 }, reduction: simple(6, 6) }
      ]
    }
  });
});

test("calendar boundaries, birthday independence, and leap-day births without anniversary inference", () => {
  const birth = "2000-02-29";
  assert.equal(personalYear(birth, "2023-12-31").value, 2);
  assert.equal(personalYear(birth, "2024-01-01").value, 3);
  for (const target of ["2024-02-28", "2024-02-29", "2024-03-01", "2024-12-31"]) {
    assert.equal(personalYear(birth, target).value, 3);
  }
  assert.equal(personalMonth(birth, "2024-02-29").value, 5);
  assert.equal(personalMonth(birth, "2024-03-01").value, 6);
  assert.equal(personalDay(birth, "2024-02-28").value, 33);
  assert.equal(personalDay(birth, "2024-02-29").value, 7);
  assert.equal(personalDay(birth, "2024-03-01").value, 7);
  // A changed calendar day can produce the same symbolic number.
  assert.notDeepEqual(personalDay(birth, "2024-02-29").receipt.stages,
    personalDay(birth, "2024-03-01").receipt.stages);
  assert.equal(personalYear(birth, "2023-02-28").value, 2);
  assert.equal(personalYear(birth, "2023-03-01").value, 2);
});

test("every target day of a leap year replays and has stable year/month prefixes", () => {
  const birth = "2000-02-29";
  const lengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (const policy of ["preserve", "reduce"]) {
    const year = personalYear(birth, "2024-01-01", { masterNumbers: policy });
    for (let month = 1; month <= 12; month++) {
      let monthStages;
      for (let day = 1; day <= lengths[month - 1]; day++) {
        const target = `2024-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const result = personalDay(birth, target, { masterNumbers: policy });
        checkReceipt(result, birth, target, policy, 3);
        assert.deepEqual(result.receipt.stages.slice(0, 1), year.receipt.stages);
        const prefix = result.receipt.stages.slice(0, 2);
        if (day === 1) monthStages = personalMonth(birth, target, { masterNumbers: policy }).receipt.stages;
        assert.deepEqual(prefix, monthStages);
      }
    }
  }
});

test("seeded synthetic dates check independent arithmetic, prefixes, birth-year invariance, and digital roots", () => {
  let seed = 0x7c1c1e;
  const random = (maximum) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % maximum;
  };
  const iso = () => `${String(1 + random(9999)).padStart(4, "0")}-${String(1 + random(12)).padStart(2, "0")}-${String(1 + random(28)).padStart(2, "0")}`;
  for (let trial = 0; trial < 2048; trial++) {
    const birth = iso();
    const target = iso();
    for (const policy of ["preserve", "reduce"]) {
      const options = { masterNumbers: policy };
      const results = calculators.map((calculate, index) => {
        const result = calculate(birth, target, options);
        checkReceipt(result, birth, target, policy, index + 1);
        const otherBirth = `2000${birth.slice(4)}`;
        const other = calculate(otherBirth, target, options);
        assert.equal(other.value, result.value);
        assert.deepEqual(other.receipt.components, result.receipt.components);
        assert.deepEqual(other.receipt.stages, result.receipt.stages);
        assert.deepEqual(other.karmicDebts, result.karmicDebts);
        for (const stage of result.receipt.stages) {
          assert.equal(1 + ((stage.reduction.value - 1) % 9), 1 + ((stage.sum.output - 1) % 9));
        }
        return result;
      });
      assert.deepEqual(results[1].receipt.stages.slice(0, 1), results[0].receipt.stages);
      assert.deepEqual(results[2].receipt.stages.slice(0, 2), results[1].receipt.stages);
    }
  }
});

test("all target years, including master target years and the domain edges, use exact components", () => {
  for (let year = 1; year <= 9999; year++) {
    const target = `${String(year).padStart(4, "0")}-11-22`;
    for (const policy of ["preserve", "reduce"]) {
      checkReceipt(personalYear("2000-11-22", target, { masterNumbers: policy }),
        "2000-11-22", target, policy, 1);
    }
  }
});

test("rejects invalid birth and target dates and options without coercion or clock defaults", () => {
  for (const calculate of calculators) {
    for (const bad of [undefined, null, 20000101, 0n, {}, [], true, new Date(0), new String("2000-01-01")]) {
      assert.throws(() => calculate(bad, "2000-01-01"), TypeError);
      assert.throws(() => calculate("2000-01-01", bad), TypeError);
    }
    for (const bad of ["", "0000-01-01", "10000-01-01", "2001-02-29", "1900-02-29", "2024-04-31",
      "2000-13-01", "2000-01-00", "2000-1-01", "2000-01-01T00:00:00Z", " 2000-01-01", "２０００-０１-０１"]) {
      assert.throws(() => calculate(bad, "2000-01-01"), RangeError);
      assert.throws(() => calculate("2000-01-01", bad), RangeError);
    }
    for (const bad of [null, [], "preserve", 1, true, () => {}]) {
      assert.throws(() => calculate("2000-01-01", "2026-10-15", bad), TypeError);
    }
    for (const bad of [{ masterNumbers: null }, { masterNumbers: "sometimes" }, { masterNumbers: false },
      { system: "chaldean" }, { method: "whole-date" }, { boundary: "birthday" }, { [Symbol()]: true }]) {
      assert.throws(() => calculate("2000-01-01", "2026-10-15", bad), RangeError);
    }
    assert.deepEqual(calculate("2000-01-01", "2026-10-15", { masterNumbers: undefined }),
      calculate("2000-01-01", "2026-10-15"));
  }
});

function assertFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert(Object.isFrozen(value));
  for (const child of Object.values(value)) assertFrozen(child);
}

test("deep freezing, fresh allocation, and options ownership", () => {
  for (const calculate of calculators) {
    const options = { masterNumbers: "preserve" };
    const result = calculate("2000-11-02", "2025-11-11", options);
    assertFrozen(result);
    assert(!Object.isFrozen(options));
    options.masterNumbers = "reduce";
    assert.equal(result.receipt.masterNumbers, "preserve");
    const fresh = calculate("2000-11-02", "2025-11-11");
    assert.deepEqual(fresh, result);
    assert.notEqual(fresh.receipt.components, result.receipt.components);
    assert.notEqual(fresh.receipt.stages[0].reduction, result.receipt.stages[0].reduction);
    assert.throws(() => { result.receipt.stages[0].sum.inputs[0] = 0; }, TypeError);
    let reads = 0;
    calculate("2000-11-02", "2025-11-11", { get masterNumbers() { reads++; return "preserve"; } });
    assert.equal(reads, 1);
  }
});

test("import and cycles run with Date and network disabled and ignore the host timezone", () => {
  const moduleUrl = new URL("../.build/index.js", import.meta.url).href;
  const script = `
    const forbidden = () => { throw new Error("unexpected ambient dependency"); };
    globalThis.Date = class { constructor() { forbidden(); } static now = forbidden; static UTC = forbidden; static parse = forbidden; };
    globalThis.fetch = forbidden;
    for (const name of ["node:http", "node:https", "node:net", "node:dns"]) {
      const module = (await import(name)).default;
      for (const key of ["request", "get", "connect", "createConnection", "lookup", "resolve"]) {
        if (key in module) module[key] = forbidden;
      }
    }
    const library = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify(["personalYear", "personalMonth", "personalDay"].map((name) =>
      library[name]("2000-02-29", "2024-12-31"))));
  `;
  const outputs = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ }, encoding: "utf8"
    }));
  assert(outputs.every((output) => output === outputs[0]));
  const expected = calculators.map((calculate) => calculate("2000-02-29", "2024-12-31"));
  assert.deepEqual(JSON.parse(outputs[0]), expected);
});
