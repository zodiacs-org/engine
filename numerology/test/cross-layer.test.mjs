import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { profile, compareNames } from "../.build/index.js";
import { replay as replayNormalization } from "./name-receipts.mjs";

const fixtures = JSON.parse(readFileSync(new URL("fixtures/cross-layer.json", import.meta.url), "utf8"));
const cli = fileURLToPath(new URL("../cli.mjs", import.meta.url));
const systems = ["pythagorean", "chaldean"];
const policies = ["preserve", "reduce"];
const methods = ["components", "whole-date"];
const yPolicies = ["never", "always", "when-no-other-vowels"];
const numberKeys = ["expression", "soulUrge", "personality", "maturity"];
const groups = {
  pythagorean: ["AJS", "BKT", "CLU", "DMV", "ENW", "FOX", "GPY", "HQZ", "IR"],
  chaldean: ["AIJQY", "BKR", "CGLS", "DMT", "EHNX", "UVW", "OZ", "FP"]
};

// Test-only arithmetic, with no production tables, reducer, date parser, or
// normalization used to construct expected results. ASCII spellings come from
// handwritten controls. Bigint positional arithmetic avoids the digit-string
// summation used by the library.
function path(input, policy = "preserve") {
  let current = BigInt(input);
  const values = [Number(current)];
  while (current >= 10n && !(policy === "preserve" && [11n, 22n, 33n].includes(current))) {
    let total = 0n;
    for (let n = current; n > 0n; n /= 10n) total += n % 10n;
    current = total;
    values.push(Number(current));
  }
  return values;
}
const sum = (values) => values.reduce((a, b) => a + b, 0);
const recordedPath = (result) => [Number(result.receipt.input), ...result.receipt.steps.map((s) => Number(s.output))];
const finalPath = (result) => recordedPath(result.receipt.reduction);

function reference(birth, ascii, options) {
  const { system, masterNumbers: policy, method, yAsVowel, targetDate } = options;
  const r = (n) => path(n, policy).at(-1);
  const [year, month, day] = birth.split("-").map(Number);
  const life = method === "components" ? sum([year, month, day].map(r))
    : path(BigInt(birth.replaceAll("-", "")), "reduce")[1];
  const letters = ascii.split(" ").flatMap((token) => [...token].map((letter) => ({
    letter, value: groups[system].findIndex((group) => group.includes(letter)) + 1,
    vowel: /[AEIOU]/u.test(letter) || (letter === "Y" && (yAsVowel === "always" ||
      (yAsVowel === "when-no-other-vowels" && !/[AEIOU]/u.test(token))))
  })));
  assert(letters.every(({ value }) => value > 0));
  const compound = sum(letters.map(({ value }) => value));
  const vowel = sum(letters.filter((l) => l.vowel).map(({ value }) => value));
  const counts = Array.from({ length: 9 }, (_, i) => letters.filter((l) => l.value === i + 1).length);
  const [m, d, y] = [month, day, year].map(r);
  const first = r(m + d), second = r(d + y);
  const root = (n) => n === 0 ? 0 : 1 + (n - 1) % 9;
  const c1 = Math.abs(root(month) - root(day)), c2 = Math.abs(root(day) - root(year));
  let cycles = null;
  if (targetDate !== undefined) {
    const [ty, tm, td] = targetDate.split("-").map(Number);
    const cy = r(m + d + r(ty)), cm = r(cy + tm);
    cycles = [cy, cm, r(cm + td)];
  }
  const start = 37 - root(r(life));
  return {
    letters, counts, lifePath: path(life, policy), birthday: path(day, policy),
    expression: path(compound, policy), soulUrge: path(vowel, policy),
    personality: path(compound - vowel, policy), maturity: path(r(life) + r(compound), policy),
    pinnacles: [first, second, r(first + second), r(m + y)],
    challenges: [c1, c2, Math.abs(c1 - c2), Math.abs(root(month) - root(year))],
    starts: [0, start, start + 9, start + 18], cycles,
    lessons: counts.flatMap((n, i) => i < groups[system].length && n === 0 ? [i + 1] : []),
    passions: counts.flatMap((n, i) => n > 0 && n === Math.max(...counts) ? [i + 1] : [])
  };
}

