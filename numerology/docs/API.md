# Local API reference

The entry is `numerology/.build/index.js` after building. Its declarations
are beside it in `.build/index.d.ts`. A consumer linked to this private
project may import `@zodiacs/numerology`; this is a local package name, not
an instruction to install a published package. CommonJS `require` and
subpath imports are not declared exports. See [local consumers](VALIDATION.md).

All functions below are synchronous. `options` is optional and defaults to
the documented policy fields. Dates are civil strings and names are supplied
spellings. [README](../README.md) contains complete formulas, Unicode tables,
receipt fields, rejection rules, and the tests enforcing them.

## Functions

| Export | Arguments before optional options | Options type | Return type and purpose |
| --- | --- | --- | --- |
| `reduceInteger` | `input: IntegerInput` | `ReductionOptions` | `ReductionResult`: exact decimal reduction and visited debt stages. |
| `parseGregorianDate` | `date: string` | None | `GregorianDate`: validate a proleptic Gregorian civil date. |
| `lifePath` | `date: string` | `LifePathOptions` | `LifePathResult`: component or whole-date reduction. |
| `birthday` | `date: string` | `ReductionOptions` | `BirthdayResult`: reduce the validated date's day. |
| `normalizeName` | `name: string` | `NameOptions` | `NormalizedName`: explicit transliteration, source rows, tokens, and classifications. |
| `expression` | `name: string` | `NameNumberOptions` | `NameNumberResult`: reduce the whole-name raw letter sum. |
| `destiny` | `name: string` | `NameNumberOptions` | `NameNumberResult`: the exact `expression` function alias. |
| `soulUrge` | `name: string` | `NameNumberOptions` | `NameNumberResult`: reduce selected vowel values. |
| `personality` | `name: string` | `NameNumberOptions` | `NameNumberResult`: reduce selected consonant values. |
| `maturity` | `date: string, name: string` | `MaturityOptions` | `MaturityResult`: reduce the sum of life path and expression values. |
| `karmicLessons` | `name: string` | `NameNumberOptions` | `NameFrequencyResult`: select absent eligible raw letter values. |
| `hiddenPassion` | `name: string` | `NameNumberOptions` | `NameFrequencyResult`: select all positive-frequency maxima. |
| `personalYear` | `birthDate: string, targetDate: string` | `ReductionOptions` | `PersonalCycleResult`: reduce birth month, birth day, and target year components. |
| `personalMonth` | `birthDate: string, targetDate: string` | `ReductionOptions` | `PersonalCycleResult`: add the raw target month to personal year, then reduce. |
| `personalDay` | `birthDate: string, targetDate: string` | `ReductionOptions` | `PersonalCycleResult`: add the raw target day to personal month, then reduce. |
| `pinnacles` | `date: string` | `LifePathOptions` | `PeriodsResult`: component-sum schedule in attained ages. |
| `challenges` | `date: string` | `LifePathOptions` | `PeriodsResult`: absolute-difference schedule using single digits. |
| `profile` | `birthDate: string, name: string` | `ProfileOptions` | `ProfileResult`: full assembly under captured common settings. |
| `compareNames` | `birthDate: string, beforeName: string, afterName: string` | `ProfileOptions` | `NameChangeResult`: complete profiles and signed arithmetic differences. |

## Options

| Type | Accepted fields and defaults |
| --- | --- |
| `ReductionOptions` | `masterNumbers: "preserve"` or `"reduce"`; defaults to preserve. |
| `LifePathOptions` | Reduction fields plus `method: "components"` or `"whole-date"`; defaults to components. |
| `NameOptions` | `yAsVowel: "never"`, `"always"`, or `"when-no-other-vowels"`; defaults to never. Optional `transliteration: CustomTransliteration`. |
| `NameNumberOptions` | Reduction and name fields plus `system: "pythagorean"` or `"chaldean"`; defaults to Pythagorean. |
| `MaturityOptions` | Name-number and life-path fields together. |
| `ProfileOptions` | Maturity fields plus optional `targetDate: string`; omitted target produces `cycles: null`. |
| `CustomTransliteration` | Required `id` and `mappings`, with exact scalar keys and uppercase ASCII or empty outputs. Bounds and precedence are in the README's caller-transliteration section. |

Unknown fields and explicit null values reject. An omitted or undefined
optional policy uses its default. Wrong input types throw `TypeError`;
unsupported values, invalid dates, unsupported letters, and allocation bounds
throw `RangeError`. Treat messages as diagnostics, not stable error codes.
The CLI maps these exceptions to its fixed `invalid-input` response.

Profile and comparison options capture own data properties on ordinary or
null-prototype objects. Other standalone APIs accept ordinary in-process
objects and may read supplied getters. Custom table accessors reject. These
checks do not sandbox caller code, proxies, or modified JavaScript built-ins.

## Constants

