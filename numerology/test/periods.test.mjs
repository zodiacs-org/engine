import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  pinnacles, challenges, CHALLENGE_MEANINGS, NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS
} from "../.build/index.js";

const fixtures = JSON.parse(readFileSync(new URL("fixtures/periods.json", import.meta.url), "utf8"));
const calculators = [pinnacles, challenges];
const kinds = ["pinnacles", "challenges"];
const componentNames = ["month", "day", "year"];
const pairs = [["month", "day"], ["day", "year"], ["period-1", "period-2"], ["month", "year"]];

// Independent positional bigint division, without the library's string-digit reducer.
function path(input, policy) {
  let value = BigInt(input);
  const visited = [Number(value)];
  while (value > 9n && !(policy === "preserve" && [11n, 22n, 33n].includes(value))) {
    let sum = 0n;
    while (value) { sum += value % 10n; value /= 10n; }
    value = sum;
    visited.push(Number(value));
  }
  return visited;
}

function debts(visited, source) {
  return visited.flatMap((number, stage) => [13, 14, 16, 19].includes(number)
    ? [{ number, stage, meaning: KARMIC_DEBT_MEANINGS[number], ...(source ? { source } : {}) }] : []);
}

function reduction(input, policy) {
  const visited = path(input, policy);
  const value = visited.at(-1);
  return {
    value, meaning: NUMBER_MEANINGS[value], karmicDebts: debts(visited),
    receipt: {
      schema: "numerology-reduction/1", input: String(input), masterNumbers: policy,
      steps: visited.slice(1).map((output, index) => ({ input: String(visited[index]),
        digits: [...String(visited[index])].map(Number), output: String(output) })),
      stopReason: value > 9 ? "master-number" : "single-digit"
    }
  };
}

function civil(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { calendar: "proleptic-gregorian", iso, year, month, day };
}

function expectedLifePath(date, policy, method) {
  const components = method === "components" ? ["year", "month", "day"].map((component) =>
    ({ component, reduction: reduction(date[component], policy) })) : [];
  const inputs = method === "components" ? components.map((row) => row.reduction.value)
    : [...date.iso.replaceAll("-", "")].map(Number);
  const output = inputs.reduce((a, b) => a + b, 0);
  const final = reduction(output, policy);
  return {
    value: final.value, meaning: final.meaning,
    karmicDebts: [...components.flatMap(({ component, reduction: r }) =>
      r.karmicDebts.map((debt) => ({ ...debt, source: component }))),
    ...final.karmicDebts.map((debt) => ({ ...debt, source: "total" }))],
    receipt: { schema: "numerology-life-path/1", date, method, masterNumbers: policy,
      components, sum: { inputs, output }, reduction: final }
  };
}

