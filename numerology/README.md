# Numerology development project

A private TypeScript library and planned JSON CLI, adjacent to
`@zodiacs/engine` and isolated from its npm package. Code and documentation
here use the repository's [MIT license](../LICENSE). This project currently
implements integer reduction, civil-date validation, life path, birthday,
and Latin name normalization with vowel/consonant classification.
[PLAN.md](PLAN.md) tracks the remaining name systems, cycles, transliteration,
profiles, and CLI.

Numerology results describe symbolic conventions and provide reflection
prompts. The tests check arithmetic and declared behavior. They do not test
whether numerology predicts personality or events. The meanings in
`src/meanings.ts` are original text authored for this project.

From this directory, with Node matching `package.json`:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
```

The TypeScript compiler is pinned in the local lockfile. Build output goes
to `.build/`, which is ignored; generated data should go to `.generated/`.
No root build or root dependency installation is needed. No engine module
is imported to perform digit arithmetic.

After `npm run build`, a source-checkout consumer can use:

```js
import { reduceInteger } from "./.build/index.js";

const result = reduceInteger("49");
console.log(JSON.stringify(result));
```

## Integer reduction

`reduceInteger(input, { masterNumbers })` accepts a nonnegative safe integer
number, a nonnegative bigint, or a nonempty ASCII decimal digit string.
Use strings or bigint for integers beyond the safe-number range. Fractions,
signs, whitespace, exponent notation, non-ASCII digits, and implicit object
coercion are rejected. Leading zeroes are removed in the receipt, and numeric
negative zero becomes zero. The receipt records the canonical integer rather
than the caller's original spelling or input type.

`masterNumbers` defaults to `"preserve"`: stop at a single digit or at a
master number, including one reached after an intermediate sum. `"reduce"`
continues to a single digit. The master values are 11, 22, and 33; debt
values are 13, 14, 16, and 19. The fixture cases in
[reductions.json](test/fixtures/reductions.json) enforce these choices in
both policies. Other policy values and unknown option keys are rejected.

Each result contains `value`, `meaning`, `karmicDebts`, and `receipt`. The
receipt has a schema identifier, canonical input, selected policy, each
step's input/digits/output, and its stop reason. Decimal integers are strings
in receipts, so JSON serialization preserves their exact value. Every result
layer is frozen and each call allocates a fresh result.

The synthetic integer example above visits 49, then 13, then 4. Its
karmic-debt annotation points to stage 1: the output of the first sum.
Stage 0 means the initial compound. Debt annotations apply only to visited
values; the digits `13` inside `130` do not qualify. The full receipt and
these examples are enforced in [reduction.test.mjs](test/reduction.test.mjs)
and the handwritten fixtures. An annotation is a symbolic label and does
not assert that someone owes a debt or has a particular past.

Input is limited to 1024 supplied decimal digits, counting leading zeroes
before normalization, to bound receipt allocation. The allocation-bound
test in `reduction.test.mjs` checks the accepted boundary and rejection
beyond it for strings and bigint. Options are ordinary in-process objects;
the API does not sandbox executable getters or proxies supplied by a caller.

## Arithmetic evidence

The golden fixtures are handwritten arithmetic controls. Tests independently
replay receipts with bigint division and remainder and check reduction with
the digital-root formula. The exhaustive property checks cover all integers
from 0 through 9999 under both policies; the seeded controls cover long decimal
inputs beyond safe-number precision. See the named exhaustive and seeded
tests in `test/reduction.test.mjs` for their exact scope and reproducible
generator. These checks establish implementation behavior, not external
agreement with a numerology author or evidence of predictive accuracy.

## Civil dates, life path, and birthday

`parseGregorianDate(date)` accepts only an ASCII `YYYY-MM-DD` string from
`0001-01-01` through `9999-12-31`. It returns a frozen object with `iso`,
`year`, `month`, `day`, and `calendar: "proleptic-gregorian"`. Gregorian leap
rules apply throughout, including before local Gregorian adoption. There is
no year zero, calendar conversion, timezone lookup, time of day, or implicit
current date. Invalid dates are rejected rather than rolled into another
month. JavaScript Date objects, timestamps, offset strings, whitespace, and
unpadded date components are rejected. The strict syntax and calendar boundary tests in
[dates.test.mjs](test/dates.test.mjs) enforce this domain; its exhaustive
Gregorian cycle test compares validation with JavaScript UTC calendar
normalization over every candidate day from 1 through 32 in each month of
1600 through 1999. It also explicitly checks the low and high year boundaries.
The implementation itself never constructs a JavaScript `Date`.

```js
import { parseGregorianDate, lifePath, birthday } from "./.build/index.js";

