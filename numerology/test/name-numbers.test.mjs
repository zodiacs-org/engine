import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  expression, destiny, soulUrge, personality, PYTHAGOREAN_LETTER_TABLE,
  CHALDEAN_LETTER_TABLE, PYTHAGOREAN_LETTER_TABLE_ID, CHALDEAN_LETTER_TABLE_ID,
  EMPTY_SELECTION_MEANINGS, NUMBER_MEANINGS, KARMIC_DEBT_MEANINGS, MAX_NAME_CODE_UNITS
} from "../.build/index.js";
import { replay as replayNormalization } from "./name-receipts.mjs";

const fixtures = JSON.parse(readFileSync(new URL("fixtures/name-numbers.json", import.meta.url), "utf8"));
const calculations = [expression, soulUrge, personality];
const labels = ["expression", "soul-urge", "personality"];
const selections = ["all", "vowels", "consonants"];
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const systems = ["pythagorean", "chaldean"];
const policies = ["preserve", "reduce"];
const yPolicies = ["never", "always", "when-no-other-vowels"];

// Independent grouping lookup and alphabet-position arithmetic, not imported tables.
const chaldeanGroups = ["AIJQY", "BKR", "CGLS", "DMT", "EHNX", "UVW", "OZ", "FP"];
function letterValue(letter, system) {
  return system === "pythagorean" ? 1 + alphabet.indexOf(letter) % 9
    : 1 + chaldeanGroups.findIndex((group) => group.includes(letter));
}

// Positional bigint arithmetic independently checks all visited compounds.
function expectedPath(total, policy) {
  let current = BigInt(total);
  const path = [Number(current)];
  while (current >= 10n && !(policy === "preserve" && [11n, 22n, 33n].includes(current))) {
    let remaining = current;
    current = 0n;
    while (remaining > 0n) {
      current += remaining % 10n;
      remaining /= 10n;
    }
    path.push(Number(current));
  }
  return path;
}

function selected(letter, token, y, index) {
  const vowel = /[AEIOU]/u.test(letter) || (letter === "Y" &&
    (y === "always" || (y === "when-no-other-vowels" && !/[AEIOU]/u.test(token))));
  return index === 0 || (index === 1 ? vowel : !vowel);
}

function checkReceipt(result, input, options, index) {
  const r = result.receipt;
  assert.equal(r.schema, "numerology-name-number/1");
  assert.equal(r.calculation, labels[index]);
  assert.equal(r.selection, selections[index]);
  assert.equal(r.system, options.system);
  assert.equal(r.letterTable, options.system === "pythagorean"
    ? PYTHAGOREAN_LETTER_TABLE_ID : CHALDEAN_LETTER_TABLE_ID);
  assert.equal(r.masterNumbers, options.masterNumbers);
  assert.equal(r.normalization.receipt.input, input);
  assert.equal(r.normalization.receipt.yAsVowel, options.yAsVowel);
  replayNormalization(r.normalization);
  const rows = r.normalization.receipt.letters.filter((row) => selected(row.letter,
    r.normalization.receipt.tokens[row.tokenIndex], options.yAsVowel, index));
  assert.deepEqual(r.contributions, rows.map((row) => ({ ...row, value: letterValue(row.letter, options.system) })));
  const values = r.contributions.map((row) => row.value);
  assert.deepEqual(r.sum.inputs, values);
  const total = values.reduce((sum, value) => sum + value, 0);
  assert.equal(r.sum.output, total);
  const path = expectedPath(total, options.masterNumbers);
  const reduction = r.reduction;
  assert.equal(reduction.receipt.schema, "numerology-reduction/1");
  assert.equal(reduction.receipt.input, String(total));
  assert.equal(reduction.receipt.masterNumbers, options.masterNumbers);
  assert.deepEqual([Number(reduction.receipt.input), ...reduction.receipt.steps.map((step) => Number(step.output))], path);
  for (const [stage, step] of reduction.receipt.steps.entries()) {
    assert.equal(step.input, String(path[stage]));
    assert.deepEqual(step.digits, [...String(path[stage])].map(Number));
    assert.equal(step.output, String(path[stage + 1]));
  }
  assert.equal(reduction.value, path.at(-1));
  assert.equal(result.value, reduction.value);
  assert.equal(reduction.receipt.stopReason, result.value > 9 ? "master-number" : "single-digit");
  assert.equal(reduction.meaning, NUMBER_MEANINGS[result.value]);
  assert.equal(result.meaning, total === 0 ? EMPTY_SELECTION_MEANINGS[labels[index]] : NUMBER_MEANINGS[result.value]);
  const debts = path.flatMap((number, stage) => [13, 14, 16, 19].includes(number)
    ? [{ number, stage, meaning: KARMIC_DEBT_MEANINGS[number] }] : []);
  assert.deepEqual(result.karmicDebts, debts);
  assert.deepEqual(reduction.karmicDebts, debts);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  return path;
}