function replay(result, birth, policy, method, kind) {
  const date = civil(birth);
  const arithmeticPolicy = kind === "challenges" ? "reduce" : policy;
  const components = componentNames.map((component) =>
    ({ component, reduction: reduction(date[component], arithmeticPolicy) }));
  const lifePath = expectedLifePath(date, policy, method);
  const timingReduction = reduction(lifePath.value, "reduce");
  // Independent digital root also checks timing rather than only replaying its path.
  const root = 1 + ((date.year + date.month + date.day - 1) % 9);
  assert.equal(timingReduction.value, root);
  const end = 36 - root;
  const starts = [0, end + 1, end + 10, end + 19];
  const values = Object.fromEntries(components.map((row) => [row.component, row.reduction.value]));
  const periods = pairs.map((pair, index) => {
    const inputs = pair.map((source) => ({ source, value: values[source] }));
    const [a, b] = inputs.map((row) => row.value);
    const output = kind === "pinnacles" ? a + b : a > b ? a - b : b - a;
    const final = reduction(output, arithmeticPolicy);
    values[`period-${index + 1}`] = final.value;
    if (kind === "challenges") {
      assert(final.value >= 0 && final.value <= 8);
      assert.equal(final.receipt.steps.length, 0);
    } else {
      assert.equal(1 + ((final.value - 1) % 9), 1 + ((output - 1) % 9));
    }
    return {
      period: index + 1, ages: { fromInclusive: starts[index], toExclusive: starts[index + 1] ?? null },
      value: final.value, meaning: kind === "challenges" ? CHALLENGE_MEANINGS[final.value] : final.meaning,
      karmicDebts: final.karmicDebts.map((debt) => ({ ...debt, source: `period-${index + 1}` })),
      receipt: { operation: kind === "pinnacles" ? "sum" : "absolute-difference", inputs, output, reduction: final }
    };
  });
  const expected = {
    periods,
    karmicDebts: [...components.flatMap(({ component, reduction: r }) =>
      r.karmicDebts.map((debt) => ({ ...debt, source: component }))),
    ...periods.flatMap((period) => period.karmicDebts)],
    receipt: {
      schema: "numerology-periods/1", calculation: kind,
      convention: kind === "pinnacles" ? "component-sums/1" : "single-digit-absolute-differences/1",
      date, masterNumbers: policy, arithmeticMasterNumbers: arithmeticPolicy, components,
      timing: {
        convention: "inclusive-36-minus-single-digit-life-path;then-nine-ages/1", ageUnit: "attained-years",
        lifePath, reduction: timingReduction, firstEndAge: { minuend: 36, subtrahend: root, output: end },
        boundaries: [{ inputs: [end, 1], output: end + 1 },
          { inputs: [end + 1, 9], output: end + 10 }, { inputs: [end + 10, 9], output: end + 19 }]
      }
    }
  };
  assert.deepEqual(result, expected);
  return expected;
}

function visited(result) {
  return [Number(result.receipt.input), ...result.receipt.steps.map((step) => Number(step.output))];
}

for (const fixture of fixtures.cases) {
  test(`handwritten period fixture: ${fixture.id}`, () => {
    for (const [index, calculate] of calculators.entries()) {
      const result = calculate(fixture.birth, { masterNumbers: fixture.policy, method: fixture.method });
      const kind = kinds[index];
      replay(result, fixture.birth, fixture.policy, fixture.method, kind);
      if (kind === "pinnacles") {
        assert.deepEqual(result.receipt.components.map((row) => visited(row.reduction)), fixture.components);
        assert.deepEqual(result.periods.map((row) => visited(row.receipt.reduction)), fixture.pinnacles);
      } else {
        assert.deepEqual(result.periods.map((row) => row.value), fixture.challenges);
      }
      assert.deepEqual(visited(result.receipt.timing.lifePath.receipt.reduction), fixture.lifePath);
      assert.deepEqual(visited(result.receipt.timing.reduction), fixture.timing);
      assert.equal(result.receipt.timing.firstEndAge.output, fixture.firstEnd);
      assert.deepEqual(result.karmicDebts.map(({ source, number, stage }) => [source, number, stage]),
        kind === "pinnacles" ? fixture.pinnacleDebts : fixture.challengeDebts);
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    }
  });
}

test("complete small receipt exposes all sources, arithmetic, reductions, and age boundaries", () => {
  const result = pinnacles("2000-01-01");
  replay(result, "2000-01-01", "preserve", "components", "pinnacles");
  assert.deepEqual(result.periods.map((row) => row.receipt.inputs), [
    [{ source: "month", value: 1 }, { source: "day", value: 1 }],
    [{ source: "day", value: 1 }, { source: "year", value: 2 }],
    [{ source: "period-1", value: 2 }, { source: "period-2", value: 3 }],
    [{ source: "month", value: 1 }, { source: "year", value: 2 }]
  ]);
  assert.deepEqual(result.periods.map((row) => row.ages), [
    { fromInclusive: 0, toExclusive: 33 }, { fromInclusive: 33, toExclusive: 42 },
    { fromInclusive: 42, toExclusive: 51 }, { fromInclusive: 51, toExclusive: null }
  ]);
});

