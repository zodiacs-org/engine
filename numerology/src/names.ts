/** Authored symbolic mappings, not a claim about a name's pronunciation. */
export const LATIN_NAME_TABLE = Object.freeze({
  Æ: "AE", æ: "AE", Œ: "OE", œ: "OE", ß: "SS", ẞ: "SS",
  Ø: "O", ø: "O", Ł: "L", ł: "L", Đ: "D", đ: "D", Ð: "D", ð: "D",
  Þ: "TH", þ: "TH", Ħ: "H", ħ: "H", ı: "I", Ŋ: "NG", ŋ: "NG",
  Ŧ: "T", ŧ: "T", ſ: "S", Ƒ: "F", ƒ: "F",
  ﬀ: "FF", ﬁ: "FI", ﬂ: "FL", ﬃ: "FFI", ﬄ: "FFL", ﬅ: "ST", ﬆ: "ST"
} as const);

export const LATIN_NAME_TABLE_ID = "numerology-latin-ascii/1";
/** Limit counts original UTF-16 code units, including separators and marks. */
export const MAX_NAME_CODE_UNITS = 1024;

export type YVowelPolicy = "never" | "always" | "when-no-other-vowels";
export interface NameOptions {
  readonly yAsVowel?: YVowelPolicy;
}

export interface NameNormalizationStep {
  readonly rule: "nfd" | "strip-diacritics" | "latin-table" | "uppercase"
    | "separator" | "attached-diacritic";
  readonly input: string;
  readonly output: string;
}

export interface NameCharacterReceipt {
  /** Position in the original input, measured in UTF-16 code units. */
  readonly sourceIndex: number;
  readonly source: string;
  readonly kind: "letter" | "separator" | "mark";
  /** ASCII letters emitted by this source character, or the empty string. */
  readonly output: string;
  readonly steps: readonly NameNormalizationStep[];
}

export interface NameLetterReceipt {
  /** Position among all emitted ASCII letters. */
  readonly index: number;
  /** Index into receipt.characters, including separator and mark rows. */
  readonly characterIndex: number;
  /** Position within this source character's expansion. */
  readonly expansionIndex: number;
  readonly tokenIndex: number;
  readonly letter: string;
  readonly kind: "vowel" | "consonant";
  readonly classification: "base-vowel" | "base-consonant" | "y-never" | "y-always"
    | "y-no-other-vowels" | "y-other-vowel-present";
}

export interface NormalizedName {
  /** Uppercase tokens separated by one ASCII space, with no edge spaces. */
  readonly normalized: string;
  /** All emitted letters without separators, in their original order. */
  readonly letters: string;
  readonly vowels: string;
  readonly consonants: string;
  readonly receipt: {
    readonly schema: "numerology-name-normalization/1";
    readonly input: string;
    readonly latinTable: typeof LATIN_NAME_TABLE_ID;
    readonly yAsVowel: YVowelPolicy;
    readonly tokens: readonly string[];
    readonly characters: readonly NameCharacterReceipt[];
    readonly letters: readonly NameLetterReceipt[];
  };
}

// Accepted punctuation is deliberately finite. Unicode space separators are
// boundaries too; controls and default-ignorable characters are never removed.
const SEPARATORS = new Set(["-", "\u2010", "\u2011", "'", "\u2018", "\u2019", "."]);
const BASE_VOWELS = new Set(["A", "E", "I", "O", "U"]);

function diacritic(character: string): boolean {
  // Exclude COMBINING GRAPHEME JOINER, an invisible format instruction.
  return /^[\u0300-\u034e\u0350-\u036f]$/u.test(character);
}

function readOptions(options: NameOptions): YVowelPolicy {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Name options must be an object.");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "yAsVowel") throw new RangeError("Unknown name option.");
  }
  const policy = options.yAsVowel;
  if (policy === undefined) return "never";
  if (policy !== "never" && policy !== "always" && policy !== "when-no-other-vowels") {
    throw new RangeError("Y policy must be never, always, or when-no-other-vowels.");
  }
  return policy;
}

function unsupported(sourceIndex: number): never {
  throw new RangeError(`Unsupported name character at UTF-16 index ${sourceIndex}.`);
}

function step(rule: NameNormalizationStep["rule"], input: string, output: string): NameNormalizationStep {
  return Object.freeze({ rule, input, output });
}

function characterReceipt(
  source: string, sourceIndex: number, kind: NameCharacterReceipt["kind"],
  output: string, steps: NameNormalizationStep[]
): NameCharacterReceipt {
  return Object.freeze({ sourceIndex, source, kind, output, steps: Object.freeze(steps) });
}

