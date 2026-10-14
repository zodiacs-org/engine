import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeName, GREEK_NAME_TABLE, CYRILLIC_NAME_TABLE,
  MAX_CUSTOM_MAPPINGS, MAX_TRANSLITERATION_EXPANSION, MAX_NAME_CODE_UNITS
} from "../.build/index.js";
import { summary, replay } from "./name-receipts.mjs";

// Invented spellings and caller conventions, with handwritten expected outputs.
const fixtures = JSON.parse(readFileSync(new URL("fixtures/transliteration.json", import.meta.url), "utf8"));
const policies = ["never", "always", "when-no-other-vowels"];

for (const fixture of fixtures) {
  test(`handwritten transliteration fixture: ${fixture.id}`, () => {
    const result = normalizeName(fixture.input, { yAsVowel: fixture.policy, transliteration: fixture.custom });
    assert.deepEqual(summary(result), {
      normalized: fixture.normalized, letters: fixture.letters,
      vowels: fixture.vowels, consonants: fixture.consonants
    });
    replay(result);
  });
}

test("Greek and Cyrillic tables match complete handwritten scalar equivalences", () => {
  const greek = [
    ["Αα", "A"], ["Ββ", "B"], ["Γγ", "G"], ["Δδ", "D"], ["Εε", "E"], ["Ζζ", "Z"],
    ["Ηη", "E"], ["Θθ", "TH"], ["Ιι", "I"], ["Κκ", "K"], ["Λλ", "L"], ["Μμ", "M"],
    ["Νν", "N"], ["Ξξ", "X"], ["Οο", "O"], ["Ππ", "P"], ["Ρρ", "R"], ["Σσς", "S"],
    ["Ττ", "T"], ["Υυ", "Y"], ["Φφ", "PH"], ["Χχ", "CH"], ["Ψψ", "PS"], ["Ωω", "O"]
  ];
  const cyrillic = [
    ["Аа", "A"], ["Бб", "B"], ["Вв", "V"], ["Гг", "G"], ["Дд", "D"], ["Ее", "E"],
    ["Ёё", "YO"], ["Жж", "ZH"], ["Зз", "Z"], ["Ии", "I"], ["Йй", "Y"], ["Кк", "K"],
    ["Лл", "L"], ["Мм", "M"], ["Нн", "N"], ["Оо", "O"], ["Пп", "P"], ["Рр", "R"],
    ["Сс", "S"], ["Тт", "T"], ["Уу", "U"], ["Фф", "F"], ["Хх", "KH"], ["Цц", "TS"],
    ["Чч", "CH"], ["Шш", "SH"], ["Щщ", "SHCH"], ["Ъъ", ""], ["Ыы", "Y"], ["Ьь", ""],
    ["Ээ", "E"], ["Юю", "YU"], ["Яя", "YA"], ["Ґґ", "G"], ["Єє", "YE"], ["Іі", "I"],
    ["Її", "YI"], ["Ўў", "W"], ["Јј", "J"], ["Љљ", "LJ"], ["Њњ", "NJ"], ["Ћћ", "C"],
    ["Ђђ", "DJ"], ["Џџ", "DZ"], ["Ѓѓ", "GJ"], ["Ќќ", "KJ"], ["Ѕѕ", "DZ"]
  ];
  for (const [table, pairs] of [[GREEK_NAME_TABLE, greek], [CYRILLIC_NAME_TABLE, cyrillic]]) {
    assert.deepEqual(Object.keys(table).sort(), pairs.flatMap(([sources]) => [...sources]).sort());
    for (const [sources, output] of pairs) {
      for (const source of sources) {
        assert.equal(table[source], output);
        for (const spelling of [source, source.toUpperCase(), source.toLowerCase(), source.normalize("NFD")]) {
          const result = normalizeName(spelling + "a");
          assert.equal(result.letters, output + "A");
          replay(result);
        }
      }
    }
  }
});

test("canonical Cyrillic context retains distinctions with a scalar receipt for every mark", () => {
  const result = normalizeName("И\u0306ё");
  assert.equal(result.letters, "YYO");
  assert.deepEqual(result.receipt.characters[0], {
    sourceIndex: 0, source: "И", kind: "letter", output: "Y", steps: [
      { rule: "canonical-context", input: "И", output: "Й", followingDiacritics: "\u0306" },
      { rule: "strip-diacritics", input: "Й", output: "Й" },
      { rule: "cyrillic-table", input: "Й", output: "Y" }
    ]
  });
  assert.equal(result.receipt.characters[1].source, "\u0306");
  assert.equal(result.receipt.characters[1].output, "");
  assert.equal(result.receipt.characters[2].sourceIndex, 2);
  replay(result);
  for (const input of ["ЁЙЇЎЃЌ", "έϊΰἄᾳ", "ё\u0301й\u0301", "А\u0301Б\u0301", "Ь\u0301Я"]) {
    for (const yAsVowel of policies) {
      const expected = normalizeName(input, { yAsVowel });
      for (const form of ["NFC", "NFD"]) {
        const result = normalizeName(input.normalize(form), { yAsVowel });
        assert.deepEqual(summary(result), summary(expected));
        replay(result);
      }
    }
  }
  assert.equal(normalizeName("И Е І У Г К").letters, "IEIUGK");
  assert.equal(normalizeName("Й Ё Ї Ў Ѓ Ќ").letters, "YYOYIWGJKJ");
});

