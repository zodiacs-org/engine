import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeName, LATIN_NAME_TABLE, LATIN_NAME_TABLE_ID, MAX_NAME_CODE_UNITS } from "../.build/index.js";

// Handwritten controls use invented name spellings, never identified people.
const cases = JSON.parse(readFileSync(new URL("fixtures/names.json", import.meta.url), "utf8"));
const policies = ["never", "always", "when-no-other-vowels"];

function summary(result) {
  const { normalized, letters, vowels, consonants } = result;
  return { normalized, letters, vowels, consonants };
}

function replay(result) {
  const receipt = result.receipt;
  assert.equal(receipt.schema, "numerology-name-normalization/1");
  assert.equal(receipt.latinTable, LATIN_NAME_TABLE_ID);
  let sourceIndex = 0;
  let token = "";
  const tokens = [];
  const emissions = [];
  for (const [characterIndex, row] of receipt.characters.entries()) {
    assert.equal(row.sourceIndex, sourceIndex);
    assert.equal(receipt.input.slice(sourceIndex, sourceIndex + row.source.length), row.source);
    assert.equal([...row.source].length, 1);
    sourceIndex += row.source.length;
    let current = row.source;
    for (const step of row.steps) {
      assert.equal(step.input, current);
      if (step.rule === "nfd") assert.equal(step.output, current.normalize("NFD"));
      else if (step.rule === "strip-diacritics") {
        assert.equal(step.output, current.replace(/[\u0300-\u034e\u0350-\u036f]/gu, ""));
      } else if (step.rule === "latin-table") assert.equal(step.output, LATIN_NAME_TABLE[current]);
      else if (step.rule === "uppercase") assert.equal(step.output, current.toUpperCase());
      else if (step.rule === "separator" || step.rule === "attached-diacritic") assert.equal(step.output, "");
      else assert.fail("unknown normalization step");
      current = step.output;
    }
    assert.equal(current, row.output);
    if (row.kind === "separator") {
      if (token) tokens.push(token);
      token = "";
    } else if (row.kind === "letter") {
      assert.match(row.output, /^[A-Z]+$/u);
      for (let expansionIndex = 0; expansionIndex < row.output.length; expansionIndex++) {
        emissions.push({ characterIndex, expansionIndex, tokenIndex: tokens.length, letter: row.output[expansionIndex] });
      }
      token += row.output;
    } else {
      assert.equal(row.kind, "mark");
      assert.equal(row.output, "");
      assert(token.length > 0);
    }
  }
  if (token) tokens.push(token);
  assert.equal(sourceIndex, receipt.input.length);
  assert.equal(receipt.characters.map(({ source }) => source).join(""), receipt.input);
  assert.deepEqual(tokens, receipt.tokens);
  assert.equal(result.normalized, tokens.join(" "));
  assert.equal(result.letters, emissions.map(({ letter }) => letter).join(""));
  assert.equal(receipt.letters.length, emissions.length);
  for (const [index, row] of receipt.letters.entries()) {
    assert.deepEqual({ characterIndex: row.characterIndex, expansionIndex: row.expansionIndex,
      tokenIndex: row.tokenIndex, letter: row.letter }, emissions[index]);
    assert.equal(row.index, index);
    // Classification oracle uses whole-token ASCII regexes, independently of
    // the implementation's set membership and source-character processing.
    const vowel = /[AEIOU]/u.test(row.letter) || (row.letter === "Y" &&
      (receipt.yAsVowel === "always" || (receipt.yAsVowel === "when-no-other-vowels" &&
        !/[AEIOU]/u.test(tokens[row.tokenIndex]))));
    assert.equal(row.kind, vowel ? "vowel" : "consonant");
    const classification = row.letter !== "Y" ? (vowel ? "base-vowel" : "base-consonant")
      : receipt.yAsVowel === "always" ? "y-always"
      : receipt.yAsVowel === "never" ? "y-never"
      : vowel ? "y-no-other-vowels" : "y-other-vowel-present";
    assert.equal(row.classification, classification);
  }
  assert.equal(result.vowels, receipt.letters.filter((row) => row.kind === "vowel").map((row) => row.letter).join(""));
  assert.equal(result.consonants, receipt.letters.filter((row) => row.kind === "consonant").map((row) => row.letter).join(""));
  assert.equal(result.vowels.length + result.consonants.length, result.letters.length);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
}

