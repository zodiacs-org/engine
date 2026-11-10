/** Authored spelling conventions for symbolic arithmetic, not language standards. */
export const GREEK_NAME_TABLE_ID = "numerology-greek-ascii/1";
export const CYRILLIC_NAME_TABLE_ID = "numerology-cyrillic-ascii/1";

export const GREEK_NAME_TABLE = Object.freeze({
  Α: "A", α: "A", Β: "B", β: "B", Γ: "G", γ: "G", Δ: "D", δ: "D",
  Ε: "E", ε: "E", Ζ: "Z", ζ: "Z", Η: "E", η: "E", Θ: "TH", θ: "TH",
  Ι: "I", ι: "I", Κ: "K", κ: "K", Λ: "L", λ: "L", Μ: "M", μ: "M",
  Ν: "N", ν: "N", Ξ: "X", ξ: "X", Ο: "O", ο: "O", Π: "P", π: "P",
  Ρ: "R", ρ: "R", Σ: "S", σ: "S", ς: "S", Τ: "T", τ: "T",
  Υ: "Y", υ: "Y", Φ: "PH", φ: "PH", Χ: "CH", χ: "CH", Ψ: "PS", ψ: "PS",
  Ω: "O", ω: "O"
} as const);

export const CYRILLIC_NAME_TABLE = Object.freeze({
  А: "A", а: "A", Б: "B", б: "B", В: "V", в: "V", Г: "G", г: "G",
  Д: "D", д: "D", Е: "E", е: "E", Ё: "YO", ё: "YO", Ж: "ZH", ж: "ZH",
  З: "Z", з: "Z", И: "I", и: "I", Й: "Y", й: "Y", К: "K", к: "K",
  Л: "L", л: "L", М: "M", м: "M", Н: "N", н: "N", О: "O", о: "O",
  П: "P", п: "P", Р: "R", р: "R", С: "S", с: "S", Т: "T", т: "T",
  У: "U", у: "U", Ф: "F", ф: "F", Х: "KH", х: "KH", Ц: "TS", ц: "TS",
  Ч: "CH", ч: "CH", Ш: "SH", ш: "SH", Щ: "SHCH", щ: "SHCH",
  Ъ: "", ъ: "", Ы: "Y", ы: "Y", Ь: "", ь: "", Э: "E", э: "E",
  Ю: "YU", ю: "YU", Я: "YA", я: "YA",
  Ґ: "G", ґ: "G", Є: "YE", є: "YE", І: "I", і: "I", Ї: "YI", ї: "YI",
  Ў: "W", ў: "W", Ј: "J", ј: "J", Љ: "LJ", љ: "LJ", Њ: "NJ", њ: "NJ",
  Ћ: "C", ћ: "C", Ђ: "DJ", ђ: "DJ", Џ: "DZ", џ: "DZ",
  Ѓ: "GJ", ѓ: "GJ", Ќ: "KJ", ќ: "KJ", Ѕ: "DZ", ѕ: "DZ"
} as const);

export const MAX_CUSTOM_MAPPINGS = 256;
export const MAX_TRANSLITERATION_EXPANSION = 16;

export interface CustomTransliteration {
  /** Caller-defined identity for this exact spelling convention. */
  readonly id: string;
  /** Exact, case-sensitive Unicode scalar keys; uppercase ASCII or empty outputs. */
  readonly mappings: Readonly<Record<string, string>>;
}

export interface CustomTransliterationReceipt {
  readonly id: string;
  /** Sorted scalar keys and complete contents, including unused entries. */
  readonly mappings: readonly Readonly<{ source: string; output: string }>[];
}

export function readCustomTransliteration(input: CustomTransliteration | undefined): {
  readonly lookup: ReadonlyMap<string, string>;
  readonly receipt: CustomTransliterationReceipt | null;
} {
  if (input === undefined) return { lookup: new Map(), receipt: null };
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Transliteration must be an object.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2 || !keys.includes("id") || !keys.includes("mappings")
    || !descriptors.id || !("value" in descriptors.id)
    || !descriptors.mappings || !("value" in descriptors.mappings)) {
    throw new RangeError("Transliteration requires only id and mappings data fields.");
  }
  const id: unknown = descriptors.id.value;
  const mappings: unknown = descriptors.mappings.value;
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/u.test(id)) {
    throw new RangeError("Transliteration id must be a bounded ASCII identifier.");
  }
  if (mappings === null || typeof mappings !== "object" || Array.isArray(mappings)) {
    throw new TypeError("Transliteration mappings must be an object.");
  }
  const mappingKeys = Reflect.ownKeys(mappings);
  if (mappingKeys.length === 0 || mappingKeys.length > MAX_CUSTOM_MAPPINGS) {
    throw new RangeError("Transliteration mapping count is outside the limit.");
  }
  const rows: { source: string; output: string }[] = [];
  for (const source of mappingKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(mappings, source);
    if (typeof source !== "string" || !/^[\p{Letter}\p{Mark}]$/u.test(source)
      || /\p{Default_Ignorable_Code_Point}/u.test(source)
      || !descriptor || !("value" in descriptor) || typeof descriptor.value !== "string"
      || !/^[A-Z]*$/u.test(descriptor.value) || descriptor.value.length > MAX_TRANSLITERATION_EXPANSION) {
      throw new RangeError("Invalid transliteration mapping data field.");
    }
    rows.push({ source, output: descriptor.value });
  }
  rows.sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : 0);
  return {
    lookup: new Map(rows.map(({ source, output }) => [source, output])),
    receipt: Object.freeze({ id, mappings: Object.freeze(rows.map((row) => Object.freeze(row))) })
  };
}