for (const fixture of fixtures.cases) {
  test(`handwritten name-number fixture: ${fixture.id}`, () => {
    const options = { system: fixture.system, masterNumbers: fixture.policy, yAsVowel: fixture.y,
      ...(fixture.transliteration ? { transliteration: fixture.transliteration } : {}) };
    for (const [index, calculate] of calculations.entries()) {
      const result = calculate(fixture.input, options);
      assert.equal(result.receipt.normalization.normalized, fixture.normalized);
      assert.deepEqual(result.receipt.normalization.receipt.letters.map(({ letter }) => letterValue(letter, fixture.system)), fixture.values);
      assert.deepEqual(checkReceipt(result, fixture.input, options, index), fixture.paths[index]);
    }
  });
}

test("complete alphabetical tables, identifiers, and every single letter", () => {
  assert.equal(PYTHAGOREAN_LETTER_TABLE_ID, "numerology-pythagorean-letters/1");
  assert.equal(CHALDEAN_LETTER_TABLE_ID, "numerology-chaldean-letters/1");
  assert.deepEqual(Object.keys(PYTHAGOREAN_LETTER_TABLE).join(""), alphabet);
  assert.deepEqual(Object.keys(CHALDEAN_LETTER_TABLE).join(""), alphabet);
  for (const table of [PYTHAGOREAN_LETTER_TABLE, CHALDEAN_LETTER_TABLE]) assert(Object.isFrozen(table));
  assert(!Object.values(CHALDEAN_LETTER_TABLE).includes(9));
  assert.equal(new Set(chaldeanGroups.join("")).size, alphabet.length);
  assert.equal(chaldeanGroups.join("").length, alphabet.length);
  for (const system of systems) {
    const table = system === "pythagorean" ? PYTHAGOREAN_LETTER_TABLE : CHALDEAN_LETTER_TABLE;
    for (const letter of alphabet) {
      assert.equal(table[letter], letterValue(letter, system));
      for (const masterNumbers of policies) {
        const options = { system, masterNumbers, yAsVowel: "never" };
        for (const [index, calculate] of calculations.entries()) {
          for (const spelling of [letter, letter.toLowerCase()]) {
            checkReceipt(calculate(spelling, options), spelling, options, index);
          }
        }
      }
    }
  }
  assert.throws(() => { CHALDEAN_LETTER_TABLE.W = 5; }, TypeError);
  assert.throws(() => { PYTHAGOREAN_LETTER_TABLE.Y = 1; }, TypeError);
});

test("defaults and exact destiny alias keep the same expression receipt", () => {
  assert.equal(destiny, expression);
  for (const calculate of [...calculations, destiny]) {
    const implicit = calculate("Ael Vorn");
    const explicit = calculate("Ael Vorn", { system: "pythagorean", masterNumbers: "preserve", yAsVowel: "never" });
    assert.deepEqual(implicit, explicit);
    assert.deepEqual(calculate("Ael Vorn", { system: undefined, masterNumbers: undefined, yAsVowel: undefined, transliteration: undefined }), implicit);
  }
  assert.deepEqual(destiny("Ael Vorn", { system: "chaldean" }), expression("Ael Vorn", { system: "chaldean" }));
});