for (const fixture of cases) {
  test(`handwritten Latin name fixture: ${fixture.id}`, () => {
    const result = normalizeName(fixture.input, { yAsVowel: fixture.policy });
    assert.deepEqual(summary(result), {
      normalized: fixture.normalized, letters: fixture.letters,
      vowels: fixture.vowels, consonants: fixture.consonants
    });
    replay(result);
  });
}

test("complete per-character and expanded-letter receipt", () => {
  assert.deepEqual(normalizeName("é-Æy"), {
    normalized: "E AEY", letters: "EAEY", vowels: "EAE", consonants: "Y",
    receipt: {
      schema: "numerology-name-normalization/1", input: "é-Æy",
      latinTable: "numerology-latin-ascii/1", yAsVowel: "never", tokens: ["E", "AEY"],
      characters: [
        { sourceIndex: 0, source: "é", kind: "letter", output: "E", steps: [
          { rule: "nfd", input: "é", output: "e\u0301" },
          { rule: "strip-diacritics", input: "e\u0301", output: "e" },
          { rule: "uppercase", input: "e", output: "E" }
        ] },
        { sourceIndex: 1, source: "-", kind: "separator", output: "", steps: [
          { rule: "separator", input: "-", output: "" }
        ] },
        { sourceIndex: 2, source: "Æ", kind: "letter", output: "AE", steps: [
          { rule: "nfd", input: "Æ", output: "Æ" },
          { rule: "strip-diacritics", input: "Æ", output: "Æ" },
          { rule: "latin-table", input: "Æ", output: "AE" },
          { rule: "uppercase", input: "AE", output: "AE" }
        ] },
        { sourceIndex: 3, source: "y", kind: "letter", output: "Y", steps: [
          { rule: "nfd", input: "y", output: "y" },
          { rule: "strip-diacritics", input: "y", output: "y" },
          { rule: "uppercase", input: "y", output: "Y" }
        ] }
      ],
      letters: [
        { index: 0, characterIndex: 0, expansionIndex: 0, tokenIndex: 0, letter: "E", kind: "vowel", classification: "base-vowel" },
        { index: 1, characterIndex: 2, expansionIndex: 0, tokenIndex: 1, letter: "A", kind: "vowel", classification: "base-vowel" },
        { index: 2, characterIndex: 2, expansionIndex: 1, tokenIndex: 1, letter: "E", kind: "vowel", classification: "base-vowel" },
        { index: 3, characterIndex: 3, expansionIndex: 0, tokenIndex: 1, letter: "Y", kind: "consonant", classification: "y-never" }
      ]
    }
  });
});

test("explicit Latin table is pinned by handwritten equivalences", () => {
  const equivalences = [
    ["Ææ", "AE"], ["Œœ", "OE"], ["ßẞ", "SS"], ["Øø", "O"], ["Łł", "L"],
    ["ĐđÐð", "D"], ["Þþ", "TH"], ["Ħħ", "H"], ["ı", "I"], ["Ŋŋ", "NG"],
    ["Ŧŧ", "T"], ["ſ", "S"], ["Ƒƒ", "F"], ["ﬀ", "FF"], ["ﬁ", "FI"], ["ﬂ", "FL"],
    ["ﬃ", "FFI"], ["ﬄ", "FFL"], ["ﬅﬆ", "ST"]
  ];
  assert.deepEqual(Object.keys(LATIN_NAME_TABLE).sort(), equivalences.flatMap(([sources]) => [...sources]).sort());
  for (const [sources, expected] of equivalences) {
    for (const source of sources) {
      assert.equal(LATIN_NAME_TABLE[source], expected);
      assert.equal(normalizeName(source).letters, expected);
      assert.equal(normalizeName(source + "\u0301").letters, expected);
      assert.equal(normalizeName(source.toLowerCase()).letters, expected);
      assert.equal(normalizeName(source.toUpperCase()).letters, expected);
      replay(normalizeName(source));
    }
  }
});

test("NFC and NFD Latin spellings agree while retaining their distinct sources", () => {
  for (const input of ["Élva Dœrn", "ǼǿǺ", "ĀČĎĚĞİŃŘŠŮŸŽ", "ỄỗậỰ", "Ång Ælß"]) {
    for (const yAsVowel of policies) {
      const composed = normalizeName(input.normalize("NFC"), { yAsVowel });
      const decomposed = normalizeName(input.normalize("NFD"), { yAsVowel });
      assert.deepEqual(summary(composed), summary(decomposed));
      assert.equal(composed.receipt.input, input.normalize("NFC"));
      assert.equal(decomposed.receipt.input, input.normalize("NFD"));
      replay(composed);
      replay(decomposed);
    }
  }
});