// Invented civil date used only as an arithmetic example.
const date = "2009-11-29";
const parsed = parseGregorianDate(date);
const path = lifePath(date); // components, preserving masters
const alternative = lifePath(date, { method: "whole-date" });
const day = birthday(date, { masterNumbers: "reduce" });
console.log(JSON.stringify({ parsed, path, alternative, day }));
```

`lifePath(date, { method, masterNumbers })` defaults to `method: "components"`
and `masterNumbers: "preserve"`. The policy is the integer reduction policy
described above, applied identically at each performed reduction:

- `"components"`: reduce the year, month, and day separately, in that order;
  sum their resulting values; reduce that sum. Component master numbers are
  preserved when the policy says to preserve them.
- `"whole-date"`: sum all digits in the original `YYYYMMDD` spelling first;
  reduce that sum. There are no component reductions in this method.

For the synthetic example, component reductions give `11 + 11 + 11 = 33`;
the whole-date digit sum is `24`, which reduces to `6`. With
`masterNumbers: "reduce"`, the components instead become `2 + 2 + 2 = 6`.
The handwritten `component-masters-to-33`,
`whole-date-differs-from-components`, and `reduce-all-component-masters`
cases in [dates.json](test/fixtures/dates.json) enforce these paths. The
methods declare arithmetic conventions; neither is presented as the sole
definition used by numerology practitioners. The planned Pythagorean and
Chaldean name systems share these date formulas.

`birthday(date, { masterNumbers })` validates the entire civil date, then
reduces only the day of the month. Its receipt preserves the original day
as the reduction input, including when it stops at a master number.
It uses the same default master policy as `lifePath`. Unsupported policy or
method values and unknown option keys are rejected; birthday does not accept
a method option.

Both calculation results contain `value`, an original reflection prompt in
`meaning`, `karmicDebts`, and a frozen JSON-safe `receipt`. The life-path
receipt schema is `numerology-life-path/1`; it records the parsed date,
method, master policy, all performed component reductions, the sum's inputs
and output, and the final reduction. Whole-date sum inputs retain leading
zero digits from the date spelling. The birthday schema is
`numerology-birthday/1`; it records the parsed date, master policy, and day
reduction. Each nested reduction includes its original compound and all
digit-sum steps as described under integer reduction.

Debt annotations have `source: "year" | "month" | "day" | "total"` and a
stage local to that source's reduction. They occur in component order,
followed by the total, and are never deduplicated across sources. The
`component-debts-have-locators` and
`year-master-33-and-intermediate-total-debt` fixtures check these locators.
Only performed paths contribute annotations: whole-date calculation does
not inspect the unreduced year or day for debt labels. Birthday labels refer
only to its day reduction. These labels do not diagnose a person's history.

The date tests replay all receipts and compare seeded synthetic dates within
the accepted year range against a separate positional-integer implementation,
under both formulas and both master policies. They also test birthday on
every possible day of a month, digital-root conservation, full result
serialization, deep freezing, and identical outputs across host timezones.
These controls test declared arithmetic, not predictive accuracy.

## Latin names and vowel classification

`normalizeName(name, { yAsVowel })` accepts a string containing supported
Latin letters, attached diacritics, and the separators described below. It
returns `normalized` (uppercase tokens separated by spaces), `letters`
(all emitted letters in order), `vowels`, `consonants`, and a frozen,
JSON-safe `receipt`. Name preprocessing produces letters for later numerical
calculations. It does not assign letter values, reduce a number, or supply
a personality interpretation. The Pythagorean and Chaldean letter tables
are still planned in [PLAN.md](PLAN.md).

```js
import { normalizeName } from "./.build/index.js";