test("age intervals partition all nonnegative ages and assign boundaries to the next period", () => {
  for (let lifeRoot = 1; lifeRoot <= 9; lifeRoot++) {
    // year 1 + month 1 + chosen day has the requested digital root.
    const day = 1 + ((lifeRoot + 6) % 9);
    const birth = `0001-01-${String(day).padStart(2, "0")}`;
    for (const calculate of calculators) {
      const result = calculate(birth);
      assert.equal(result.receipt.timing.reduction.value, lifeRoot);
      const active = (age) => result.periods.filter(({ ages }) => age >= ages.fromInclusive
        && (ages.toExclusive === null || age < ages.toExclusive)).map((row) => row.period);
      const end = 36 - lifeRoot;
      assert.deepEqual(active(0), [1]);
      assert.deepEqual(active(end), [1]);
      assert.deepEqual(active(end + 1), [2]);
      assert.deepEqual(active(end + 9), [2]);
      assert.deepEqual(active(end + 10), [3]);
      assert.deepEqual(active(end + 18), [3]);
      assert.deepEqual(active(end + 19), [4]);
      assert.deepEqual(active(Number.MAX_SAFE_INTEGER), [4]);
      assert.deepEqual(active(-1), []);
      for (let age = 0; age <= 150; age++) assert.equal(active(age).length, 1);
      for (const { ages } of result.periods.slice(1, 3)) {
        assert.equal(ages.toExclusive - ages.fromInclusive, 9);
      }
    }
  }
});

test("every single-digit component triple checks challenge range, parity, and master-policy invariance", () => {
  const seen = new Set();
  for (let month = 1; month <= 9; month++) for (let day = 1; day <= 9; day++) for (let year = 1; year <= 9; year++) {
    const birth = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const result = challenges(birth);
    replay(result, birth, "preserve", "components", "challenges");
    const [a, b, c, d] = result.periods.map((row) => row.value);
    for (const value of [a, b, c, d]) seen.add(value);
    assert(c <= d); // Reverse triangle inequality on the component differences.
    assert.equal((d - c) % 2, 0);
    const reduced = challenges(birth, { masterNumbers: "reduce", method: "whole-date" });
    assert.deepEqual(result.periods, reduced.periods);
    assert.deepEqual(result.karmicDebts, reduced.karmicDebts);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(Object.keys(CHALLENGE_MEANINGS).map(Number), [...seen].sort((a, b) => a - b));
  assert.notEqual(CHALLENGE_MEANINGS[0], NUMBER_MEANINGS[0]);
});

test("every day of a leap year and seeded full-domain dates replay under every policy and method", () => {
  const lengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dates = lengths.flatMap((length, index) => Array.from({ length }, (_, day) =>
    `2000-${String(index + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`));
  let seed = 0x81a9c4;
  const random = (maximum) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % maximum;
  };
  for (let trial = 0; trial < 2048; trial++) dates.push(
    `${String(1 + random(9999)).padStart(4, "0")}-${String(1 + random(12)).padStart(2, "0")}-${String(1 + random(28)).padStart(2, "0")}`);
  for (const birth of dates) {
    let firstIntervals;
    let firstChallenges;
    for (const policy of ["preserve", "reduce"]) for (const method of ["components", "whole-date"]) {
      for (const [index, calculate] of calculators.entries()) {
        const result = calculate(birth, { masterNumbers: policy, method });
        replay(result, birth, policy, method, kinds[index]);
        const intervals = result.periods.map((row) => row.ages);
        if (!firstIntervals) firstIntervals = intervals;
        assert.deepEqual(intervals, firstIntervals);
        if (index === 1) {
          if (!firstChallenges) firstChallenges = result.periods;
          assert.deepEqual(result.periods, firstChallenges);
        }
      }
    }
  }
});