test("complete small receipt records compounds, classifications, and original name", () => {
  const result = expression("A-B");
  const normalization = {
    normalized: "A B", letters: "AB", vowels: "A", consonants: "B",
    receipt: {
      schema: "numerology-name-normalization/2", input: "A-B", latinTable: "numerology-latin-ascii/1",
      greekTable: "numerology-greek-ascii/1", cyrillicTable: "numerology-cyrillic-ascii/1",
      customTable: null, yAsVowel: "never", tokens: ["A", "B"],
      characters: [
        { sourceIndex: 0, source: "A", kind: "letter", output: "A", steps: [
          { rule: "nfd", input: "A", output: "A" }, { rule: "strip-diacritics", input: "A", output: "A" },
          { rule: "uppercase", input: "A", output: "A" }
        ] },
        { sourceIndex: 1, source: "-", kind: "separator", output: "", steps: [{ rule: "separator", input: "-", output: "" }] },
        { sourceIndex: 2, source: "B", kind: "letter", output: "B", steps: [
          { rule: "nfd", input: "B", output: "B" }, { rule: "strip-diacritics", input: "B", output: "B" },
          { rule: "uppercase", input: "B", output: "B" }
        ] }
      ],
      letters: [
        { index: 0, characterIndex: 0, expansionIndex: 0, letter: "A", tokenIndex: 0, kind: "vowel", classification: "base-vowel" },
        { index: 1, characterIndex: 2, expansionIndex: 0, letter: "B", tokenIndex: 1, kind: "consonant", classification: "base-consonant" }
      ]
    }
  };
  assert.deepEqual(result, {
    value: 3, meaning: NUMBER_MEANINGS[3], karmicDebts: [],
    receipt: {
      schema: "numerology-name-number/1", calculation: "expression", system: "pythagorean",
      letterTable: "numerology-pythagorean-letters/1", masterNumbers: "preserve", selection: "all", normalization,
      contributions: normalization.receipt.letters.map((row, index) => ({ ...row, value: index + 1 })),
      sum: { inputs: [1, 2], output: 3 },
      reduction: { value: 3, meaning: NUMBER_MEANINGS[3], karmicDebts: [], receipt: {
        schema: "numerology-reduction/1", input: "3", masterNumbers: "preserve", steps: [], stopReason: "single-digit"
      } }
    }
  });
});

test("filtered contributions retain expansion, token, and UTF-16 source locators", () => {
  const options = { system: "pythagorean", masterNumbers: "preserve", yAsVowel: "always",
    transliteration: { id: "synthetic-context/1", mappings: { "𐐀": "RYA", "\u05b0": "E" } } };
  const input = "𐐀\u05b0-Œ\u0301";
  const vowel = soulUrge(input, options);
  checkReceipt(vowel, input, options, 1);
  assert.deepEqual(vowel.receipt.contributions.map(({ index, characterIndex, expansionIndex, tokenIndex, letter }) =>
    [index, characterIndex, expansionIndex, tokenIndex, letter]), [
    [1,0,1,0,"Y"], [2,0,2,0,"A"], [3,1,0,0,"E"], [4,3,0,1,"O"], [5,3,1,1,"E"]
  ]);
  assert.deepEqual(vowel.receipt.normalization.receipt.characters.map(({ sourceIndex }) => sourceIndex), [0,2,3,4,5]);
  const consonant = personality(input, options);
  checkReceipt(consonant, input, options, 2);
  assert.deepEqual(consonant.receipt.contributions.map(({ index, letter, value }) => [index, letter, value]), [[0,"R",9]]);
});

test("valid empty selections use zero with an explicit absence meaning", () => {
  for (const system of systems) {
    for (const masterNumbers of policies) {
      for (const [index, input, yAsVowel] of [[1,"Bcdf","never"], [1,"Yry","never"], [2,"Aeio","never"], [2,"Yyy","always"]]) {
        const options = { system, masterNumbers, yAsVowel };
        const result = calculations[index](input, options);
        checkReceipt(result, input, options, index);
        assert.equal(result.value, 0);
        assert.deepEqual(result.receipt.contributions, []);
        assert.deepEqual(result.receipt.sum, { inputs: [], output: 0 });
        assert.deepEqual(result.karmicDebts, []);
        assert.notEqual(result.meaning, NUMBER_MEANINGS[0]);
      }
    }
  }
});