// Replay serialized trees too: sharing and freezing cannot hide a malformed
// duplicate source receipt from this check. Every performed reduction, visited
// debt stage, sum, difference, timing subtraction, and boundary addition replays.
function replayTree(node) {
  if (node === null || typeof node !== "object") return;
  if (node.receipt?.schema === "numerology-reduction/1") {
    const r = node.receipt;
    const values = path(r.input, r.masterNumbers);
    assert.deepEqual(recordedPath(node), values);
    assert.equal(node.value, values.at(-1));
    assert.equal(r.stopReason, node.value < 10 ? "single-digit" : "master-number");
    assert.deepEqual(r.steps.map((s) => s.digits), values.slice(0, -1).map((n) => [...String(n)].map(Number)));
    assert.deepEqual(node.karmicDebts.map(({ number, stage }) => [number, stage]),
      values.flatMap((n, stage) => [13, 14, 16, 19].includes(n) ? [[n, stage]] : []));
    assert.equal(typeof node.meaning, "string");
    assert(node.meaning.length > 0);
  }
  if (node.sum) {
    assert.equal(node.sum.output, sum(node.sum.inputs));
    assert.equal(Number(node.reduction.receipt.input), node.sum.output);
  }
  if (node.operation) {
    const [a, b] = node.inputs.map(({ value }) => value);
    assert(["sum", "absolute-difference"].includes(node.operation));
    assert.equal(node.output, node.operation === "sum" ? a + b : Math.abs(a - b));
    assert.equal(Number(node.reduction.receipt.input), node.output);
  }
  if (node.firstEndAge) {
    const t = node.firstEndAge;
    assert.equal(t.output, t.minuend - t.subtrahend);
    for (const b of node.boundaries) assert.equal(b.output, sum(b.inputs));
  }
  for (const value of Object.values(node)) replayTree(value);
}

function checkProfile(result, birth, ascii, options) {
  const expected = reference(birth, ascii, options);
  assert.equal(result.receipt.birthDate.iso, birth);
  assert.equal(result.receipt.targetDate?.iso, options.targetDate);
  for (const key of ["lifePath", "birthday", ...numberKeys]) {
    assert.deepEqual(finalPath(result[key]), expected[key], key);
    assert.equal(result[key].value, expected[key].at(-1), key);
    assert.equal(typeof result[key].meaning, "string");
    assert(result[key].meaning.length > 0);
  }
  const normal = result.expression.receipt.normalization;
  assert.equal(normal.normalized, ascii);
  replayNormalization(normal);
  assert.deepEqual(result.expression.receipt.contributions.map(({ value }) => value), expected.letters.map((l) => l.value));
  for (const [key, selected] of [["soulUrge", true], ["personality", false]]) {
    assert.deepEqual(result[key].receipt.contributions.map(({ letter, value }) => ({ letter, value })),
      expected.letters.filter((l) => l.vowel === selected).map(({ letter, value }) => ({ letter, value })));
  }
  assert.equal(result.expression.receipt.sum.output,
    result.soulUrge.receipt.sum.output + result.personality.receipt.sum.output);
  assert.deepEqual(result.karmicLessons.values, expected.lessons);
  assert.deepEqual(result.hiddenPassion.values, expected.passions);
  for (const key of ["karmicLessons", "hiddenPassion"]) {
    const r = result[key].receipt;
    assert.deepEqual(r.frequencies.map(({ count }) => count), expected.counts);
    assert.equal(sum(expected.counts), expected.letters.length);
    assert.equal(sum(expected.counts.map((count, i) => count * (i + 1))), expected.expression[0]);
    assert.deepEqual(r.steps, expected.letters.map(({ value }, i, all) => {
      const before = all.slice(0, i).filter((l) => l.value === value).length;
      return { letterIndex: i, value, before, after: before + 1 };
    }));
    for (const f of r.frequencies) assert.deepEqual(f.letterIndices,
      expected.letters.flatMap((l, i) => l.value === f.value ? [i] : []));
  }
  for (const key of ["pinnacles", "challenges"]) {
    assert.deepEqual(result[key].periods.map(({ value }) => value), expected[key]);
    assert.deepEqual(result[key].periods.map(({ ages }) => ages.fromInclusive), expected.starts);
    assert.deepEqual(result[key].periods.map(({ ages }) => ages.toExclusive), [...expected.starts.slice(1), null]);
  }
  assert.deepEqual(result.cycles === null ? null : Object.values(result.cycles).map(({ value }) => value), expected.cycles);
  replayTree(result);
  return expected;
}

function optionsFor(system, policy, method, y, targetDate, custom) {
  return { system, masterNumbers: policy, method, yAsVowel: y, targetDate,
    ...(custom ? { transliteration: custom } : {}) };
}

