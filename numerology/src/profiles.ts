import { birthday, lifePath, parseGregorianDate } from "./dates.js";
import type { BirthdayResult, GregorianDate, LifePathResult } from "./dates.js";
import { hiddenPassion, karmicLessons, maturity } from "./derived.js";
import type { MaturityOptions, MaturityResult, NameFrequencyResult } from "./derived.js";
import { expression, personality, soulUrge } from "./name-numbers.js";
import type { LetterValue, NameNumberOptions, NameNumberResult } from "./name-numbers.js";
import type { NormalizedName } from "./names.js";
import { challenges, pinnacles } from "./periods.js";
import type { PeriodsResult } from "./periods.js";
import { personalDay, personalMonth, personalYear } from "./cycles.js";
import type { PersonalCycleResult } from "./cycles.js";

export interface ProfileOptions extends MaturityOptions {
  /** Omit to exclude cycles; never defaults to an ambient clock. */
  readonly targetDate?: string;
}

export interface ProfileConventions {
  readonly system: NameNumberResult["receipt"]["system"];
  readonly letterTable: NameNumberResult["receipt"]["letterTable"];
  readonly masterNumbers: LifePathResult["receipt"]["masterNumbers"];
  readonly method: LifePathResult["receipt"]["method"];
  readonly yAsVowel: NormalizedName["receipt"]["yAsVowel"];
  readonly latinTable: NormalizedName["receipt"]["latinTable"];
  readonly greekTable: NormalizedName["receipt"]["greekTable"];
  readonly cyrillicTable: NormalizedName["receipt"]["cyrillicTable"];
  readonly customTable: NormalizedName["receipt"]["customTable"];
}

export interface ProfileResult {
  readonly meaning: string;
  readonly lifePath: LifePathResult;
  readonly birthday: BirthdayResult;
  /** Destiny is the existing exact alias, not a separate profile calculation. */
  readonly expression: NameNumberResult;
  readonly soulUrge: NameNumberResult;
  readonly personality: NameNumberResult;
  readonly maturity: MaturityResult;
  readonly karmicLessons: NameFrequencyResult;
  readonly hiddenPassion: NameFrequencyResult;
  readonly pinnacles: PeriodsResult;
  readonly challenges: PeriodsResult;
  readonly cycles: null | {
    readonly personalYear: PersonalCycleResult;
    readonly personalMonth: PersonalCycleResult;
    readonly personalDay: PersonalCycleResult;
  };
  readonly receipt: {
    readonly schema: "numerology-profile/1";
    readonly convention: "one-supplied-name;shared-date-and-options;explicit-target/1";
    readonly birthDate: GregorianDate;
    readonly suppliedName: string;
    readonly targetDate: GregorianDate | null;
    readonly conventions: ProfileConventions;
  };
}

/** Capture only ordinary own data fields before composing multiple APIs. */
function snapshotOptions(options: ProfileOptions): ProfileOptions {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Profile options must be an object.");
  }
  const prototype: unknown = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Profile options must have an ordinary or null prototype.");
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "method" && key !== "system" && key !== "masterNumbers" && key !== "yAsVowel" &&
        key !== "transliteration" && key !== "targetDate") {
      throw new RangeError("Unknown profile option.");
    }
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new RangeError("Profile options require data fields.");
    }
    snapshot[key] = descriptor.value;
  }
  // Field domains are validated by the constituent APIs before assembly.
  return snapshot as ProfileOptions;
}