test("strict name and calculation options reject invalid runtime input", () => {
  for (const calculate of [...calculations, destiny]) {
    for (const input of [null, 1, 0n, true, [], {}, new String("A"), { toString() { assert.fail("coerced input"); } }]) {
      assert.throws(() => calculate(input), TypeError);
    }
    for (const input of ["", " - ", "Ъь", "123", "A\nB", "A\u200b", "😀", "岚禾", "\ud800", "\u0301A"]) {
      assert.throws(() => calculate(input), RangeError);
    }
    for (const options of [null, 1, "chaldean", [], true, () => {}]) assert.throws(() => calculate("A", options), TypeError);
    for (const options of [
      { system: null }, { system: "Chaldean" }, { system: "" }, { system: {} }, { system: 1 },
      { masterNumbers: null }, { masterNumbers: "all" }, { masterNumbers: 11 },
      { yAsVowel: null }, { yAsVowel: "sometimes" }, { transliteration: null },
      { method: "components" }, { selection: "vowels" }, { arbitrary: 1 }, { [Symbol("system")]: "chaldean" }
    ]) assert.throws(() => calculate("A", options));
    assert.throws(() => calculate("岚禾", { transliteration: { id: "partial/1", mappings: { 岚: "LAN" } } }), RangeError);
  }
});

test("normalization allocation limits and maximal caller expansions remain exact", () => {
  for (const calculate of calculations) {
    assert.throws(() => calculate("A".repeat(MAX_NAME_CODE_UNITS + 1)), RangeError);
    assert.equal(calculate("A".repeat(MAX_NAME_CODE_UNITS)).receipt.normalization.letters.length, MAX_NAME_CODE_UNITS);
  }
  for (const system of systems) {
    const options = { system, masterNumbers: "preserve", yAsVowel: "never",
      transliteration: { id: "synthetic-boundary/1", mappings: { A: "I".repeat(16) } } };
    const input = "A".repeat(MAX_NAME_CODE_UNITS);
    const expectedTotal = MAX_NAME_CODE_UNITS * 16 * (system === "pythagorean" ? 9 : 1);
    for (const [index, calculate] of calculations.entries()) {
      const result = calculate(input, options);
      assert.equal(result.receipt.normalization.letters.length, MAX_NAME_CODE_UNITS * 16);
      assert.equal(result.receipt.sum.output, index === 2 ? 0 : expectedTotal);
      assert.equal(result.value, expectedPath(index === 2 ? 0 : expectedTotal, "preserve").at(-1));
      assert(Number.isSafeInteger(result.receipt.sum.output));
    }
  }
});

test("deep freezing, caller ownership, and deterministic fresh results", () => {
  function frozen(value) {
    if (value === null || typeof value !== "object") return;
    assert(Object.isFrozen(value));
    for (const child of Object.values(value)) frozen(child);
  }
  for (const calculate of calculations) {
    const options = { system: "chaldean", yAsVowel: "always", transliteration: {
      id: "synthetic-snapshot/1", mappings: { 岚: "YAR", 禾: "HE" }
    } };
    const before = JSON.stringify(options);
    const result = calculate("岚禾", options);
    const repeated = calculate("岚禾", options);
    frozen(result);
    assert.deepEqual(result, repeated);
    assert.notEqual(result, repeated);
    assert.notEqual(result.receipt.normalization, repeated.receipt.normalization);
    assert.equal(JSON.stringify(options), before);
    assert(!Object.isFrozen(options));
    assert(!Object.isFrozen(options.transliteration.mappings));
    options.transliteration.mappings.岚 = "A";
    options.transliteration.id = "changed/1";
    assert.deepEqual(result, repeated);
    assert.equal(result.receipt.normalization.receipt.customTable.id, "synthetic-snapshot/1");
    assert.throws(() => { result.receipt.sum.inputs.push(1); }, TypeError);
  }
});