function latinCharacter(source: string, sourceIndex: number): NameCharacterReceipt {
  if (!/^\p{Script=Latin}$/u.test(source) || !/^\p{Letter}$/u.test(source)) unsupported(sourceIndex);
  const decomposed = source.normalize("NFD");
  const base = Array.from(decomposed).filter((character) => !diacritic(character)).join("");
  const steps = [step("nfd", source, decomposed), step("strip-diacritics", decomposed, base)];
  let mapped = base;
  if (Object.hasOwn(LATIN_NAME_TABLE, base)) {
    mapped = LATIN_NAME_TABLE[base as keyof typeof LATIN_NAME_TABLE];
    steps.push(step("latin-table", base, mapped));
  }
  // Validate before uppercasing: no implicit Unicode expansion or compatibility
  // normalization may manufacture supported letters from an unsupported base.
  if (!/^[A-Za-z]+$/u.test(mapped)) unsupported(sourceIndex);
  const output = mapped.toUpperCase();
  steps.push(step("uppercase", mapped, output));
  return characterReceipt(source, sourceIndex, "letter", output, steps);
}

function classify(
  letter: string, policy: YVowelPolicy, hasBaseVowel: boolean
): Pick<NameLetterReceipt, "kind" | "classification"> {
  if (BASE_VOWELS.has(letter)) return { kind: "vowel", classification: "base-vowel" };
  if (letter !== "Y") return { kind: "consonant", classification: "base-consonant" };
  if (policy === "always") return { kind: "vowel", classification: "y-always" };
  if (policy === "never") return { kind: "consonant", classification: "y-never" };
  return hasBaseVowel
    ? { kind: "consonant", classification: "y-other-vowel-present" }
    : { kind: "vowel", classification: "y-no-other-vowels" };
}

/** Normalize supported Latin names without fetching, guessing scripts, or reading the clock. */
export function normalizeName(input: string, options: NameOptions = {}): NormalizedName {
  if (typeof input !== "string") throw new TypeError("Name must be a string.");
  if (input.length > MAX_NAME_CODE_UNITS) throw new RangeError("Name exceeds the UTF-16 length limit.");
  const yAsVowel = readOptions(options);
  const characters: NameCharacterReceipt[] = [];
  type PendingLetter = Pick<NameLetterReceipt, "characterIndex" | "expansionIndex" | "letter">;
  const groups: PendingLetter[][] = [];
  let currentGroup: PendingLetter[] | undefined;
  let sourceIndex = 0;

  for (const source of input) {
    const characterIndex = characters.length;
    if (SEPARATORS.has(source) || /^\p{Space_Separator}$/u.test(source)) {
      characters.push(characterReceipt(source, sourceIndex, "separator", "", [step("separator", source, "")]));
      currentGroup = undefined;
    } else if (diacritic(source)) {
      if (currentGroup === undefined) unsupported(sourceIndex);
      characters.push(characterReceipt(source, sourceIndex, "mark", "", [step("attached-diacritic", source, "")]));
    } else {
      const row = latinCharacter(source, sourceIndex);
      characters.push(row);
      if (currentGroup === undefined) {
        currentGroup = [];
        groups.push(currentGroup);
      }
      for (let expansionIndex = 0; expansionIndex < row.output.length; expansionIndex++) {
        currentGroup.push({ characterIndex, expansionIndex, letter: row.output.charAt(expansionIndex) });
      }
    }
    sourceIndex += source.length;
  }

  if (groups.length === 0) throw new RangeError("Name must contain supported letters.");
  const tokens = groups.map((group) => group.map(({ letter }) => letter).join(""));
  const letters: NameLetterReceipt[] = [];
  groups.forEach((group, tokenIndex) => {
    const hasBaseVowel = group.some(({ letter }) => BASE_VOWELS.has(letter));
    for (const row of group) {
      letters.push(Object.freeze({
        index: letters.length, ...row, tokenIndex, ...classify(row.letter, yAsVowel, hasBaseVowel)
      }));
    }
  });

  return Object.freeze({
    normalized: tokens.join(" "),
    letters: letters.map(({ letter }) => letter).join(""),
    vowels: letters.filter(({ kind }) => kind === "vowel").map(({ letter }) => letter).join(""),
    consonants: letters.filter(({ kind }) => kind === "consonant").map(({ letter }) => letter).join(""),
    receipt: Object.freeze({
      schema: "numerology-name-normalization/1", input, latinTable: LATIN_NAME_TABLE_ID, yAsVowel,
      tokens: Object.freeze(tokens), characters: Object.freeze(characters), letters: Object.freeze(letters)
    })
  });
}
