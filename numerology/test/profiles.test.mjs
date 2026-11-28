import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  profile, compareNames, lifePath, birthday, expression, soulUrge, personality, maturity,
  karmicLessons, hiddenPassion, pinnacles, challenges, personalYear, personalMonth, personalDay,
  NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS, MAX_NAME_CODE_UNITS
} from "../.build/index.js";
import { replay as replayNormalization } from "./name-receipts.mjs";

const fixtures = JSON.parse(readFileSync(new URL("fixtures/profiles.json", import.meta.url), "utf8"));
const numberKeys = ["expression", "soulUrge", "personality", "maturity"];
const frequencyKeys = ["karmicLessons", "hiddenPassion"];
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const chaldeanGroups = ["AIJQY", "BKR", "CGLS", "DMT", "EHNX", "UVW", "OZ", "FP"];

function path(total, policy) {
  let value = BigInt(total);
  const values = [Number(value)];
  while (value >= 10n && !(policy === "preserve" && [11n, 22n, 33n].includes(value))) {
    let remaining = value;
    value = 0n;
    while (remaining) {
      value += remaining % 10n;
      remaining /= 10n;
    }
    values.push(Number(value));
  }
  return values;
}

function recordedPath(result) {
  return [Number(result.receipt.reduction.receipt.input),
    ...result.receipt.reduction.receipt.steps.map(({ output }) => Number(output))];
}

// Independently replay every nested digit reduction and sum, including sources
// repeated in maturity, timing, and frequency receipts. Shared frozen nodes are
// checked once; object sharing is not part of the serialized contract.
function replayTree(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert(Object.isFrozen(value));
  if (value.receipt?.schema === "numerology-reduction/1") {
    const r = value.receipt;
    const values = path(r.input, r.masterNumbers);
    assert.equal(value.value, values.at(-1));
    assert.equal(value.meaning, NUMBER_MEANINGS[value.value]);
    assert.equal(r.stopReason, value.value > 9 ? "master-number" : "single-digit");
    assert.deepEqual(r.steps, values.slice(0, -1).map((input, i) => ({
      input: String(input), digits: [...String(input)].map(Number), output: String(values[i + 1])
    })));
    assert.deepEqual(value.karmicDebts, values.flatMap((number, stage) =>
      [13,14,16,19].includes(number) ? [{number, stage, meaning: KARMIC_DEBT_MEANINGS[number]}] : []));
  }
  if (value.sum) {
    assert.equal(value.sum.output, value.sum.inputs.reduce((a, b) => a + b, 0));
    if (value.reduction) assert.equal(value.reduction.receipt.input, String(value.sum.output));
  }
  if (value.operation === "sum" || value.operation === "absolute-difference") {
    const [a, b] = value.inputs.map(({ value }) => value);
    assert.equal(value.output, value.operation === "sum" ? a + b : Math.abs(a - b));
    assert.equal(value.reduction.receipt.input, String(value.output));
  }
  for (const nested of Object.values(value)) replayTree(nested, seen);
}