test("finite punctuation and Unicode space separators create token boundaries", () => {
  const punctuation = ["-", "\u2010", "\u2011", "'", "\u2018", "\u2019", "."];
  const spaces = [" ", "\u00a0", "\u1680", ...Array.from({ length: 11 }, (_, i) => String.fromCodePoint(0x2000 + i)),
    "\u202f", "\u205f", "\u3000"];
  for (const separator of [...punctuation, ...spaces]) {
    const result = normalizeName(`${separator}${separator}Ay${separator}${separator}Yrr${separator}`, { yAsVowel: "when-no-other-vowels" });
    assert.deepEqual(summary(result), { normalized: "AY YRR", letters: "AYYRR", vowels: "AY", consonants: "YRR" });
    replay(result);
  }
});

test("Y classification uses the whole token and never guesses pronunciation", () => {
  const contextual = { yAsVowel: "when-no-other-vowels" };
  assert.equal(normalizeName("Yae", contextual).vowels, "AE");
  assert.equal(normalizeName("Yry", contextual).vowels, "YY");
  assert.equal(normalizeName("Yø", contextual).vowels, "O");
  assert.equal(normalizeName("YÆ", contextual).vowels, "AE");
  assert.equal(normalizeName("Y-YA", contextual).vowels, "YA");
  assert.equal(normalizeName("Y'YA", contextual).vowels, "YA");
  assert.equal(normalizeName("Y.YA", contextual).vowels, "YA");
  assert.equal(normalizeName("Y", contextual).vowels, "Y");
  assert.equal(normalizeName("AEIOU", { yAsVowel: "always" }).consonants, "");
  assert.equal(normalizeName("BCDF").vowels, "");
  assert.deepEqual(normalizeName("Ÿ"), normalizeName("Ÿ", { yAsVowel: "never" }));
  assert.deepEqual(normalizeName("Ÿ"), normalizeName("Ÿ", { yAsVowel: undefined }));
});

test("unsupported scripts, bases, controls, symbols, and unattached marks reject", () => {
  const unsupported = ["Α", "α", "А", "а", "א", "م", "क", "ก", "漢", "한", "あ", "𐐀", "😀", "\ud800", "\udc00",
    "1", "０", "Ａ", "ⓐ", "𝐀", "ℌ", "ᴁ", "ə", "ǅ", "&", "/", "_", ",", ":", "\u2013", "\u2014", "\u2212",
    "\u0000", "\t", "\n", "\r", "\u007f", "\u0085", "\u2028", "\u2029", "\u200b", "\u200c", "\u200d",
    "\u2060", "\ufeff", "\u202e", "\u034f", "\u0483", "\u05b0", "\u064e", "\ufe0f", "\u{e0100}"];
  for (const source of unsupported) {
    assert.throws(() => normalizeName("Ae" + source), { name: "RangeError", message: "Unsupported name character at UTF-16 index 2." });
  }
  for (const input of ["\u0301A", " \u0301A", "A-\u0301E", "A.\u0301", "", "  -.'\u00a0"]) {
    assert.throws(() => normalizeName(input), RangeError);
  }
  // Deliberately accepted canonical Latin aliases do not imply NFKD support.
  assert.equal(normalizeName("KÅ").letters, "KA");
});

test("all declared attached diacritics are removed and independently receipted", () => {
  for (let cp = 0x300; cp <= 0x36f; cp++) {
    if (cp === 0x34f) continue;
    const mark = String.fromCodePoint(cp);
    const result = normalizeName("A" + mark + mark);
    assert.equal(result.letters, "A");
    assert.equal(result.receipt.characters[1].kind, "mark");
    assert.equal(result.receipt.characters[2].kind, "mark");
    replay(result);
  }
});

test("invalid input types and options reject without coercion", () => {
  let coerced = false;
  for (const input of [undefined, null, false, 1, ["Ae"], new String("Ae"),
    { toString() { coerced = true; return "Ae"; } }]) {
    assert.throws(() => normalizeName(input), TypeError);
  }
  assert.equal(coerced, false);
  for (const options of [null, false, 0, "always", []]) {
    assert.throws(() => normalizeName("Ae", options), TypeError);
  }
  for (const options of [{ yAsVowel: null }, { yAsVowel: true }, { yAsVowel: "Always" },
    { yAsVowel: "contextual" }, { vowelY: true }, { [Symbol("option")]: 1 }]) {
    assert.throws(() => normalizeName("Ae", options), RangeError);
  }
});