function prepare(date: string, name: string, options: ProfileOptions) {
  const captured = snapshotOptions(options);
  const { method, masterNumbers, system, yAsVowel, transliteration, targetDate: suppliedTarget } = captured;
  const path = lifePath(date, {
    ...(method === undefined ? {} : { method }),
    ...(masterNumbers === undefined ? {} : { masterNumbers })
  });
  const targetDate = suppliedTarget === undefined ? null : parseGregorianDate(suppliedTarget);
  const named = expression(name, {
    masterNumbers: path.receipt.masterNumbers,
    ...(system === undefined ? {} : { system }),
    ...(yAsVowel === undefined ? {} : { yAsVowel }),
    ...(transliteration === undefined ? {} : { transliteration })
  });
  const normal = named.receipt.normalization.receipt;
  const conventions: ProfileConventions = Object.freeze({
    system: named.receipt.system, letterTable: named.receipt.letterTable,
    masterNumbers: path.receipt.masterNumbers, method: path.receipt.method,
    yAsVowel: normal.yAsVowel, latinTable: normal.latinTable, greekTable: normal.greekTable,
    cyrillicTable: normal.cyrillicTable, customTable: normal.customTable
  });
  // Use the validated, owned table snapshot for every subsequent calculation.
  const nameOptions: NameNumberOptions = Object.freeze({
    system: conventions.system, masterNumbers: conventions.masterNumbers, yAsVowel: conventions.yAsVowel,
    ...(normal.customTable === null ? {} : { transliteration: Object.freeze({
      id: normal.customTable.id,
      mappings: Object.freeze(Object.fromEntries(normal.customTable.mappings.map(({ source, output }) =>
        [source, output])))
    }) })
  });
  return { path, named, conventions, nameOptions, targetDate };
}

function assemble(date: string, name: string, prepared: ReturnType<typeof prepare>): ProfileResult {
  const { path, named, conventions, nameOptions, targetDate } = prepared;
  const dateOptions = { masterNumbers: conventions.masterNumbers, method: conventions.method };
  const policy = { masterNumbers: conventions.masterNumbers };
  return Object.freeze({
    meaning: "These calculations offer reflection prompts for the supplied spelling and civil date under the recorded conventions.",
    lifePath: path, birthday: birthday(date, policy), expression: named,
    soulUrge: soulUrge(name, nameOptions), personality: personality(name, nameOptions),
    maturity: maturity(date, name, { ...nameOptions, ...dateOptions }),
    karmicLessons: karmicLessons(name, nameOptions), hiddenPassion: hiddenPassion(name, nameOptions),
    pinnacles: pinnacles(date, dateOptions), challenges: challenges(date, dateOptions),
    cycles: targetDate === null ? null : Object.freeze({
      personalYear: personalYear(date, targetDate.iso, policy),
      personalMonth: personalMonth(date, targetDate.iso, policy),
      personalDay: personalDay(date, targetDate.iso, policy)
    }),
    receipt: Object.freeze({
      schema: "numerology-profile/1", convention: "one-supplied-name;shared-date-and-options;explicit-target/1",
      birthDate: path.receipt.date, suppliedName: name, targetDate, conventions
    })
  });
}

/** Assemble source results without inferring a birth name, identity, age, or current date. */
export function profile(date: string, name: string, options: ProfileOptions = {}): ProfileResult {
  return assemble(date, name, prepare(date, name, options));
}

export type ComparedNumber = "expression" | "soulUrge" | "personality" | "maturity";
export type ComparedFrequency = "karmicLessons" | "hiddenPassion";
export interface SignedDifference {
  readonly before: number;
  readonly after: number;
  readonly delta: number;
}

export interface NumberComparison {
  readonly calculation: ComparedNumber;
  /** Includes changed compounds or debt paths even when reduced values match. */
  readonly changed: boolean;
  readonly compound: SignedDifference;
  readonly value: SignedDifference;
  readonly karmicDebts: {
    readonly changed: boolean;
    readonly before: NameNumberResult["karmicDebts"] | MaturityResult["karmicDebts"];
    readonly after: NameNumberResult["karmicDebts"] | MaturityResult["karmicDebts"];
  };
  readonly receipt: { readonly before: string; readonly after: string };
}