test("silent signs are auditable and do not create empty tokens or separator boundaries", () => {
  const result = normalizeName("ъ-ь ЁъЬй-ъ");
  assert.equal(result.normalized, "YOY");
  assert.deepEqual(result.receipt.tokens, ["YOY"]);
  assert.equal(result.receipt.characters[0].output, "");
  assert.equal(result.receipt.characters[0].kind, "letter");
  replay(result);
  for (const input of ["ъ", "ЬЪ", "ъ-ь . Ъ"]) assert.throws(() => normalizeName(input), RangeError);
});

test("caller mapping provenance is complete, sorted, copied, JSON-safe, and frozen", () => {
  const mappings = { 禾: "HE", 岚: "LAN", 漪: "YI" };
  const transliteration = { id: "synthetic-han/1", mappings };
  const result = normalizeName("岚禾", { transliteration });
  assert.deepEqual(result.receipt.customTable, {
    id: "synthetic-han/1", mappings: [
      { source: "岚", output: "LAN" }, { source: "漪", output: "YI" }, { source: "禾", output: "HE" }
    ]
  });
  assert.deepEqual(result, normalizeName("岚禾", {
    transliteration: { id: "synthetic-han/1", mappings: { 漪: "YI", 岚: "LAN", 禾: "HE" } }
  }));
  function frozen(value) {
    if (value && typeof value === "object") {
      assert(Object.isFrozen(value));
      Object.values(value).forEach(frozen);
    }
  }
  frozen(result);
  frozen(GREEK_NAME_TABLE);
  frozen(CYRILLIC_NAME_TABLE);
  assert(!Object.isFrozen(mappings));
  assert(!Object.isFrozen(transliteration));
  mappings.岚 = "X";
  transliteration.id = "changed";
  assert.equal(result.letters, "LANHE");
  assert.equal(result.receipt.customTable.id, "synthetic-han/1");
  replay(result);
});

test("exact caller overrides apply before builtins, without implicit case or normalization", () => {
  const transliteration = { id: "synthetic-override/1", mappings: { Θ: "T", ё: "E", é: "X", א: "", "\u0306": "A" } };
  const result = normalizeName("ΘθёЁéאИ\u0306", { transliteration });
  assert.equal(result.letters, "TTHEYOXIA");
  replay(result);
  const exact = { transliteration: { id: "exact/1", mappings: { 𐐀: "A" } } };
  assert.throws(() => normalizeName("𐐨", exact), RangeError);
  assert.throws(() => normalizeName("א", { transliteration }), RangeError);
  assert.throws(() => normalizeName("\u0306A", { transliteration }), RangeError);
  assert.throws(() => normalizeName("A-\u0306", { transliteration }), RangeError);
  // A custom combining mark blocks builtin Cyrillic lookahead; it contributes
  // exactly the supplied spelling and is not consumed twice.
  assert.equal(normalizeName("И\u0306", { transliteration }).letters, "IA");
  const nfcOverride = { transliteration: { id: "exact/1", mappings: { ё: "E" } } };
  assert.equal(normalizeName("ё", nfcOverride).letters, "E");
  assert.equal(normalizeName("е\u0308", nfcOverride).letters, "YO");
});

test("unlisted scripts, archaic letters, controls, and partial caller maps reject", () => {
  for (const source of ["Ϝ", "ϐ", "Ӑ", "Ѣ", "א", "م", "क", "ก", "漢", "한", "あ", "𐐀", "😀", "\u0483"]) {
    assert.throws(() => normalizeName("Ae" + source), {
      name: "RangeError", message: "Unsupported name character at UTF-16 index 2."
    });
  }
  const options = { transliteration: { id: "partial/1", mappings: { 岚: "LAN" } } };
  assert.throws(() => normalizeName("岚禾", options), RangeError);
  assert.throws(() => normalizeName("אֵ", { transliteration: { id: "partial/1", mappings: { א: "A" } } }), RangeError);
  for (const input of ["Ё\tЙ", "Θ\u200dα", "А\u034f", "А\ufe0f", "Ω\ud800"]) {
    assert.throws(() => normalizeName(input), RangeError);
  }
});