function cliResult(command, request, mode) {
  let args = [command, "--input", mode === "stdin" ? "-" : JSON.stringify(request)];
  if (mode === "flags") {
    const names = { birthDate: "birth-date", name: "name", beforeName: "before-name", afterName: "after-name", targetDate: "target-date" };
    const opts = { system: "system", masterNumbers: "master-numbers", method: "method", yAsVowel: "y-as-vowel", targetDate: "target-date", transliteration: "transliteration" };
    args = [command];
    for (const [key, value] of Object.entries(request)) {
      if (key === "options") {
        for (const [key, v] of Object.entries(value)) args.push(`--${opts[key]}=${typeof v === "object" ? JSON.stringify(v) : v}`);
      } else args.push(`--${names[key]}=${value}`);
    }
  }
  const child = spawnSync(process.execPath, [cli, ...args], {
    input: mode === "stdin" ? JSON.stringify(request) : undefined,
    encoding: "utf8", timeout: 20_000, maxBuffer: 16 * 1024 * 1024
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, "");
  const envelope = JSON.parse(child.stdout);
  assert.deepEqual(Object.keys(envelope), ["schema", "ok", "command", "result"]);
  assert.equal(envelope.schema, "numerology-cli/1");
  assert.equal(envelope.ok, true);
  assert.equal(envelope.command, command);
  assert.equal(child.stdout, JSON.stringify(envelope) + "\n");
  replayTree(envelope.result);
  return envelope.result;
}

test("handwritten cross-layer date controls anchor independent reference formulas", () => {
  for (const f of fixtures.dates) {
    for (const system of systems) {
      const options = optionsFor(system, "preserve", "components", "never", f.target);
      const actual = profile(f.birth, "A", options);
      checkProfile(actual, f.birth, "A", options);
      assert.deepEqual(actual.lifePath.receipt.components.map(({ reduction }) => recordedPath(reduction)), f.components, f.id);
      assert.deepEqual(finalPath(actual.lifePath), f.lifePath, f.id);
      assert.deepEqual(finalPath(actual.birthday), f.birthday, f.id);
      for (const key of ["pinnacles", "challenges"]) assert.deepEqual(actual[key].periods.map(({ value }) => value), f[key], f.id);
      assert.deepEqual(Object.values(actual.cycles).map(({ value }) => value), f.cycles, f.id);
      const wholeOptions = { ...options, method: "whole-date" };
      const whole = profile(f.birth, "A", wholeOptions);
      checkProfile(whole, f.birth, "A", wholeOptions);
      assert.deepEqual(finalPath(whole.lifePath), f.wholeDate, f.id);
    }
  }
});

test("handwritten script goldens cross every system, master, life-path, and Y convention", () => {
  for (const [index, f] of fixtures.names.entries()) {
    const date = fixtures.dates[index % fixtures.dates.length];
    for (const system of systems) for (const policy of policies) for (const method of methods) for (const y of yPolicies) {
      const options = optionsFor(system, policy, method, y, date.target, f.custom);
      const actual = profile(date.birth, f.name, options);
      checkProfile(actual, date.birth, f.ascii, options);
      assert.deepEqual(actual.expression.receipt.sum.inputs, f[system], f.id);
      const canonical = profile(date.birth, f.name.normalize("NFD"), options);
      checkProfile(canonical, date.birth, f.ascii, options);
      const ascii = profile(date.birth, f.ascii, options);
      checkProfile(ascii, date.birth, f.ascii, options);
      for (const key of ["lifePath", "birthday", ...numberKeys]) {
        assert.deepEqual(actual[key].karmicDebts, canonical[key].karmicDebts);
        assert.deepEqual(actual[key].karmicDebts, ascii[key].karmicDebts);
      }
    }
  }
});

test("script and date golden matrix survives CLI profile and equivalent-name comparison transport", () => {
  for (const [i, f] of fixtures.names.entries()) for (const [s, system] of systems.entries()) {
    const date = fixtures.dates[i % fixtures.dates.length];
    const options = optionsFor(system, policies[i % 2], methods[(i + s) % 2], yPolicies[i % 3], date.target, f.custom);
    const mode = ["flags", "inline", "stdin"][(i + s) % 3];
    const actual = cliResult("profile", { birthDate: date.birth, name: f.name, options }, mode);
    assert.deepEqual(actual, profile(date.birth, f.name, options));
    checkProfile(actual, date.birth, f.ascii, options);
    const compared = cliResult("compare", { birthDate: date.birth, beforeName: f.name, afterName: f.ascii, options }, mode);
    assert.deepEqual(compared, compareNames(date.birth, f.name, f.ascii, options));
    checkProfile(compared.before, date.birth, f.ascii, options);
    checkProfile(compared.after, date.birth, f.ascii, options);
    assert(compared.numbers.every((row) => !row.changed && row.compound.delta === 0 && row.value.delta === 0));
    assert(compared.frequencies.every((row) => !row.changed && row.counts.every(({ delta }) => delta === 0)));
  }
});

test("seeded mixed-script composition, permutation, extension conservation, and CLI parity", () => {
  let state = 0x11c0ffee;
  const random = (n) => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % n; };
  const pool = fixtures.names.slice(0, 9); // Excludes the deliberate silent-letter override.
  const coverage = new Set();
  const transports = new Set();
  for (const system of systems) for (const policy of policies) for (const method of methods) for (const y of yPolicies) {
    for (let sample = 0; sample < 6; sample++) {
      const atoms = Array.from({ length: 1 + random(4) }, () => pool[random(pool.length)]);
      const name = atoms.map((f) => f.name).join(" - ");
      const ascii = atoms.map((f) => f.ascii).join(" ");
      const mappings = Object.assign({}, ...atoms.map((f) => f.custom?.mappings ?? {}));
      const date = fixtures.dates[random(fixtures.dates.length)];
      const year = 1 + random(9999), month = 1 + random(12), day = 1 + random(28);
      const birth = [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
      const custom = Object.keys(mappings).length ? { id: "synthetic-m11-composition/1", mappings } : undefined;
      const options = optionsFor(system, policy, method, y, date.target, custom);
      const actual = profile(birth, name, options);
      checkProfile(actual, birth, ascii, options);
      const reordered = profile(birth, atoms.toReversed().map((f) => f.name).join(" - "), options);
      checkProfile(reordered, birth, atoms.toReversed().map((f) => f.ascii).join(" "), options);
      for (const key of numberKeys) assert.deepEqual(finalPath(actual[key]), finalPath(reordered[key]));
      for (const key of ["karmicLessons", "hiddenPassion"]) assert.deepEqual(actual[key].values, reordered[key].values);
      const addition = "AEY";
      const compared = compareNames(birth, name, name + " " + addition, options);
      assert.deepEqual(compared.before, actual);
      const next = checkProfile(compared.after, birth, ascii + " " + addition, options);
      const base = reference(birth, ascii, options);
      for (const [i, key] of numberKeys.entries()) {
        assert.equal(compared.numbers[i].compound.delta, next[key][0] - base[key][0]);
        assert.equal(compared.numbers[i].value.delta, next[key].at(-1) - base[key].at(-1));
      }
      const delta = compared.frequencies[0].counts.map(({ delta }) => delta);
      assert.equal(sum(delta), addition.length);
      assert.equal(sum(delta.map((n, i) => n * (i + 1))), next.expression[0] - base.expression[0]);
      assert.equal(compared.numbers[0].compound.delta, compared.numbers[1].compound.delta + compared.numbers[2].compound.delta);
      for (const key of ["lifePath", "birthday", "pinnacles", "challenges", "cycles"]) assert.deepEqual(compared.before[key], compared.after[key]);
      replayTree(compared);
      if (sample === 0) {
        const ordinal = coverage.size;
        coverage.add([system, policy, method, y].join("/"));
        const command = ["profile", "compare", "cycles"][ordinal % 3];
        const mode = ["flags", "inline", "stdin"][Math.floor(ordinal / 3) % 3];
        transports.add(command + "/" + mode);
        const request = command === "profile" ? { birthDate: birth, name, options }
          : command === "compare" ? { birthDate: birth, beforeName: name, afterName: name + " " + addition, options }
          : { birthDate: birth, targetDate: options.targetDate, options: { masterNumbers: policy } };
        const result = cliResult(command, request, mode);
        assert.deepEqual(result, command === "profile" ? actual : command === "compare" ? compared : actual.cycles);
      }
    }
  }
  assert.equal(coverage.size, systems.length * policies.length * methods.length * yPolicies.length);
  assert.equal(transports.size, 9);
});

test("receipt replay rejects altered intermediate paths, debt locators, sums, and age arithmetic", () => {
  const original = profile("0013-02-28", "मि", optionsFor("pythagorean", "preserve", "components", "never", "2400-02-29", fixtures.names[6].custom));
  replayTree(original);
  const changes = [
    (r) => { r.expression.receipt.reduction.receipt.steps[0].output = "5"; },
    (r) => { r.expression.receipt.reduction.karmicDebts[0].stage = 1; },
    (r) => { r.cycles.personalDay.receipt.stages[0].sum.output++; },
    (r) => { r.pinnacles.receipt.timing.firstEndAge.output++; },
    (r) => { r.challenges.receipt.timing.boundaries[0].output++; },
    (r) => { r.maturity.receipt.expression.receipt.sum.inputs[0]++; }
  ];
  for (const change of changes) {
    const copy = JSON.parse(JSON.stringify(original));
    change(copy);
    assert.throws(() => replayTree(copy), assert.AssertionError);
  }
});
