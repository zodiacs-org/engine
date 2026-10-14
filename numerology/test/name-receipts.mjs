import assert from "node:assert/strict";
import {
  LATIN_NAME_TABLE, LATIN_NAME_TABLE_ID, GREEK_NAME_TABLE, GREEK_NAME_TABLE_ID,
  CYRILLIC_NAME_TABLE, CYRILLIC_NAME_TABLE_ID
} from "../.build/index.js";

export function summary(result) {
  const { normalized, letters, vowels, consonants } = result;
  return { normalized, letters, vowels, consonants };
}

export function replay(result) {
  const receipt = result.receipt;
  assert.equal(receipt.schema, "numerology-name-normalization/2");
  assert.equal(receipt.latinTable, LATIN_NAME_TABLE_ID);
  assert.equal(receipt.greekTable, GREEK_NAME_TABLE_ID);
  assert.equal(receipt.cyrillicTable, CYRILLIC_NAME_TABLE_ID);
  const custom = new Map(receipt.customTable?.mappings.map(({ source, output }) => [source, output]));
  let sourceIndex = 0;
  let token = "";
  const tokens = [];
  const emissions = [];
  let hasSourceLetter = false;
  for (const row of receipt.characters) {
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
      else if (step.rule === "greek-table") assert.equal(step.output, GREEK_NAME_TABLE[current]);
      else if (step.rule === "cyrillic-table") assert.equal(step.output, CYRILLIC_NAME_TABLE[current]);
      else if (step.rule === "custom-table") assert.equal(step.output, custom.get(current));
      else if (step.rule === "canonical-context") {
        assert.equal(typeof step.followingDiacritics, "string");
        assert.match(step.followingDiacritics, /^[\u0300-\u034e\u0350-\u036f]*$/u);
        assert.equal(receipt.input.slice(sourceIndex, sourceIndex + step.followingDiacritics.length), step.followingDiacritics);
        assert.equal(step.output, (current + step.followingDiacritics).normalize("NFC"));
      }
      else if (step.rule === "uppercase") assert.equal(step.output, current.toUpperCase());
      else if (step.rule === "separator" || step.rule === "attached-diacritic") assert.equal(step.output, "");
      else assert.fail("unknown normalization step");
      current = step.output;
    }
    assert.equal(current, row.output);
    if (row.kind === "separator") {
      if (token) tokens.push(token);
      token = "";
      hasSourceLetter = false;
    } else {
      assert(["letter", "mark"].includes(row.kind));
      if (row.kind === "mark") assert(hasSourceLetter);
      else hasSourceLetter = true;
      assert.match(row.output, /^[A-Z]*$/u);
      token += row.output;
    }
  }
  if (token) tokens.push(token);
  let tokenIndex = 0;
  let hasEmissions = false;
  for (const [characterIndex, row] of receipt.characters.entries()) {
    if (row.kind === "separator") {
      if (hasEmissions) tokenIndex++;
      hasEmissions = false;
    } else {
      for (let expansionIndex = 0; expansionIndex < row.output.length; expansionIndex++) {
        emissions.push({ characterIndex, expansionIndex, tokenIndex, letter: row.output[expansionIndex] });
        hasEmissions = true;
      }
    }
  }
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