test("caller table validation rejects malformed options without executing mapping getters", () => {
  for (const transliteration of [null, false, "table", [], 1]) {
    assert.throws(() => normalizeName("A", { transliteration }), TypeError);
  }
  for (const transliteration of [{}, { id: "x" }, { id: "x", mappings: {} },
    { id: "x", mappings: { א: "A" }, extra: true }, { id: " x", mappings: { א: "A" } },
    { id: "é", mappings: { א: "A" } }, { id: "x", mappings: { א: "a" } },
    { id: "x", mappings: { א: "AE I" } }, { id: "x", mappings: { אב: "AB" } },
    { id: "x", mappings: { "": "A" } }, { id: "x", mappings: { "\ud800": "A" } },
    ...["1", "-", "\t", "😀", "\u200d", "\u034f", "\ufe0f", "\u{e0100}"].map((key) => ({ id: "x", mappings: { [key]: "A" } })),
    { id: "x", mappings: { א: null } }, { id: "x", mappings: { [Symbol("key")]: "A" } }]) {
    assert.throws(() => normalizeName("A", { transliteration }), RangeError);
  }
  for (const mappings of [null, [], "x", false]) {
    assert.throws(() => normalizeName("A", { transliteration: { id: "x", mappings } }), TypeError);
  }
  let accessed = false;
  const getter = { get א() { accessed = true; return "A"; } };
  assert.throws(() => normalizeName("A", { transliteration: { id: "x", mappings: getter } }), RangeError);
  assert.throws(() => normalizeName("A", { transliteration: { get id() { accessed = true; return "x"; }, mappings: { א: "A" } } }), RangeError);
  assert.equal(accessed, false);
  const inherited = Object.create({ א: "A" });
  inherited.ל = "L";
  assert.throws(() => normalizeName("אל", { transliteration: { id: "x", mappings: inherited } }), RangeError);
});

test("mapping, identifier, expansion, and original UTF-16 allocation boundaries", () => {
  assert.equal(MAX_CUSTOM_MAPPINGS, 256);
  assert.equal(MAX_TRANSLITERATION_EXPANSION, 16);
  const mappings = Object.fromEntries(Array.from({ length: MAX_CUSTOM_MAPPINGS }, (_, i) => [String.fromCodePoint(0x4e00 + i), "A".repeat(MAX_TRANSLITERATION_EXPANSION)]));
  const transliteration = { id: "a".repeat(80), mappings };
  const result = normalizeName("一".repeat(MAX_NAME_CODE_UNITS), { transliteration });
  assert.equal(result.letters.length, MAX_NAME_CODE_UNITS * MAX_TRANSLITERATION_EXPANSION);
  replay(result);
  assert.equal(normalizeName("Щ".repeat(MAX_NAME_CODE_UNITS)).letters.length, 4 * MAX_NAME_CODE_UNITS);
  assert.equal(normalizeName("𐐀".repeat(MAX_NAME_CODE_UNITS / 2), {
    transliteration: { id: "astral/1", mappings: { 𐐀: "A" } }
  }).letters.length, MAX_NAME_CODE_UNITS / 2);
  assert.throws(() => normalizeName("一".repeat(MAX_NAME_CODE_UNITS + 1), { transliteration }), RangeError);
  assert.throws(() => normalizeName("A", { transliteration: { ...transliteration, id: "a".repeat(81) } }), RangeError);
  assert.throws(() => normalizeName("A", { transliteration: { id: "x", mappings: { 一: "A".repeat(17) } } }), RangeError);
  mappings.龘 = "A";
  assert.throws(() => normalizeName("A", { transliteration }), RangeError);
});

test("seeded mixed-script properties conserve letters and replay canonical and caller paths", () => {
  const spellings = [["É", "E"], ["Æ", "AE"], ["Θ", "TH"], ["ύ", "Y"], ["ς", "S"], ["ᾳ", "A"],
    ["Ё", "YO"], ["й", "Y"], ["ї", "YI"], ["ў", "W"], ["Щ", "SHCH"], ["ь", ""],
    ["Ѓ", "GJ"], ["岚", "LAN"], ["𐐀", "A"], ["אֵ", "AE"]];
  const transliteration = { id: "synthetic-mixed/1", mappings: { 岚: "LAN", 𐐀: "A", א: "A", "ֵ": "E" } };
  let seed = 0x4e414d34;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let sample = 0; sample < 300; sample++) {
    const inputWords = [];
    const tokens = [];
    const wordCount = 1 + next() % 5;
    for (let word = 0; word < wordCount; word++) {
      let source = "A"; // Keep an emitted letter even if all sampled letters are silent.
      let output = "A";
      const size = 1 + next() % 16;
      for (let c = 0; c < size; c++) {
        const [spelling, expected] = spellings[next() % spellings.length];
        source += spelling;
        output += expected;
      }
      inputWords.push(source);
      tokens.push(output);
    }
    const input = inputWords.join([" ", "-", ".", "'", "\u00a0"][next() % 5]);
    for (const yAsVowel of policies) {
      const options = { yAsVowel, transliteration };
      const result = normalizeName(input, options);
      assert.equal(result.normalized, tokens.join(" "));
      assert.equal(result.letters, tokens.join(""));
      replay(result);
      for (const form of ["NFC", "NFD"]) {
        const canonical = normalizeName(input.normalize(form), options);
        assert.deepEqual(summary(canonical), summary(result));
        replay(canonical);
      }
      assert.deepEqual(summary(normalizeName(result.normalized, { yAsVowel })), summary(result));
    }
  }
});