test("exhaustive ASCII pairs conserve vowel and consonant totals under both systems and policies", () => {
  for (const a of alphabet) {
    for (const b of alphabet) {
      const input = a + b;
      for (const system of systems) {
        for (const masterNumbers of policies) {
          const options = { system, masterNumbers };
          const results = calculations.map((calculate) => calculate(input, options));
          const total = letterValue(a, system) + letterValue(b, system);
          const vowels = [...input].filter((letter) => /[AEIOU]/u.test(letter)).reduce((sum, letter) => sum + letterValue(letter, system), 0);
          assert.deepEqual(results.map((result) => result.receipt.sum.output), [total, vowels, total - vowels]);
          for (const result of results) assert.equal(result.value, expectedPath(result.receipt.sum.output, masterNumbers).at(-1));
          assert.equal(results[0].receipt.sum.output, results[1].receipt.sum.output + results[2].receipt.sum.output);
        }
      }
    }
  }
});

test("seeded synthetic mixed-script controls replay receipts and preserve raw sums and canonical emissions", () => {
  let seed = 0x4e554d35;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const pairs = [["é","E"], ["Æ","AE"], ["ﬃ","FFI"], ["Þ","TH"], ["Y","Y"], ["R","R"],
    ["Θ","TH"], ["Ψ","PS"], ["υ","Y"], ["Ё","YO"], ["Й","Y"], ["Щ","SHCH"], ["Ь",""],
    ["岚","LAN"], ["𐐀","RYA"]];
  const transliteration = { id: "synthetic-property/1", mappings: { 岚: "LAN", "𐐀": "RYA" } };
  for (let sample = 0; sample < 250; sample++) {
    let input = "A";
    let ascii = "A";
    const length = 1 + next() % 12;
    for (let item = 0; item < length; item++) {
      const [source, emitted] = pairs[next() % pairs.length];
      const separator = next() % 4 === 0 ? "-" : "";
      input += separator + source;
      ascii += separator + emitted;
    }
    for (const system of systems) {
      for (const masterNumbers of policies) {
        for (const yAsVowel of yPolicies) {
          const options = { system, masterNumbers, yAsVowel, transliteration };
          const tokens = ascii.split("-").filter(Boolean);
          const totals = [0,0,0];
          for (const token of tokens) {
            for (const letter of token) {
              for (let index = 0; index < calculations.length; index++) {
                if (selected(letter, token, yAsVowel, index)) totals[index] += letterValue(letter, system);
              }
            }
          }
          const results = calculations.map((calculate, index) => {
            const result = calculate(input, options);
            checkReceipt(result, input, options, index);
            assert.equal(result.receipt.normalization.normalized, tokens.join(" "));
            assert.equal(result.receipt.sum.output, totals[index]);
            const nfd = calculate(input.normalize("NFD"), options);
            assert.equal(nfd.receipt.normalization.letters, result.receipt.normalization.letters);
            assert.equal(nfd.value, result.value);
            assert.deepEqual(nfd.karmicDebts, result.karmicDebts);
            const emitted = calculate(result.receipt.normalization.normalized, { system, masterNumbers, yAsVowel });
            assert.equal(emitted.receipt.sum.output, totals[index]);
            assert.equal(emitted.value, result.value);
            const digitalRoot = (n) => n === 0 ? 0 : 1 + (n - 1) % 9;
            assert.equal(digitalRoot(result.value), digitalRoot(totals[index]));
            if (masterNumbers === "reduce") assert.equal(result.value, digitalRoot(totals[index]));
            return result;
          });
          assert.equal(totals[0], totals[1] + totals[2]);
          const merged = [...results[1].receipt.contributions, ...results[2].receipt.contributions].sort((a,b) => a.index - b.index);
          assert.deepEqual(merged, results[0].receipt.contributions);
        }
      }
    }
  }
});