test("debts are source-local, retain separate occurrences, and never leak from timing or inputs", () => {
  const result = pinnacles("2003-08-06");
  assert.equal(result.receipt.timing.lifePath.karmicDebts[0].number, 19);
  assert(!result.karmicDebts.some((debt) => debt.number === 19));
  // Period three uses the reduced first and second pinnacles, not their compounds.
  assert.deepEqual(result.periods[2].receipt.inputs.map((row) => row.value), [5, 11]);
  assert.deepEqual(result.periods[2].karmicDebts.map((debt) => debt.number), [16]);
  const leap = pinnacles("2000-02-29");
  assert.deepEqual(leap.karmicDebts.map((debt) => debt.source), ["period-1", "period-2"]);
  assert.deepEqual(leap.periods[2].karmicDebts, []);
  const challenge = challenges("0016-11-16");
  assert.deepEqual(challenge.karmicDebts.map(({ source, number, stage }) => [source, number, stage]),
    [["day", 16, 0], ["year", 16, 0]]);
  assert(challenge.periods.every((row) => row.karmicDebts.length === 0));
});

test("strict civil dates and options reject unsupported input without implicit coercion", () => {
  for (const calculate of calculators) {
    for (const input of [undefined, null, {}, [], 20000101, 0n, true, new Date(0), new String("2000-01-01")]) {
      assert.throws(() => calculate(input), TypeError);
    }
    for (const input of ["", "0000-01-01", "10000-01-01", "1900-02-29", "2000-04-31", "2000-01-00",
      "2000-13-01", "2000-1-01", "2000-01-01T00:00:00Z", " 2000-01-01", "２０００-０１-０１"]) {
      assert.throws(() => calculate(input), RangeError);
    }
    for (const options of [null, [], 1, true, "preserve", () => {}]) {
      assert.throws(() => calculate("2000-01-01", options), TypeError);
    }
    for (const options of [{ masterNumbers: null }, { masterNumbers: "sometimes" }, { method: null },
      { method: "digits" }, { age: 30 }, { system: "chaldean" }, { boundary: "birthday" }, { [Symbol()]: 1 }]) {
      assert.throws(() => calculate("2000-01-01", options), RangeError);
    }
    assert.deepEqual(calculate("2000-01-01", { masterNumbers: undefined, method: undefined }), calculate("2000-01-01"));
  }
});

function assertFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert(Object.isFrozen(value));
  for (const child of Object.values(value)) assertFrozen(child);
}

test("results are deeply frozen, JSON-safe, freshly allocated, and do not retain options", () => {
  for (const calculate of calculators) {
    const options = { masterNumbers: "preserve", method: "components" };
    const result = calculate("2009-11-11", options);
    assertFrozen(result);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    assert(!Object.isFrozen(options));
    options.masterNumbers = "reduce";
    options.method = "whole-date";
    assert.equal(result.receipt.masterNumbers, "preserve");
    assert.equal(result.receipt.timing.lifePath.receipt.method, "components");
    const fresh = calculate("2009-11-11");
    assert.deepEqual(fresh, result);
    assert.notEqual(fresh.periods, result.periods);
    assert.notEqual(fresh.periods[0].receipt.reduction, result.periods[0].receipt.reduction);
    assert.notEqual(fresh.receipt.timing.lifePath, result.receipt.timing.lifePath);
    assert.throws(() => { result.periods[0].ages.fromInclusive = 1; }, TypeError);
    assert.throws(() => { result.periods[0].receipt.inputs[0].value = 1; }, TypeError);
    let policyReads = 0;
    let methodReads = 0;
    calculate("2009-11-11", {
      get masterNumbers() { policyReads++; return "preserve"; },
      get method() { methodReads++; return "whole-date"; }
    });
    assert.equal(policyReads, 1);
    assert.equal(methodReads, 1);
  }
});

test("import and calculation require no Date or network and are independent of host timezone", () => {
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
    console.log(JSON.stringify([library.pinnacles("2000-02-29"), library.challenges("2000-02-29")]));
  `;
  const outputs = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ }, encoding: "utf8"
    }));
  assert(outputs.every((output) => output === outputs[0]));
  assert.deepEqual(JSON.parse(outputs[0]), [pinnacles("2000-02-29"), challenges("2000-02-29")]);
});
