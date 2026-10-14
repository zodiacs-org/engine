import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  maturity, karmicLessons, hiddenPassion, expression, lifePath, soulUrge, personality,
  NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS, KARMIC_LESSON_MEANINGS, HIDDEN_PASSION_MEANINGS,
  MAX_NAME_CODE_UNITS
} from "../.build/index.js";
import { replay as replayNormalization } from "./name-receipts.mjs";

const fixtures = JSON.parse(readFileSync(new URL("fixtures/derived.json", import.meta.url), "utf8"));
const systems = ["pythagorean", "chaldean"];
const policies = ["preserve", "reduce"];
const methods = ["components", "whole-date"];
const yPolicies = ["never", "always", "when-no-other-vowels"];
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const groups = ["AIJQY", "BKR", "CGLS", "DMT", "EHNX", "UVW", "OZ", "FP"];
const calculations = [karmicLessons, hiddenPassion];
const labels = ["karmic-lessons", "hidden-passion"];

function letterValue(letter, system) {
  return system === "pythagorean" ? 1 + alphabet.indexOf(letter) % 9
    : 1 + groups.findIndex((group) => group.includes(letter));
}

// Arithmetic oracle uses positional bigint division, not string digit iteration.
function path(total, policy) {
  let current = BigInt(total);
  const values = [Number(current)];
  while (current >= 10n && !(policy === "preserve" && [11n,22n,33n].includes(current))) {
    let remaining = current;
    current = 0n;
    while (remaining) {
      current += remaining % 10n;
      remaining /= 10n;
    }
    values.push(Number(current));
  }
  return values;
}

function debts(values) {
  return values.flatMap((number, stage) => [13,14,16,19].includes(number)
    ? [{ number, stage, meaning: KARMIC_DEBT_MEANINGS[number] }] : []);
}

function replayReduction(result, input, policy) {
  const values = path(input, policy);
  assert.equal(result.receipt.schema, "numerology-reduction/1");
  assert.equal(result.receipt.input, String(input));
  assert.equal(result.receipt.masterNumbers, policy);
  assert.deepEqual(result.receipt.steps, values.slice(0, -1).map((value, stage) => ({
    input: String(value), digits: [...String(value)].map(Number), output: String(values[stage + 1])
  })));
  assert.equal(result.value, values.at(-1));
  assert.equal(result.receipt.stopReason, result.value > 9 ? "master-number" : "single-digit");
  assert.equal(result.meaning, NUMBER_MEANINGS[result.value]);
  assert.deepEqual(result.karmicDebts, debts(values));
  return values;
}

function replayExpression(result, input, options) {
  const r = result.receipt;
  assert.equal(r.schema, "numerology-name-number/1");
  assert.equal(r.calculation, "expression");
  assert.equal(r.selection, "all");
  assert.equal(r.system, options.system);
  assert.equal(r.letterTable, `numerology-${options.system}-letters/1`);
  assert.equal(r.masterNumbers, options.masterNumbers);
  assert.equal(r.normalization.receipt.input, input);
  assert.equal(r.normalization.receipt.yAsVowel, options.yAsVowel ?? "never");
  replayNormalization(r.normalization);
  const contributions = r.normalization.receipt.letters.map((row) => ({
    ...row, value: letterValue(row.letter, options.system)
  }));
  assert.deepEqual(r.contributions, contributions);
  const values = contributions.map(({ value }) => value);
  const sum = values.reduce((a, b) => a + b, 0);
  assert.deepEqual(r.sum, { inputs: values, output: sum });
  const stages = replayReduction(r.reduction, sum, options.masterNumbers);
  assert.equal(result.value, stages.at(-1));
  assert.equal(result.meaning, r.reduction.meaning);
  assert.deepEqual(result.karmicDebts, r.reduction.karmicDebts);
  return stages;
}