// Invented spelling, with no identified person or birth details.
const name = normalizeName("Yæra Myrr", { yAsVowel: "when-no-other-vowels" });
console.log(name.normalized); // YAERA MYRR
console.log(name.vowels);     // AEAY
console.log(name.consonants); // YRMRR
```

The handwritten `y-conditional-sees-expanded-vowels` case in
[names.json](test/fixtures/names.json) enforces this example.

The Latin convention is `numerology-latin-ascii/1`, exported as
`LATIN_NAME_TABLE_ID`. For each Latin letter, apply Unicode canonical
decomposition (`NFD`), remove the declared combining diacritics, map the
remaining base through the explicit table when needed, then uppercase ASCII
letters. Each stage is recorded, even when its input and output are equal.
Supported diacritics are U+0300 through U+036F, except U+034F (combining
grapheme joiner). A separately supplied diacritic must follow a supported
letter or another attached diacritic, within the same token. A leading mark
or a mark immediately after a separator is rejected. Combining marks outside
this range are rejected, including Cyrillic, Hebrew, and Arabic marks and
variation selectors. Removing a declared mark does not infer its language.
The attached-diacritics test in
[names.test.mjs](test/names.test.mjs) covers the entire declared range.

Canonical decomposition to an ASCII base is accepted, so examples include
`é -> E`, `ñ -> N`, `ü -> U`, and `İ -> I`. Umlauts become their base letter;
they do not become an added E. Canonically equivalent composed and decomposed
spellings produce the same emitted letters and classifications, while their
receipts preserve different source spellings. Canonical Latin aliases `K`
and `Å` become K and A. These cases are checked by the canonical-equivalence
and unsupported-characters tests. There is no compatibility normalization
(`NFKD` or `NFKC`), so fullwidth, circled, and mathematical alphabet spellings
are rejected rather than silently accepted.

The complete explicit table, exported as frozen `LATIN_NAME_TABLE`, is an
authored convention for this project. No external transliteration dataset or
interpretive book text was copied. Mappings describe chosen spellings for
symbolic arithmetic, not pronunciation or an official transliteration
standard. Only the listed bases and Latin letters that canonically decompose
to supported bases are accepted:

| Sources after diacritic removal | ASCII output |
| --- | --- |
| Æ, æ | AE |
| Œ, œ | OE |
| ß, ẞ | SS |
| Ø, ø | O |
| Ł, ł | L |
| Đ, đ, Ð, ð | D |
| Þ, þ | TH |
| Ħ, ħ | H |
| ı | I |
| Ŋ, ŋ | NG |
| Ŧ, ŧ | T |
| ſ | S |
| Ƒ, ƒ | F |
| ﬀ | FF |
| ﬁ | FI |
| ﬂ | FL |
| ﬃ | FFI |
| ﬄ | FFL |
| ﬅ, ﬆ | ST |

The handwritten-equivalences test pins every table entry and checks that
each source's uppercase and lowercase form yields the same output. Multi-letter
expansions contribute every emitted letter. A vowel introduced by a ligature
is included when classifying Y in the token.

Every Unicode `Space_Separator` character creates a token boundary. Accepted
punctuation boundaries are the ASCII hyphen `-`, U+2010 and U+2011 hyphens,
ASCII apostrophe `'`, U+2018 and U+2019 quotation marks, and ASCII period `.`.
These do not contribute letters. Consecutive boundaries collapse, leading
and trailing boundaries are omitted from `normalized`, and all original
separator characters remain in the receipt. Apostrophes, hyphens, and periods
are boundaries even inside a name: `J.Y.` becomes `J Y`. This boundary rule
can affect contextual Y classification. The punctuation-and-spaces test
checks all accepted boundaries. A name containing only separators is invalid.

A, E, I, O, and U are vowels. Other emitted letters are consonants, subject
to the caller's `yAsVowel` choice:

| Policy | Y classification |
| --- | --- |
| `"never"` (default) | Every Y is a consonant. |
| `"always"` | Every Y is a vowel. |
| `"when-no-other-vowels"` | Every Y in a token is a vowel only if that entire token has no A, E, I, O, or U after normalization and expansion. |

The conditional policy inspects the entire token, including letters after
Y. It makes every Y in `Yrynn` a vowel and the Y in `Yæra` a consonant.
These are declared mechanical choices, with no phonetic inference. Vowel
or consonant selections may be empty for a valid name. Unknown option keys,
unsupported policies, and explicit null values are rejected. Ordinary
in-process option objects follow the same getter/proxy limitations as the
reduction API.

The receipt schema is `numerology-name-normalization/1`. It retains the
original `input`, Latin table identifier, selected Y policy, canonical
`tokens`, source `characters`, and emitted `letters`. Each character row
records its original scalar, `sourceIndex` in UTF-16 code units, kind,
output, and the chain of transformation steps. Separate attached marks
produce empty output with their own step. Each letter row records its index,
source character row index, index within a multi-letter expansion, token
index, vowel/consonant kind, and classification reason. All indices begin at
zero. The complete-receipt test pins the receipt for `é-Æy`; replay tests
check source coverage, step chains, expansion locators, token boundaries,
and classifications for handwritten and seeded cases. Receipts contain
the original name and should be handled as caller data.

Names are limited to 1024 original UTF-16 code units, including spaces and
diacritics, before normalization. The allocation-bound test checks this
boundary and expansion behavior. Unsupported Latin bases, non-Latin scripts,
digits, symbols, emoji, malformed surrogates, controls (including tabs and
line breaks), and invisible format characters throw `RangeError`; unsupported
character errors name only the UTF-16 position. Non-string inputs and invalid
option-object types throw `TypeError`. The unsupported-characters test checks
these rejection categories. Greek, Cyrillic, and caller-supplied mappings
remain the next milestone.

The seeded name properties assemble expected letter sequences from
handwritten spelling pairs, replay all receipts, verify vowel/consonant
conservation, compare NFC and NFD spellings, and check normalization
idempotence. Together with the fixtures these establish the declared
normalization convention over their tested inputs, not linguistic
completeness or predictive accuracy. All name processing uses local data
and the runtime's Unicode normalization and property support.