test("original UTF-16 length bounds allocation before normalization", () => {
  assert.equal(MAX_NAME_CODE_UNITS, 1024);
  replay(normalizeName("ﬃ".repeat(MAX_NAME_CODE_UNITS)));
  assert.equal(normalizeName("ﬃ".repeat(MAX_NAME_CODE_UNITS)).letters.length, 3 * MAX_NAME_CODE_UNITS);
  assert.equal(normalizeName("A" + "\u0301".repeat(MAX_NAME_CODE_UNITS - 1)).letters, "A");
  assert.equal(normalizeName(" ".repeat(MAX_NAME_CODE_UNITS - 1) + "A").letters, "A");
  for (const input of ["A".repeat(MAX_NAME_CODE_UNITS + 1), " ".repeat(MAX_NAME_CODE_UNITS) + "A",
    "A" + "\u0301".repeat(MAX_NAME_CODE_UNITS)]) {
    assert.throws(() => normalizeName(input), { name: "RangeError", message: "Name exceeds the UTF-16 length limit." });
  }
});

test("name results and exported table are deeply frozen and options are untouched", () => {
  const options = { yAsVowel: "always" };
  const result = normalizeName("N\u0303 Æy", options);
  function frozen(value) {
    if (value && typeof value === "object") {
      assert(Object.isFrozen(value));
      for (const child of Object.values(value)) frozen(child);
    }
  }
  frozen(result);
  frozen(LATIN_NAME_TABLE);
  assert.deepEqual(options, { yAsVowel: "always" });
  assert(!Object.isFrozen(options));
  options.yAsVowel = "never";
  assert.equal(result.receipt.yAsVowel, "always");
  assert.throws(() => { result.receipt.characters[0].steps[0].output = "X"; }, TypeError);
  assert.throws(() => { result.receipt.letters[0].kind = "vowel"; }, TypeError);
  assert.throws(() => { LATIN_NAME_TABLE.Æ = "X"; }, TypeError);
  assert.deepEqual(normalizeName("N\u0303 Æy", { yAsVowel: "always" }), result);
  assert.notEqual(normalizeName("N\u0303 Æy", { yAsVowel: "always" }).receipt, result.receipt);
});

test("seeded independent expansions, classification, conservation, and normalization properties", () => {
  // Each pair is an independently declared accepted spelling and expected ASCII
  // contribution. Output is assembled without calling the normalizer as oracle.
  const spellings = [["a", "A"], ["É", "E"], ["i\u0308", "I"], ["ö", "O"], ["ū", "U"],
    ["b", "B"], ["Ñ", "N"], ["ç", "C"], ["ẞ", "SS"], ["æ", "AE"], ["Þ", "TH"],
    ["ﬃ", "FFI"], ["ł", "L"], ["Y", "Y"], ["ÿ", "Y"], ["y\u0302", "Y"]];
  const separators = [" ", "-", "'", ".", "\u2019", "\u00a0"];
  let seed = 0x4e414d33;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let sample = 0; sample < 300; sample++) {
    const words = [];
    const expectedTokens = [];
    const count = 1 + next() % 5;
    for (let t = 0; t < count; t++) {
      let source = "";
      let expected = "";
      const size = 1 + next() % 16;
      for (let c = 0; c < size; c++) {
        const [spelling, output] = spellings[next() % spellings.length];
        source += spelling;
        expected += output;
      }
      words.push(source);
      expectedTokens.push(expected);
    }
    const input = words.join(separators[next() % separators.length]);
    for (const yAsVowel of policies) {
      const result = normalizeName(input, { yAsVowel });
      assert.equal(result.normalized, expectedTokens.join(" "));
      assert.equal(result.letters, expectedTokens.join(""));
      const expectedVowels = expectedTokens.map((token) => [...token].filter((letter) =>
        /[AEIOU]/u.test(letter) || (letter === "Y" && (yAsVowel === "always" ||
          (yAsVowel === "when-no-other-vowels" && !/[AEIOU]/u.test(token))))).join("")).join("");
      assert.equal(result.vowels, expectedVowels);
      replay(result);
      assert.deepEqual(summary(normalizeName(input.normalize("NFD"), { yAsVowel })), summary(result));
      assert.deepEqual(summary(normalizeName(input.normalize("NFC"), { yAsVowel })), summary(result));
      assert.deepEqual(summary(normalizeName(result.normalized, { yAsVowel })), summary(result));
    }
  }
});