function replayLifePath(result, date, options) {
  const r = result.receipt;
  const components = [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
  assert.equal(r.schema, "numerology-life-path/1");
  assert.deepEqual(r.date, { calendar: "proleptic-gregorian", iso: date,
    year: components[0], month: components[1], day: components[2] });
  assert.equal(r.method, options.method);
  assert.equal(r.masterNumbers, options.masterNumbers);
  const names = ["year", "month", "day"];
  const inputs = options.method === "components"
    ? components.map((value) => path(value, options.masterNumbers).at(-1))
    : components.flatMap((value, index) => [...String(value).padStart(index === 0 ? 4 : 2, "0")].map(Number));
  const annotations = [];
  assert.equal(r.components.length, options.method === "components" ? 3 : 0);
  for (const [index, row] of r.components.entries()) {
    assert.equal(row.component, names[index]);
    const values = replayReduction(row.reduction, components[index], options.masterNumbers);
    annotations.push(...debts(values).map((debt) => ({ ...debt, source: names[index] })));
  }
  const sum = inputs.reduce((a, b) => a + b, 0);
  assert.deepEqual(r.sum, { inputs, output: sum });
  const values = replayReduction(r.reduction, sum, options.masterNumbers);
  annotations.push(...debts(values).map((debt) => ({ ...debt, source: "total" })));
  assert.deepEqual(result.karmicDebts, annotations);
  assert.equal(result.value, values.at(-1));
  assert.equal(result.meaning, NUMBER_MEANINGS[result.value]);
}

function replayMaturity(result, date, name, options) {
  const r = result.receipt;
  assert.equal(r.schema, "numerology-maturity/1");
  assert.equal(r.formula, "reduced-life-path-plus-reduced-expression");
  assert.equal(r.masterNumbers, options.masterNumbers);
  replayLifePath(r.lifePath, date, options);
  replayExpression(r.expression, name, options);
  const inputs = [r.lifePath.value, r.expression.value];
  const sum = inputs[0] + inputs[1];
  assert.deepEqual(r.sum, { inputs, output: sum });
  const values = replayReduction(r.reduction, sum, options.masterNumbers);
  assert.equal(result.value, values.at(-1));
  assert.equal(result.meaning, r.reduction.meaning);
  assert.deepEqual(result.karmicDebts, [
    ...r.lifePath.karmicDebts.map(({ source, ...debt }) => ({ ...debt, source: "life-path", component: source })),
    ...r.expression.karmicDebts.map((debt) => ({ ...debt, source: "expression" })),
    ...debts(values).map((debt) => ({ ...debt, source: "total" }))
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  return values;
}

function replayFrequency(result, name, options, index) {
  const r = result.receipt;
  assert.equal(r.schema, "numerology-name-frequency/1");
  assert.equal(r.calculation, labels[index]);
  assert.equal(r.system, options.system);
  assert.equal(r.letterTable, `numerology-${options.system}-letters/1`);
  assert.equal(r.masterNumbers, options.masterNumbers);
  assert.equal(r.selection, "all");
  assert.equal(r.reduction, "not-applicable-to-frequency-selection");
  replayExpression(r.name, name, options);
  const domain = Array.from({ length: options.system === "pythagorean" ? 9 : 8 }, (_, i) => i + 1);
  assert.deepEqual(r.domain, domain);
  const rows = r.name.receipt.contributions;
  const frequencies = Array.from({ length: 9 }, (_, i) => {
    const value = i + 1;
    const letterIndices = rows.filter((row) => row.value === value).map(({ index }) => index);
    return { value, eligible: domain.includes(value), count: letterIndices.length, letterIndices };
  });
  assert.deepEqual(r.frequencies, frequencies);
  assert.deepEqual(r.steps, rows.map(({ index, value }) => {
    // Scan preceding letters, independently of the implementation's count map.
    const before = rows.slice(0, index).filter((row) => row.value === value).length;
    return { letterIndex: index, value, before, after: before + 1 };
  }));
  const counts = frequencies.map(({ count }) => count);
  const maximum = Math.max(...counts);
  assert.equal(r.maximum, maximum);
  assert.equal(counts.reduce((a, b) => a + b, 0), rows.length);
  assert.equal(frequencies.reduce((sum, row) => sum + row.value * row.count, 0), r.name.receipt.sum.output);
  assert.deepEqual(frequencies.flatMap(({ letterIndices }) => letterIndices).sort((a, b) => a - b), rows.map(({ index }) => index));
  const selected = frequencies.filter(({ value, count }) => domain.includes(value) &&
    (index === 0 ? count === 0 : count === maximum && count > 0)).map(({ value }) => value);
  assert.deepEqual(result.values, selected);
  assert.equal(r.selectionRule, index === 0 ? "missing-assigned-values" : "maximum-positive-frequency;all-ties");
  const meanings = index === 0 ? KARMIC_LESSON_MEANINGS : HIDDEN_PASSION_MEANINGS;
  assert.deepEqual(result.meanings, selected.map((value) => ({ value, meaning: meanings[value] })));
  assert.equal(typeof result.meaning, "string");
  assert(result.meaning.length > 0);
  assert.deepEqual(result.karmicDebts, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  return counts;
}

for (const fixture of fixtures.maturity) {
  test(`handwritten maturity fixture: ${fixture.id}`, () => {
    const options = { system: fixture.system, masterNumbers: fixture.policy, method: fixture.method };
    const result = maturity(fixture.date, fixture.name, options);
    assert.deepEqual(replayMaturity(result, fixture.date, fixture.name, options), fixture.path);
    assert.equal(result.receipt.lifePath.value, fixture.life);
    assert.deepEqual(replayExpression(result.receipt.expression, fixture.name, options), fixture.expressionPath);
    assert.deepEqual(result.karmicDebts.map(({ number, stage, source, component }) =>
      [number, stage, source, component ?? null]), fixture.debts);
  });
}

for (const fixture of fixtures.frequencies) {
  test(`handwritten frequency fixture: ${fixture.id}`, () => {
    for (const masterNumbers of policies) for (const yAsVowel of yPolicies) {
      const options = { system: fixture.system, masterNumbers, yAsVowel,
        ...(fixture.transliteration ? { transliteration: fixture.transliteration } : {}) };
      for (const [index, calculate] of calculations.entries()) {
        const result = calculate(fixture.name, options);
        assert.equal(result.receipt.name.receipt.normalization.normalized, fixture.normalized);
        assert.deepEqual(replayFrequency(result, fixture.name, options, index), fixture.counts);
        assert.deepEqual(result.values, index === 0 ? fixture.lessons : fixture.passions);
      }
    }
  });
}

test("complete small frequency receipts and no-missing or tied summary text", () => {
  const name = expression("A-B");
  for (const [index, calculate] of calculations.entries()) {
    const result = calculate("A-B");
    const values = index === 0 ? [3,4,5,6,7,8,9] : [1,2];
    const meanings = index === 0 ? KARMIC_LESSON_MEANINGS : HIDDEN_PASSION_MEANINGS;
    assert.deepEqual(result, {
      values, meaning: index === 0
        ? "Missing letter values offer practice prompts for this spelling, not claims about personal shortcomings."
        : "Several letter values share the highest frequency; each offers an equal reflection prompt.",
      meanings: values.map((value) => ({ value, meaning: meanings[value] })), karmicDebts: [],
      receipt: {
        schema: "numerology-name-frequency/1", calculation: labels[index], system: "pythagorean",
        letterTable: "numerology-pythagorean-letters/1", masterNumbers: "preserve", selection: "all", name,
        domain: [1,2,3,4,5,6,7,8,9], steps: [
          { letterIndex: 0, value: 1, before: 0, after: 1 },
          { letterIndex: 1, value: 2, before: 0, after: 1 }
        ], frequencies: Array.from({ length: 9 }, (_, i) => ({ value: i + 1, eligible: true,
          count: i < 2 ? 1 : 0, letterIndices: i < 2 ? [i] : [] })), maximum: 1,
        selectionRule: index === 0 ? "missing-assigned-values" : "maximum-positive-frequency;all-ties",
        reduction: "not-applicable-to-frequency-selection"
      }
    });
  }
  assert.match(karmicLessons("Abcdefghi").meaning, /no missing-value prompts/u);
  assert.match(hiddenPassion("AaB").meaning, /^The most frequent/u);
  assert.match(hiddenPassion("AB").meaning, /each offers an equal/u);
});

test("defaults, explicit undefined, and original meaning tables", () => {
  assert.deepEqual(maturity("0001-01-01", "A"), maturity("0001-01-01", "A", {
    system: "pythagorean", masterNumbers: "preserve", method: "components", yAsVowel: "never"
  }));
  assert.deepEqual(maturity("0001-01-01", "A", { system: undefined, masterNumbers: undefined,
    method: undefined, yAsVowel: undefined, transliteration: undefined }), maturity("0001-01-01", "A"));
  for (const calculate of calculations) {
    assert.deepEqual(calculate("A"), calculate("A", { system: "pythagorean", masterNumbers: "preserve", yAsVowel: "never" }));
    assert.deepEqual(calculate("A", { system: undefined, masterNumbers: undefined,
      yAsVowel: undefined, transliteration: undefined }), calculate("A"));
  }
  for (const table of [KARMIC_LESSON_MEANINGS, HIDDEN_PASSION_MEANINGS]) {
    assert(Object.isFrozen(table));
    assert.deepEqual(Object.keys(table), ["1","2","3","4","5","6","7","8","9"]);
    assert.equal(new Set(Object.values(table)).size, 9);
    for (const value of Object.values(table)) assert(value.length > 0);
    assert.throws(() => { table[1] = "changed"; }, TypeError);
  }
});

test("frequency counts and expression debts never become selection debts", () => {
  for (const calculate of calculations) {
    const result = calculate("A".repeat(13));
    assert.equal(result.receipt.frequencies[0].count, 13);
    assert.deepEqual(result.receipt.name.karmicDebts.map(({ number }) => number), [13]);
    assert.deepEqual(result.karmicDebts, []);
    assert.equal(result.receipt.maximum, 13);
  }
  // The performed expression path visits 11, but frequency one remains one.
  assert.deepEqual(hiddenPassion("A".repeat(11)).values, [1]);
});

test("empty vowel or consonant selections do not remove full-name derived analyses", () => {
  for (const system of systems) for (const [name, yAsVowel, empty] of [
    ["Bcdf", "never", soulUrge], ["Aeio", "never", personality],
    ["Yyy", "always", personality], ["Yyy", "never", soulUrge]
  ]) {
    const options = { system, masterNumbers: "preserve", yAsVowel };
    assert.equal(empty(name, options).value, 0);
    const result = maturity("0001-01-01", name, options);
    assert(result.receipt.expression.value > 0);
    replayMaturity(result, "0001-01-01", name, { ...options, method: "components" });
    for (const [index, calculate] of calculations.entries()) {
      replayFrequency(calculate(name, options), name, options, index);
    }
  }
});

test("every ordered ASCII pair checks frequency selection, conservation, and permutation", () => {
  for (const system of systems) for (const a of alphabet) for (const b of alphabet) {
    const options = { system, masterNumbers: "preserve", yAsVowel: "never" };
    for (const [index, calculate] of calculations.entries()) {
      const result = calculate(a + b, options);
      replayFrequency(result, a + b, options, index);
      const reversed = calculate(b + a, options);
      assert.deepEqual(result.values, reversed.values);
      assert.deepEqual(result.receipt.frequencies.map(({ count }) => count), reversed.receipt.frequencies.map(({ count }) => count));
    }
  }
});

test("seeded mixed-script controls replay maturity and frequency under both systems and policies", () => {
  let seed = 0x6a09e667;
  function next() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; }
  const spellings = [["é","E"],["Æ","AE"],["ß","SS"],["Θ","TH"],["Ψ","PS"],["Ж","ZH"],
    ["ю","YU"],["ё","YO"],["Й","Y"],["岚","LAN"],["禾",""],["𐐀","RY"],["Y","Y"],["B","B"]];
  const transliteration = { id: "synthetic-derived/1", mappings: { "岚": "LAN", "禾": "", "𐐀": "RY" } };
  for (let sample = 0; sample < 120; sample++) {
    const year = 1 + next() % 9999;
    const month = 1 + next() % 12;
    // Keeping the day below 29 guarantees validity independently of the parser.
    const day = 1 + next() % 28;
    const date = `${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const pairs = Array.from({ length: 1 + next() % 12 }, () => spellings[next() % spellings.length]);
    const name = "A" + pairs.map(([source]) => source).join("");
    const ascii = "A" + pairs.map(([, output]) => output).join("");
    for (const system of systems) for (const masterNumbers of policies) {
      const options = { system, masterNumbers, yAsVowel: yPolicies[sample % yPolicies.length], transliteration };
      const expectedValues = [...ascii].map((letter) => letterValue(letter, system));
      for (const [index, calculate] of calculations.entries()) {
        const result = calculate(name, options);
        replayFrequency(result, name, options, index);
        assert.equal(result.receipt.name.receipt.normalization.letters, ascii);
        assert.deepEqual(result.receipt.frequencies.map(({ count }) => count),
          Array.from({ length: 9 }, (_, i) => expectedValues.filter((v) => v === i + 1).length));
        for (const spelling of [name.normalize("NFD"), ascii]) {
          const equivalent = calculate(spelling, options);
          assert.deepEqual(equivalent.values, result.values);
          assert.deepEqual(equivalent.receipt.frequencies, result.receipt.frequencies);
        }
        const other = calculate(name, { ...options, masterNumbers: masterNumbers === "preserve" ? "reduce" : "preserve",
          yAsVowel: options.yAsVowel === "never" ? "always" : "never" });
        assert.deepEqual(other.values, result.values);
        assert.deepEqual(other.receipt.frequencies, result.receipt.frequencies);
      }
      for (const method of methods) {
        const result = maturity(date, name, { ...options, method });
        replayMaturity(result, date, name, { ...options, method });
        assert.equal(result.receipt.expression.receipt.normalization.letters, ascii);
        assert.deepEqual(result.receipt.expression.receipt.sum.inputs, expectedValues);
        assert.deepEqual(result.receipt.lifePath, lifePath(date, { masterNumbers, method }));
        assert.deepEqual(result.receipt.expression, expression(name, options));
        assert.equal(result.value % 9, (result.receipt.lifePath.value + result.receipt.expression.value) % 9);
        const equivalent = maturity(date, ascii, { ...options, method });
        assert.equal(equivalent.value, result.value);
        assert.deepEqual(equivalent.karmicDebts, result.karmicDebts);
      }
    }
  }
});

test("source, expansion, astral, and mapped-mark locators survive frequency counting", () => {
  const options = { system: "pythagorean", masterNumbers: "preserve", yAsVowel: "always",
    transliteration: { id: "synthetic-locators/1", mappings: { "𐐀": "RYA", "\u05b0": "E" } } };
  const name = "𐐀\u05b0-Œ\u0301";
  const result = hiddenPassion(name, options);
  replayFrequency(result, name, options, 1);
  assert.deepEqual(result.receipt.name.receipt.contributions.map(({ index, characterIndex, expansionIndex, value }) =>
    [index, characterIndex, expansionIndex, value]), [[0,0,0,9],[1,0,1,7],[2,0,2,1],[3,1,0,5],[4,3,0,6],[5,3,1,5]]);
  assert.deepEqual(result.values, [5]);
  assert.deepEqual(result.receipt.frequencies[4].letterIndices, [3,5]);
  const derived = maturity("2000-02-29", name, options);
  replayMaturity(derived, "2000-02-29", name, { ...options, method: "components" });
});

test("all result layers are frozen and caller tables are owned snapshots", () => {
  const options = { system: "chaldean", masterNumbers: "preserve", yAsVowel: "never",
    transliteration: { id: "synthetic-owned/1", mappings: { "岚": "AAB", "禾": "" } } };
  const results = [maturity("2000-02-29", "岚禾", options), ...calculations.map((calculate) => calculate("岚禾", options))];
  const snapshots = results.map((result) => JSON.stringify(result));
  function frozen(value) {
    if (value === null || typeof value !== "object") return;
    assert(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
  for (const result of results) frozen(result);
  assert(!Object.isFrozen(options));
  assert(!Object.isFrozen(options.transliteration.mappings));
  options.transliteration.mappings["岚"] = "ZZ";
  options.system = "pythagorean";
  results.forEach((result, index) => assert.equal(JSON.stringify(result), snapshots[index]));
  assert.throws(() => { results[0].receipt.sum.inputs.push(1); }, TypeError);
  assert.throws(() => { results[1].receipt.frequencies[0].letterIndices.push(0); }, TypeError);
  assert.throws(() => { results[2].values.push(1); }, TypeError);
  assert.throws(() => { results[0].karmicDebts.push({}); }, TypeError);
});

test("derived APIs strictly reject malformed inputs, unknown options, and empty emissions", () => {
  const all = [...calculations.map((calculate) => (name, options) => calculate(name, options)),
    (name, options) => maturity("0001-01-01", name, options)];
  for (const calculate of all) {
    for (const name of [null, undefined, 42, {}, []]) assert.throws(() => calculate(name), TypeError);
    for (const name of ["", "---", "ъЬ", "A1", "A\n", "A😀", "岚", "\ud800", "\u0301A"]) {
      assert.throws(() => calculate(name), RangeError);
    }
    for (const options of [null, [], "preserve", 0, true]) assert.throws(() => calculate("A", options), TypeError);
    for (const options of [{ system: null }, { system: "other" }, { masterNumbers: null },
      { masterNumbers: "other" }, { yAsVowel: null }, { yAsVowel: "guess" },
      { transliteration: null }, { transliteration: { id: "bad/1", mappings: {} } }, { unknown: true },
      { [Symbol("option")]: true }]) {
      assert.throws(() => calculate("A", options));
    }
    assert.throws(() => calculate("岚", { transliteration: { id: "empty/1", mappings: { "岚": "" } } }), RangeError);
  }
  for (const date of ["0000-01-01", "2001-02-29", "2000-04-31", "2000-01-01Z", " 2000-01-01"]) {
    assert.throws(() => maturity(date, "A"), RangeError);
  }
  for (const date of [null, undefined, 0, new Date(), {}]) assert.throws(() => maturity(date, "A"), TypeError);
  for (const method of [null, "other", false]) assert.throws(() => maturity("0001-01-01", "A", { method }), RangeError);
  for (const calculate of calculations) assert.throws(() => calculate("A", { method: "components" }), RangeError);
});

test("name allocation boundaries count expansions without truncation", () => {
  for (const system of systems) {
    const options = { system, masterNumbers: "preserve", yAsVowel: "never" };
    const name = "A".repeat(MAX_NAME_CODE_UNITS);
    for (const calculate of calculations) {
      const result = calculate(name, options);
      assert.equal(result.receipt.frequencies[0].count, MAX_NAME_CODE_UNITS);
      assert.equal(result.receipt.steps.length, MAX_NAME_CODE_UNITS);
      assert.throws(() => calculate(name + "A", options), RangeError);
    }
    const result = maturity("0001-01-01", name, options);
    assert.equal(result.receipt.expression.receipt.sum.output, MAX_NAME_CODE_UNITS);
    assert.throws(() => maturity("0001-01-01", name + "A", options), RangeError);
    const expansion = hiddenPassion("岚".repeat(MAX_NAME_CODE_UNITS), {
      ...options, transliteration: { id: "synthetic-bound/1", mappings: { "岚": "A".repeat(16) } }
    });
    assert.equal(expansion.receipt.steps.length, MAX_NAME_CODE_UNITS * 16);
    assert.equal(expansion.receipt.frequencies[0].count, MAX_NAME_CODE_UNITS * 16);
    assert.equal(expansion.receipt.steps.at(-1).after, MAX_NAME_CODE_UNITS * 16);
  }
});

test("derived source APIs import and calculate without a clock or network", () => {
  const moduleUrl = new URL("../.build/index.js", import.meta.url).href;
  const code = `
    globalThis.Date = new Proxy(Date, {
      construct() { throw new Error("implicit clock construction"); },
      get() { throw new Error("implicit clock read"); }
    });
    globalThis.fetch = () => { throw new Error("implicit network request"); };
    const { maturity, karmicLessons, hiddenPassion } = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify([
      maturity("2000-01-08", "Ael Vorn", { system: "chaldean" }),
      karmicLessons("Ael Vorn", { system: "chaldean" }),
      hiddenPassion("Ael Vorn", { system: "chaldean" })
    ]));
  `;
  const output = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", code], { encoding: "utf8" }));
  assert.deepEqual(output, [maturity("2000-01-08", "Ael Vorn", { system: "chaldean" }),
    karmicLessons("Ael Vorn", { system: "chaldean" }), hiddenPassion("Ael Vorn", { system: "chaldean" })]);
});