export interface FrequencyComparison {
  readonly calculation: ComparedFrequency;
  readonly changed: boolean;
  readonly before: readonly LetterValue[];
  readonly after: readonly LetterValue[];
  readonly added: readonly LetterValue[];
  readonly removed: readonly LetterValue[];
  readonly retained: readonly LetterValue[];
  readonly counts: readonly (SignedDifference & { readonly value: LetterValue; readonly eligible: boolean })[];
  readonly receipt: { readonly before: string; readonly after: string };
}

export interface NameChangeResult {
  readonly meaning: string;
  readonly before: ProfileResult;
  readonly after: ProfileResult;
  readonly numbers: readonly NumberComparison[];
  readonly frequencies: readonly FrequencyComparison[];
  readonly receipt: {
    readonly schema: "numerology-name-change/1";
    readonly convention: "same-birth-date-and-conventions;after-minus-before/1";
    readonly reduction: "not-applied-to-signed-differences";
    /** JSON pointers into this result identify the complete source calculations. */
    readonly unchanged: readonly { readonly calculation: string; readonly before: string; readonly after: string }[];
  };
}

function difference(before: number, after: number): SignedDifference {
  return Object.freeze({ before, after, delta: after - before });
}

function pointers(calculation: string) {
  return Object.freeze({ before: `/before/${calculation}`, after: `/after/${calculation}` });
}

/** Compare only supplied spellings under one shared, captured configuration. */
export function compareNames(
  date: string, beforeName: string, afterName: string, options: ProfileOptions = {}
): NameChangeResult {
  const prepared = prepare(date, beforeName, options);
  const afterExpression = expression(afterName, prepared.nameOptions);
  const before = assemble(date, beforeName, prepared);
  const after = assemble(date, afterName, { ...prepared, named: afterExpression });
  const numbers = (["expression", "soulUrge", "personality", "maturity"] as const).map((calculation) => {
    const a = before[calculation];
    const b = after[calculation];
    const compound = difference(a.receipt.sum.output, b.receipt.sum.output);
    const value = difference(a.value, b.value);
    const debtsChanged = JSON.stringify(a.karmicDebts) !== JSON.stringify(b.karmicDebts);
    return Object.freeze({ calculation, changed: compound.delta !== 0 || value.delta !== 0 || debtsChanged,
      compound, value, karmicDebts: Object.freeze({ changed: debtsChanged,
        before: a.karmicDebts, after: b.karmicDebts }), receipt: pointers(calculation) });
  });
  const frequencies = (["karmicLessons", "hiddenPassion"] as const).map((calculation) => {
    const a = before[calculation];
    const b = after[calculation];
    const added = Object.freeze(b.values.filter((value) => !a.values.includes(value)));
    const removed = Object.freeze(a.values.filter((value) => !b.values.includes(value)));
    const retained = Object.freeze(a.values.filter((value) => b.values.includes(value)));
    const counts = Object.freeze(a.receipt.frequencies.map((row, index) => Object.freeze({
      value: row.value, eligible: row.eligible,
      ...difference(row.count, b.receipt.frequencies[index]!.count)
    })));
    return Object.freeze({ calculation,
      changed: added.length > 0 || removed.length > 0 || counts.some(({ delta }) => delta !== 0),
      before: a.values, after: b.values, added, removed, retained, counts, receipt: pointers(calculation) });
  });
  return Object.freeze({
    meaning: "These differences describe spelling arithmetic. A larger or smaller number is not a measure of benefit, compatibility, or identity.",
    before, after, numbers: Object.freeze(numbers), frequencies: Object.freeze(frequencies),
    receipt: Object.freeze({
      schema: "numerology-name-change/1", convention: "same-birth-date-and-conventions;after-minus-before/1",
      reduction: "not-applied-to-signed-differences",
      unchanged: Object.freeze(["lifePath", "birthday", "pinnacles", "challenges", "cycles"].map((calculation) =>
        Object.freeze({ calculation, ...pointers(calculation) })))
    })
  });
}