function verifyProfile(result, date, name, options = {}) {
  const { receipt: r } = result;
  const c = r.conventions;
  assert.equal(r.schema, "numerology-profile/1");
  assert.equal(r.convention, "one-supplied-name;shared-date-and-options;explicit-target/1");
  assert.equal(r.birthDate.iso, date);
  assert.equal(r.suppliedName, name);
  assert.equal(r.targetDate?.iso ?? null, options.targetDate ?? null);
  assert.equal(c.system, options.system ?? "pythagorean");
  assert.equal(c.masterNumbers, options.masterNumbers ?? "preserve");
  assert.equal(c.method, options.method ?? "components");
  assert.equal(c.yAsVowel, options.yAsVowel ?? "never");
  const dateOptions = { method: c.method, masterNumbers: c.masterNumbers };
  const policy = { masterNumbers: c.masterNumbers };
  const nameOptions = { system: c.system, ...policy, yAsVowel: c.yAsVowel,
    ...(options.transliteration === undefined ? {} : { transliteration: options.transliteration }) };
  assert.deepEqual(result.lifePath, lifePath(date, dateOptions));
  assert.deepEqual(result.birthday, birthday(date, policy));
  for (const [key, api] of Object.entries({ expression, soulUrge, personality, karmicLessons, hiddenPassion })) {
    assert.deepEqual(result[key], api(name, nameOptions));
  }
  assert.deepEqual(result.maturity, maturity(date, name, { ...nameOptions, ...dateOptions }));
  assert.deepEqual(result.pinnacles, pinnacles(date, dateOptions));
  assert.deepEqual(result.challenges, challenges(date, dateOptions));
  assert.deepEqual(result.maturity.receipt.lifePath, result.lifePath);
  assert.deepEqual(result.maturity.receipt.expression, result.expression);
  for (const key of frequencyKeys) assert.deepEqual(result[key].receipt.name, result.expression);
  for (const key of ["pinnacles", "challenges"]) {
    assert.deepEqual(result[key].receipt.timing.lifePath, result.lifePath);
  }
  if (options.targetDate === undefined) assert.equal(result.cycles, null);
  else {
    for (const [key, api] of Object.entries({ personalYear, personalMonth, personalDay })) {
      assert.deepEqual(result.cycles[key], api(date, options.targetDate, policy));
    }
  }
  const normal = result.expression.receipt.normalization;
  replayNormalization(normal);
  for (const key of ["latinTable", "greekTable", "cyrillicTable", "customTable", "yAsVowel"]) {
    assert.deepEqual(c[key], normal.receipt[key]);
  }
  // Independent table lookup, vowel partition, and frequency selection.
  const assigned = c.system === "chaldean" ? 8 : 9;
  const counts = Array(9).fill(0);
  const raw = { expression: 0, soulUrge: 0, personality: 0 };
  for (const row of normal.receipt.letters) {
    const value = c.system === "pythagorean" ? alphabet.indexOf(row.letter) % 9 + 1
      : chaldeanGroups.findIndex((group) => group.includes(row.letter)) + 1;
    counts[value - 1]++;
    raw.expression += value;
    raw[row.kind === "vowel" ? "soulUrge" : "personality"] += value;
  }
  for (const key of ["expression", "soulUrge", "personality"]) {
    assert.deepEqual(recordedPath(result[key]), path(raw[key], c.masterNumbers));
  }
  assert.equal(raw.expression, raw.soulUrge + raw.personality);
  const select = (predicate) => counts.flatMap((count, index) => index < assigned && predicate(count)
    ? [index + 1] : []);
  assert.deepEqual(result.karmicLessons.values, select((count) => count === 0));
  assert.deepEqual(result.hiddenPassion.values, select((count) => count === Math.max(...counts) && count > 0));
  assert.deepEqual(result.hiddenPassion.receipt.frequencies.map(({count}) => count), counts);
  assert.equal(result.maturity.receipt.sum.output, result.lifePath.value + result.expression.value);
  assert.equal(typeof result.meaning, "string");
  assert(result.meaning.length > 0);
  replayTree(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
}

function pointer(result, location) {
  return location.split("/").slice(1).reduce((node, key) => node[key], result);
}

function verifyComparison(result) {
  assert.equal(result.receipt.schema, "numerology-name-change/1");
  assert.equal(result.receipt.convention, "same-birth-date-and-conventions;after-minus-before/1");
  assert.equal(result.receipt.reduction, "not-applied-to-signed-differences");
  assert.deepEqual(result.before.receipt.birthDate, result.after.receipt.birthDate);
  assert.deepEqual(result.before.receipt.conventions, result.after.receipt.conventions);
  assert.deepEqual(result.before.receipt.targetDate, result.after.receipt.targetDate);
  assert.deepEqual(result.numbers.map(({calculation}) => calculation), numberKeys);
  for (const row of result.numbers) {
    const a = pointer(result, row.receipt.before);
    const b = pointer(result, row.receipt.after);
    assert.equal(a, result.before[row.calculation]);
    assert.equal(b, result.after[row.calculation]);
    for (const [key, start, end] of [["compound", a.receipt.sum.output, b.receipt.sum.output], ["value", a.value, b.value]]) {
      assert.deepEqual(row[key], { before: start, after: end, delta: end - start });
    }
    assert.deepEqual(row.karmicDebts.before, a.karmicDebts);
    assert.deepEqual(row.karmicDebts.after, b.karmicDebts);
    const debtChanged = JSON.stringify(a.karmicDebts) !== JSON.stringify(b.karmicDebts);
    assert.equal(row.karmicDebts.changed, debtChanged);
    assert.equal(row.changed, row.compound.delta !== 0 || row.value.delta !== 0 || debtChanged);
  }
  assert.deepEqual(result.frequencies.map(({calculation}) => calculation), frequencyKeys);
  for (const row of result.frequencies) {
    const a = pointer(result, row.receipt.before);
    const b = pointer(result, row.receipt.after);
    assert.deepEqual(row.before, a.values);
    assert.deepEqual(row.after, b.values);
    assert.deepEqual(row.added, b.values.filter((value) => !a.values.includes(value)));
    assert.deepEqual(row.removed, a.values.filter((value) => !b.values.includes(value)));
    assert.deepEqual(row.retained, a.values.filter((value) => b.values.includes(value)));
    assert.deepEqual(row.counts, a.receipt.frequencies.map((f, i) => ({
      value: f.value, eligible: f.eligible, before: f.count,
      after: b.receipt.frequencies[i].count, delta: b.receipt.frequencies[i].count - f.count
    })));
    assert.equal(row.changed, row.added.length > 0 || row.removed.length > 0 || row.counts.some(({delta}) => delta !== 0));
  }
  assert.deepEqual(result.receipt.unchanged.map(({calculation}) => calculation),
    ["lifePath", "birthday", "pinnacles", "challenges", "cycles"]);
  for (const row of result.receipt.unchanged) {
    assert.deepEqual(pointer(result, row.before), pointer(result, row.after));
  }
  replayTree(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
}

test("handwritten synthetic profile goldens and source composition", () => {
  for (const fixture of fixtures.profiles) {
    const result = profile(fixture.date, fixture.name, fixture.options);
    verifyProfile(result, fixture.date, fixture.name, fixture.options);
    assert.equal(result.expression.receipt.normalization.normalized, fixture.normalized, fixture.id);
    assert.equal(result.lifePath.value, fixture.lifePath, fixture.id);
    assert.equal(result.birthday.value, fixture.birthday, fixture.id);
    for (const key of numberKeys) assert.deepEqual(recordedPath(result[key]), fixture[`${key}Path`], fixture.id);
    assert.deepEqual(result.karmicLessons.values, fixture.lessons, fixture.id);
    assert.deepEqual(result.hiddenPassion.values, fixture.passions, fixture.id);
    assert.deepEqual(result.hiddenPassion.receipt.frequencies.map(({count}) => count), fixture.counts, fixture.id);
    for (const key of ["pinnacles", "challenges"]) {
      assert.deepEqual(result[key].periods.map(({value}) => value), fixture[key], fixture.id);
      assert.deepEqual(result[key].periods.map(({ages}) => ages.fromInclusive), fixture.starts, fixture.id);
    }
    assert.deepEqual(result.cycles === null ? null : Object.values(result.cycles).map(({value}) => value), fixture.cycles, fixture.id);
  }
  assert.deepEqual(profile("0001-01-01", "A").receipt, {
    schema: "numerology-profile/1",
    convention: "one-supplied-name;shared-date-and-options;explicit-target/1",
    birthDate: {calendar: "proleptic-gregorian", iso: "0001-01-01", year: 1, month: 1, day: 1},
    suppliedName: "A", targetDate: null,
    conventions: {system: "pythagorean", letterTable: "numerology-pythagorean-letters/1",
      masterNumbers: "preserve", method: "components", yAsVowel: "never",
      latinTable: "numerology-latin-ascii/1", greekTable: "numerology-greek-ascii/1",
      cyrillicTable: "numerology-cyrillic-ascii/1", customTable: null}
  });
});

test("handwritten comparison goldens retain compounds, masters, debts, ties, and spelling-only changes", () => {
  for (const f of fixtures.comparisons) {
    const result = compareNames(f.date, f.before, f.after, f.options);
    verifyComparison(result);
    verifyProfile(result.before, f.date, f.before, f.options);
    verifyProfile(result.after, f.date, f.after, f.options);
    assert.deepEqual(result.numbers.map(({compound}) => [compound.before, compound.after]), f.compounds, f.id);
    assert.deepEqual(result.numbers.map(({value}) => [value.before, value.after]), f.values, f.id);
    for (const row of result.frequencies) assert.deepEqual(row.counts.map(({delta}) => delta), f.countsDelta, f.id);
    assert.deepEqual(result.frequencies[0].added, f.lessonAdded, f.id);
    assert.deepEqual(result.frequencies[0].removed, f.lessonRemoved, f.id);
    assert.deepEqual(result.frequencies[1].added, f.passionAdded, f.id);
    assert.deepEqual(result.frequencies[1].removed, f.passionRemoved, f.id);
  }
  const debt = compareNames("0001-01-01", "Mi", "D");
  assert.equal(debt.numbers[0].value.delta, 0);
  assert.equal(debt.numbers[0].compound.delta, -9);
  assert.equal(debt.numbers[0].changed, true);
  assert.deepEqual(debt.numbers[0].karmicDebts.before, [{number: 13, stage: 0, meaning: KARMIC_DEBT_MEANINGS[13]}]);
  assert.deepEqual(debt.numbers[0].karmicDebts.after, []);
  assert.deepEqual(debt.numbers[0], {
    calculation: "expression", changed: true,
    compound: {before: 13, after: 4, delta: -9}, value: {before: 4, after: 4, delta: 0},
    karmicDebts: {changed: true, before: [{number: 13, stage: 0, meaning: KARMIC_DEBT_MEANINGS[13]}], after: []},
    receipt: {before: "/before/expression", after: "/after/expression"}
  });
  const sameSets = compareNames("0001-01-01", "Aabb", "Aaabbb", {system: "chaldean"});
  assert(sameSets.frequencies.every(({changed}) => changed));
  assert(sameSets.frequencies.every(({added, removed}) => added.length + removed.length === 0));
});

test("all ASCII letter substitutions under both systems preserve comparison symmetry and date calculations", () => {
  for (const system of ["pythagorean", "chaldean"]) {
    for (const a of alphabet) for (const b of alphabet) {
      const forward = compareNames("2000-01-08", a, b, {system});
      const reverse = compareNames("2000-01-08", b, a, {system});
      verifyComparison(forward);
      for (let i = 0; i < numberKeys.length; i++) {
        assert.equal(forward.numbers[i].value.delta + reverse.numbers[i].value.delta, 0);
        assert.equal(forward.numbers[i].compound.delta + reverse.numbers[i].compound.delta, 0);
      }
      for (let i = 0; i < frequencyKeys.length; i++) {
        assert.deepEqual(forward.frequencies[i].added, reverse.frequencies[i].removed);
        assert.deepEqual(forward.frequencies[i].retained, reverse.frequencies[i].retained);
        assert.equal(forward.frequencies[i].counts.reduce((sum, {delta}) => sum + delta, 0), 0);
      }
      if (a === b) {
        assert.deepEqual(forward.before, forward.after);
        assert(forward.numbers.every(({changed}) => !changed));
        assert(forward.frequencies.every(({changed}) => !changed));
      }
    }
  }
});

test("seeded mixed-script profiles replay under all shared conventions and explicit target boundaries", () => {
  let seed = 0x9a117;
  const next = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const spellings = ["Æl", "Θψ", "Жю", "Yry", "Aeio", "Bcdf", "Él", "岚禾"];
  const targets = ["0001-01-01", "2023-12-31", "2024-01-01", "2024-02-29", "2024-03-01", "9999-12-31"];
  for (const system of ["pythagorean", "chaldean"]) {
    for (const masterNumbers of ["preserve", "reduce"]) {
      for (const method of ["components", "whole-date"]) {
        for (const yAsVowel of ["never", "always", "when-no-other-vowels"]) {
          for (let i = 0; i < 12; i++) {
            const date = `${String(next() % 9999 + 1).padStart(4, "0")}-${String(next() % 12 + 1).padStart(2, "0")}-${String(next() % 28 + 1).padStart(2, "0")}`;
            const name = `${spellings[(next() >>> 16) % spellings.length]} ${spellings[(next() >>> 16) % spellings.length]}`;
            const options = { system, masterNumbers, method, yAsVowel, targetDate: targets[i % targets.length],
              transliteration: { id: "synthetic-profile/1", mappings: { 岚: "YB", 禾: "" } } };
            const result = profile(date, name, options);
            verifyProfile(result, date, name, options);
            const same = compareNames(date, name, name, options);
            verifyComparison(same);
            assert.deepEqual(same.before, result);
            assert.deepEqual(same.after, result);
            assert(same.numbers.every(({changed}) => !changed));
            const other = spellings[(next() >>> 16) % spellings.length];
            const changed = compareNames(date, name, other, options);
            verifyComparison(changed);
            assert.deepEqual(changed.before, result);
            verifyProfile(changed.after, date, other, options);
            const ascii = profile(date, result.expression.receipt.normalization.normalized,
              {system, masterNumbers, method, yAsVowel, targetDate: options.targetDate});
            for (const key of numberKeys) assert.deepEqual(recordedPath(result[key]), recordedPath(ascii[key]));
            for (const key of frequencyKeys) assert.deepEqual(result[key].values, ascii[key].values);
          }
        }
      }
    }
  }
});

test("strict profile and comparison boundaries reject malformed inputs and executable option slots", () => {
  const calls = [
    (options) => profile("2000-01-01", "A", options),
    (options) => compareNames("2000-01-01", "A", "B", options)
  ];
  const invalid = [null, [], "preserve", 1, true, { unknown: true }, { [Symbol()]: 1 },
    { system: "other" }, { system: null }, { masterNumbers: "other" }, { masterNumbers: null },
    { method: "other" }, { method: null }, { yAsVowel: "sometimes" }, { yAsVowel: null },
    { targetDate: null }, { targetDate: "2023-02-29" }, { targetDate: "2024-01-01T00:00Z" },
    { targetDate: new Date(0) }, { transliteration: null },
    Object.create({system: "chaldean"})];
  for (const call of calls) {
    for (const options of invalid) assert.throws(() => call(options), {name: /^(TypeError|RangeError)$/u});
    for (const key of ["system", "masterNumbers", "method", "yAsVowel", "transliteration", "targetDate"]) {
      let reads = 0;
      assert.throws(() => call(Object.defineProperty({}, key, {get() { reads++; return undefined; }})), RangeError);
      assert.equal(reads, 0);
    }
    assert.deepEqual(call(Object.create(null)), call({}));
    assert.deepEqual(call({system: undefined, masterNumbers: undefined, method: undefined,
      yAsVowel: undefined, transliteration: undefined, targetDate: undefined}), call({}));
  }
  for (const date of ["0000-01-01", "1900-02-29", "2000-02-30", "2000-1-01", null, 2000]) {
    assert.throws(() => profile(date, "A"));
    assert.throws(() => compareNames(date, "A", "B"));
  }
  for (const name of ["", "---", "A1", "😀", "岚", "A".repeat(MAX_NAME_CODE_UNITS + 1), null, []]) {
    assert.throws(() => profile("2000-01-01", name));
    assert.throws(() => compareNames("2000-01-01", "A", name));
    assert.throws(() => compareNames("2000-01-01", name, "A"));
  }
  const maximum = "A".repeat(MAX_NAME_CODE_UNITS);
  const result = compareNames("9999-12-31", maximum, maximum, {targetDate: "0001-01-01"});
  verifyComparison(result);
  assert.equal(result.before.expression.receipt.contributions.length, MAX_NAME_CODE_UNITS);
});

test("configuration and caller tables remain owned, sorted, frozen, and deterministic", () => {
  const options = {system: "chaldean", targetDate: "2024-02-29", transliteration: {
    id: "synthetic-owned/1", mappings: { 禾: "", 岚: "YB" }
  }};
  const saved = structuredClone(options);
  const result = compareNames("2000-02-29", "岚", "岚禾", options);
  assert.deepEqual(options, saved);
  assert(!Object.isFrozen(options));
  assert(!Object.isFrozen(options.transliteration.mappings));
  assert.deepEqual(result.before.receipt.conventions.customTable, {
    id: "synthetic-owned/1", mappings: [{source: "岚", output: "YB"}, {source: "禾", output: ""}]
  });
  const serialized = JSON.stringify(result);
  options.transliteration.mappings.岚 = "A";
  options.transliteration.id = "changed";
  options.targetDate = "2025-01-01";
  assert.equal(JSON.stringify(result), serialized);
  assert.equal(JSON.stringify(compareNames("2000-02-29", "岚", "岚禾", saved)), serialized);
  const reordered = {...saved, transliteration: {id: saved.transliteration.id, mappings: {岚: "YB", 禾: ""}}};
  assert.equal(JSON.stringify(compareNames("2000-02-29", "岚", "岚禾", reordered)), serialized);
  const copy = compareNames("2000-02-29", "岚", "岚禾", saved);
  assert.notEqual(copy, result);
  assert.notEqual(copy.before, result.before);
  assert.notEqual(copy.before.expression, result.before.expression);
  replayTree(result);
});

test("profile and comparison import and calculation require no Date or network and ignore host timezone", () => {
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
    const { profile, compareNames } = await import(${JSON.stringify(moduleUrl)});
    console.log(JSON.stringify([profile("2000-02-29", "Θψ"),
      compareNames("2000-02-29", "Yr", "Yry", {targetDate: "2024-02-29"})]));
  `;
  const outputs = ["UTC", "Pacific/Kiritimati", "America/Los_Angeles"].map((TZ) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: {...process.env, TZ}, encoding: "utf8"
    }));
  assert(outputs.every((output) => output === outputs[0]));
  assert.deepEqual(JSON.parse(outputs[0]), [profile("2000-02-29", "Θψ"),
    compareNames("2000-02-29", "Yr", "Yry", {targetDate: "2024-02-29"})]);
});