| Exports | Purpose and evidence |
| --- | --- |
| `MAX_INTEGER_DIGITS` | Decimal allocation bound, enforced in `test/reduction.test.mjs`. |
| `MAX_NAME_CODE_UNITS` | Original UTF-16 name bound, enforced in `test/names.test.mjs`. |
| `MAX_CUSTOM_MAPPINGS`, `MAX_TRANSLITERATION_EXPANSION` | Caller table allocation bounds, enforced in `test/transliteration.test.mjs`. |
| `LATIN_NAME_TABLE`, `LATIN_NAME_TABLE_ID` | Frozen explicit Latin expansions and their convention identifier. |
| `GREEK_NAME_TABLE`, `GREEK_NAME_TABLE_ID` | Frozen explicit Greek scalar spellings and identifier. |
| `CYRILLIC_NAME_TABLE`, `CYRILLIC_NAME_TABLE_ID` | Frozen explicit Cyrillic scalar spellings and identifier. |
| `PYTHAGOREAN_LETTER_TABLE`, `PYTHAGOREAN_LETTER_TABLE_ID` | Frozen alphabetical letter values and identifier. |
| `CHALDEAN_LETTER_TABLE`, `CHALDEAN_LETTER_TABLE_ID` | Frozen Chaldean letter values and identifier. |
| `NUMBER_MEANINGS`, `KARMIC_DEBT_MEANINGS` | Original reduced-number and visited-debt reflection prompts. |
| `EMPTY_SELECTION_MEANINGS` | Original absence text for valid empty vowel/consonant selections. |
| `KARMIC_LESSON_MEANINGS`, `HIDDEN_PASSION_MEANINGS` | Original prompts for selected raw letter values. |
| `CHALLENGE_MEANINGS` | Original challenge prompts, including zero. |

Table values and identifiers are tested against the handwritten controls
named in [the evidence map](evidence/README.md). Meaning text is authored
interpretation; arithmetic tests do not validate its predictive content.

## Exported types

These are type-only exports. The function and option tables above name the
main inputs and results; the following lists their supporting receipt types.
All are available from the same entry as the functions.

| Area | Supporting exports |
| --- | --- |
| Integers | `IntegerInput`, `MasterPolicy`, `MasterNumber`, `KarmicDebtNumber`, `ReducedNumber`, `ReductionStep`, `ReductionReceipt`, `KarmicDebtAnnotation` |
| Dates | `LifePathMethod`, `DateComponent`, `DateKarmicDebt` |
| Name normalization | `YVowelPolicy`, `NameNormalizationStep`, `NameCharacterReceipt`, `NameLetterReceipt`, `CustomTransliterationReceipt` |
| Name numbers | `NumerologySystem`, `AsciiLetter`, `LetterValue`, `NameCalculation`, `NameSelection`, `LetterContribution` |
| Derived values | `MaturityKarmicDebt`, `FrequencyCalculation`, `FrequencyRow`, `FrequencyStep` |
| Cycles | `PersonalCycle`, `CycleComponent`, `CycleKarmicDebt`, `PersonalCycleStage` |
| Periods | `PeriodCalculation`, `PeriodIndex`, `PeriodSource`, `ChallengeNumber`, `AgeInterval`, `PeriodKarmicDebt`, `PeriodNumberResult` |
| Profiles and comparisons | `ProfileConventions`, `ComparedNumber`, `ComparedFrequency`, `SignedDifference`, `NumberComparison`, `FrequencyComparison` |

Results are deeply frozen and JSON-safe, with full original compounds and
performed reductions. Frequency selection records count increments rather
than inventing reductions. Profiles retain standalone results. Comparisons
retain both profiles and source pointers. See [receipt conventions](CONVENTIONS.md)
before persisting or interpreting them.

## Schema inventory

| Receipt or envelope | Identifier |
| --- | --- |
| Integer reduction | `numerology-reduction/1` |
| Life path | `numerology-life-path/1` |
| Birthday | `numerology-birthday/1` |
| Name normalization | `numerology-name-normalization/2` |
| Name number | `numerology-name-number/1` |
| Maturity | `numerology-maturity/1` |
| Name frequency | `numerology-name-frequency/1` |
| Personal cycle | `numerology-personal-cycle/1` |
| Pinnacles or challenges | `numerology-periods/1` |
| Profile | `numerology-profile/1` |
| Name comparison | `numerology-name-change/1` |
| CLI envelope | `numerology-cli/1` |

The documentation test compares this inventory with source schema literals;
the arithmetic and CLI tests enforce the corresponding structures. Earlier
development schemas are not imported or migrated by this project.

## CLI entry

The CLI is `node numerology/cli.mjs <command>` from the repository root,
with `profile`, `cycles`, or `compare`. `--help` emits JSON without needing
a build. The README's [JSON CLI reference](../README.md#json-cli) specifies
every flag, input shape, transport bound, output field, and exit status.
It includes flags, inline JSON, and piped stdin; `--pretty` changes only
whitespace. No library function reads stdin or writes output.

The [consumer example](../examples/consumer.ts) demonstrates typed package
imports and explicit settings. `test/consumer.test.mjs` compiles and runs it
as a separate local consumer. `test/documentation.test.mjs` checks export
coverage and runs README JavaScript examples against the local build.
