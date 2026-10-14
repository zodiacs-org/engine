# Numerology development project

A private TypeScript library and planned JSON CLI, adjacent to
`@zodiacs/engine` and isolated from its npm package. Code and documentation
here use the repository's [MIT license](../LICENSE). This project currently
implements integer reduction, civil-date validation, life path, birthday,
and name normalization using Latin, Greek, Cyrillic, and caller mappings,
with vowel/consonant classification. It also implements Pythagorean and
Chaldean expression/destiny, soul urge, and personality calculations.
[PLAN.md](PLAN.md) tracks the remaining name analyses, cycles,
profiles, and CLI.

Numerology results describe symbolic conventions and provide reflection
prompts. The tests check arithmetic and declared behavior. They do not test
whether numerology predicts personality or events. The meanings in
`src/meanings.ts` and the empty-selection text in `src/name-numbers.ts`
are original text authored for this project.

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

`normalizeName(name, { yAsVowel, transliteration })` accepts a string containing
supported letters, attached diacritics, and the separators described below. It
returns `normalized` (uppercase tokens separated by spaces), `letters`
(all emitted letters in order), `vowels`, `consonants`, and a frozen,
JSON-safe `receipt`. Name preprocessing produces letters for later numerical
calculations. It does not assign letter values, reduce a number, or supply
a personality interpretation. The name-number APIs below consume this
normalization and apply the selected Pythagorean or Chaldean letter table.

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
this range reject by default, including Cyrillic, Hebrew, and Arabic marks.
An exact caller mapping can accept ordinary script marks as described below;
variation selectors always reject. Removing a declared mark does not infer its language.
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

The receipt schema is `numerology-name-normalization/2`, replacing the earlier
development schema to include transliteration provenance. It retains the
original `input`, Latin, Greek, and Cyrillic table identifiers, the complete
caller table or `customTable: null`, selected Y policy, canonical
`tokens`, source `characters`, and emitted `letters`. Each character row
records its original scalar, `sourceIndex` in UTF-16 code units, kind,
output, and the chain of transformation steps. Separate standard attached marks
produce empty output with their own step; caller-mapped marks may emit letters.
Each letter row records its index,
source character row index, index within a multi-letter expansion, token
index, vowel/consonant kind, and classification reason. All indices begin at
zero. The complete-receipt test pins the receipt for `é-Æy`; replay tests
check source coverage, step chains, expansion locators, token boundaries,
and classifications for handwritten and seeded cases. Receipts contain
the original name and should be handled as caller data.

Names are limited to 1024 original UTF-16 code units, including spaces and
diacritics, before normalization. The allocation-bound test checks this
boundary and expansion behavior. Unsupported letter bases and unmapped scripts,
digits, symbols, emoji, malformed surrogates, controls (including tabs and
line breaks), and invisible format characters throw `RangeError`; unsupported
character errors name only the UTF-16 position. Non-string inputs and invalid
option-object types throw `TypeError`. The unsupported-characters test checks
these rejection categories. The tables and caller mapping rules below extend
the accepted scripts without relaxing control or format-character rejection.

The seeded name properties assemble expected letter sequences from
handwritten spelling pairs, replay all receipts, verify vowel/consonant
conservation, compare NFC and NFD spellings, and check normalization
idempotence. Together with the fixtures these establish the declared
normalization convention over their tested inputs, not linguistic
completeness or predictive accuracy. All name processing uses local data
and the runtime's Unicode normalization and property support.

## Greek, Cyrillic, and caller transliteration

The frozen `GREEK_NAME_TABLE` and `CYRILLIC_NAME_TABLE` exports are authored
spelling conventions, identified by `GREEK_NAME_TABLE_ID` and
`CYRILLIC_NAME_TABLE_ID`. Their identifiers are `numerology-greek-ascii/1`
and `numerology-cyrillic-ascii/1`. Both tables apply by default, including
in mixed-script names. Their complete uppercase mappings follow; the tables
explicitly include the corresponding lowercase scalars. Greek final sigma
`ς` also maps to S. The complete handwritten scalar-equivalences test in
[transliteration.test.mjs](test/transliteration.test.mjs) pins every entry
and checks its case forms and canonical decomposition.

| Greek source | ASCII output | Greek source | ASCII output |
| --- | --- | --- | --- |
| Α | A | Ν | N |
| Β | B | Ξ | X |
| Γ | G | Ο | O |
| Δ | D | Π | P |
| Ε | E | Ρ | R |
| Ζ | Z | Σ, ς | S |
| Η | E | Τ | T |
| Θ | TH | Υ | Y |
| Ι | I | Φ | PH |
| Κ | K | Χ | CH |
| Λ | L | Ψ | PS |
| Μ | M | Ω | O |

Greek letters use NFD and the same diacritic range as Latin letters, then
the explicit Greek table. Tonos, breathing marks, diaeresis, and iota subscript
in that declared range are removed; no extra letter is inferred from them.
Unlisted bases, including archaic letters and compatibility glyphs, reject.
Letter pairs do not receive context-specific spellings. Upsilon becomes Y
and follows the selected Y policy after expansion.

| Cyrillic source | ASCII output | Cyrillic source | ASCII output |
| --- | --- | --- | --- |
| А | A | П | P |
| Б | B | Р | R |
| В | V | С | S |
| Г | G | Т | T |
| Д | D | У | U |
| Е | E | Ф | F |
| Ё | YO | Х | KH |
| Ж | ZH | Ц | TS |
| З | Z | Ч | CH |
| И | I | Ш | SH |
| Й | Y | Щ | SHCH |
| К | K | Ъ | empty |
| Л | L | Ы | Y |
| М | M | Ь | empty |
| Н | N | Э | E |
| О | O | Ю | YU |
| Я | YA | Ґ | G |
| Є | YE | І | I |
| Ї | YI | Ў | W |
| Ј | J | Љ | LJ |
| Њ | NJ | Ћ | C |
| Ђ | DJ | Џ | DZ |
| Ѓ | GJ | Ќ | KJ |
| Ѕ | DZ | | |

Cyrillic uses a different canonical rule to preserve its explicit letter
distinctions. For a source letter, consult its immediately following standard
diacritics, compose that context with NFC, remove remaining separate standard
diacritics, and look up the resulting scalar. Thus composed and decomposed Й,
Ё, Ї, Ў, Ѓ, and Ќ use their own entries. A mark with an exact caller mapping
ends this lookahead. Unlisted composed bases reject instead of being reduced
to a different letter. This table is finite; it does not cover every Cyrillic
alphabet. The canonical-context test enforces these distinctions.

Each Cyrillic base row records a `canonical-context` step with
`followingDiacritics`, followed by `strip-diacritics` and `cyrillic-table`.
Looked-ahead marks still have their own original scalar receipt rows, UTF-16
positions, and empty-output `attached-diacritic` steps. This preserves source
coverage while explaining which context selected a spelling. Greek table
steps use `greek-table`. Silent hard and soft signs have letter rows with
explicit empty table outputs. They do not create token boundaries; tokens
with no emitted letters are omitted. A name with no emitted letters rejects.
The receipt replay and silent-sign tests check these rules.

No external transliteration dataset, standard table, or book text was copied.
These choices describe symbolic arithmetic, not a person's pronunciation,
preferred spelling, nationality, language, or identity. Different explicit
spellings can produce different numerology results. The name-number APIs
below preserve these spelling choices in their calculation receipts.

For other scripts or a preferred spelling convention, supply a caller table:

```js
import { normalizeName } from "./.build/index.js";

// Invented spelling and caller convention, not an identified person.
const name = normalizeName("岚禾", {
  transliteration: {
    id: "synthetic-han/1",
    mappings: { 岚: "LAN", 禾: "HE" }
  }
});
console.log(name.normalized); // LANHE
```

The `caller-han-table` fixture in
[transliteration.json](test/fixtures/transliteration.json) enforces this
example. Each key must be exactly one Unicode letter or mark scalar, and
each output must be uppercase ASCII letters or an explicit empty string.
Digits, symbols, separators, malformed surrogates, controls, and default
ignorable characters cannot be mapped, including grapheme joiner and variation
selectors. The table may map non-Latin letters and script-specific vowel
marks. A mark still needs an accepted preceding letter in the same token;
it cannot start a name or follow a separator. A supplied empty output is an
auditable omission rather than an unsupported-character fallback.

Exact caller mappings take precedence over built-in tables and standard mark
removal. They are case-sensitive scalar matches before normalization. There
is no implicit case expansion, canonical matching, multi-character matching,
phonetic algorithm, or network lookup. For example, a mapping for composed
`ё` does not also map decomposed `е` plus diaeresis. A caller that needs such
equivalence must declare appropriate scalar spellings or supply a chosen
Latin spelling directly. Missing mappings fall back to the finite built-in
rules; an unsupported remainder rejects the whole name. The exact-override
and partial-table tests check this behavior.

`transliteration` requires only own data fields `id` and `mappings`. The
identifier has an ASCII letter or digit first, then letters, digits, period,
underscore, slash, or hyphen, with at most 80 characters. There must be from
1 through 256 own mapping entries, with at most 16 emitted ASCII letters per
entry. These bounds are enforced by the allocation-boundary test. Mapping
accessors, symbol keys, extra envelope fields, invalid output types, and empty
tables reject. Inherited mappings are ignored. Validation does not execute
mapping getters; caller-supplied proxies remain ordinary executable JavaScript.

Every result snapshots the complete caller table, including unused entries,
in `receipt.customTable`, sorted by the scalar key's JavaScript string order.
The caller identifier alone is not enough to replay a table. Each applied
mapping has a `custom-table` step; emitted letters, including letters from
marks, retain source and expansion locators and use the same Y policy. The
snapshot and all result layers are frozen without freezing caller input.
The provenance test checks sorting, serialization, and independence from
later caller mutations.

The handwritten fixtures cover these table conventions and synthetic caller
spellings in Han, Hebrew, Devanagari, and Deseret scripts. The seeded mixed-script
property test assembles independent expected emissions, checks conservation
and classification, replays receipts, compares NFC/NFD forms for its declared
inputs, and normalizes the emitted ASCII again. These controls establish the
tested spelling rules, not linguistic completeness or predictive accuracy.

## Pythagorean and Chaldean name numbers

`expression(name, options)` sums every emitted letter in the entire supplied
name and reduces that sum. `destiny` is an exact alias for `expression` and
has the same `calculation: "expression"` receipt. `soulUrge(name, options)`
sums only emitted vowels; `personality(name, options)` sums only emitted
consonants. Use the spelling you intend to analyze. The library does not
infer whether it is a birth name, a used name, a legal name, or a full name.

Options are `system`, `masterNumbers`, `yAsVowel`, and `transliteration`.
Their defaults are `"pythagorean"`, `"preserve"`, `"never"`, and no caller
mapping, respectively. The master policy, normalization rules, Y choices,
and caller mappings are the APIs described above. Only `"pythagorean"` and
`"chaldean"` systems are accepted. Unknown option keys, unsupported values,
and explicit null values reject. Ordinary options have the same in-process
getter and proxy limitations as the other APIs. Unsupported names reject
as a whole, including when the unsupported character would not have belonged
to the selected vowels or consonants.

```js
import { expression, destiny, soulUrge, personality } from "./.build/index.js";

// Invented spelling with no identified person or birth details.
const name = "Ael Vorn";
const options = { system: "chaldean", masterNumbers: "preserve" };
console.log(JSON.stringify({
  expression: expression(name, options),
  destiny: destiny(name, options),
  soulUrge: soulUrge(name, options),
  personality: personality(name, options)
}));
```

The frozen exports `PYTHAGOREAN_LETTER_TABLE` and `CHALDEAN_LETTER_TABLE`
map uppercase ASCII letters to values. Their respective identifiers are
`numerology-pythagorean-letters/1` and `numerology-chaldean-letters/1`,
exported as `PYTHAGOREAN_LETTER_TABLE_ID` and `CHALDEAN_LETTER_TABLE_ID`.
The complete groupings follow. The complete-alphabetical-tables test in
[name-numbers.test.mjs](test/name-numbers.test.mjs) checks every letter
against separate alphabet-position arithmetic and a handwritten grouping
lookup, along with both identifiers, case forms, and table freezing.

| Value | Pythagorean letters | Chaldean letters |
| --- | --- | --- |
| 1 | A J S | A I J Q Y |
| 2 | B K T | B K R |
| 3 | C L U | C G L S |
| 4 | D M V | D M T |
| 5 | E N W | E H N X |
| 6 | F O X | U V W |
| 7 | G P Y | O Z |
| 8 | H Q Z | F P |
| 9 | I R | none |

The Pythagorean convention assigns repeating alphabetical values from 1
through 9. This name is a system label, not a historical claim about
Pythagoras. The Chaldean letter values were checked against Cheiro,
*Cheiro's Book of Numbers* (first published 1926), chapter XII, the alphabet
table on PDF page 65 of this
[online transcription](https://www.svpvril.com/SVP_Library/Book-of-Numbers-Cheiro.pdf),
read on 2026-10-14. Only letter-value facts are used; no book interpretations,
examples, birth data, or prose are copied. The label does not establish an
ancient origin. This transcription is a table reference, not a verified
facsimile or evidence for the book's claims. The frozen table and handwritten
grouping test keep the declared mappings inspectable locally.

The selected system changes only the letter values. Both systems use the
same whole-name sum, vowel/consonant selections, debt labels, and explicit
master policy in this project. These choices are the project's declared
combined conventions, not a reproduction of every formula in Cheiro's book
or a claim that all practitioners agree. Date formulas remain the civil-date
formulas above. A Chaldean sum can still reduce to 9 despite no letter having
that value, as checked by `chaldean-greek-expansions-can-total-nine` in
[name-numbers.json](test/fixtures/name-numbers.json).

All selected emitted letters contribute their raw table values before any
reduction. Tokens, given names, surnames, expansions, and vowel/consonant
subsets are not reduced separately in expression. Each letter from an
expansion contributes, including caller-mapped attached marks; silent mappings
and separators contribute no value. The `whole-name-does-not-reduce-tokens`
fixture enforces the full-name sum. For the synthetic example above, the
Chaldean expression path is `29 -> 11`, soul urge is `13 -> 4`, and
personality is `16 -> 7`. The `chaldean-reached-master-and-selection-debts`
fixture enforces these paths. The Pythagorean spelling instead sums to 33,
which stops or reduces to 6 under the requested policy, enforced by
`pythagorean-full-name-master-33` and `pythagorean-reduce-master-33`.

A valid name can have no vowels or no consonants under its selected Y policy.
That selection has `contributions: []`, `sum: { inputs: [], output: 0 }`,
and an ordinary zero reduction with no digit-sum steps or debts. Its outer
`meaning` explicitly states the absence of selected letters, using the
original `EMPTY_SELECTION_MEANINGS` export. Zero here denotes an empty
selection, not a personality trait or a missing name. The nested reduction
retains the ordinary arithmetic meaning for zero. An empty name or a name
whose mappings emit no letters still rejects. The valid-empty-selections
test checks these behaviors under both systems and master policies.

Each result has `value`, an original reflection prompt in `meaning`,
`karmicDebts`, and a deeply frozen JSON-safe `receipt`. The receipt schema
is `numerology-name-number/1`. It records:

- `calculation`: `"expression"`, `"soul-urge"`, or `"personality"`;
- `system`, the versioned `letterTable`, and `masterNumbers`;
- `selection`: `"all"`, `"vowels"`, or `"consonants"`;
- `normalization`: the complete normalized-name result, including the
  original input, transformation steps, Y classifications, table identifiers,
  and complete caller-table snapshot;
- `contributions`: the selected normalization letter rows, each with its
  table `value`, emitted-letter `index`, source `characterIndex`,
  `expansionIndex`, `tokenIndex`, and vowel/consonant classification;
- `sum`: ordered raw `inputs` and their exact integer `output`;
- `reduction`: the complete integer-reduction result, with its original
  compound, digit-sum steps, stop reason, meaning, and debt annotations.

Contribution indices retain their original emitted-letter positions after
filtering, so they can have gaps. They locate source rows in
`receipt.normalization.receipt.characters`; source rows give original UTF-16
positions. The filtered-contributions test checks multi-letter expansions,
an astral source character, attached mapped marks, and separated tokens.
The complete-small-receipt test pins the whole result for the synthetic
spelling `A-B`.

Debt stages refer only to the selected total's performed reduction. No debt
is inferred from individual letters, unselected letters, token totals, or
digit substrings. The `unvisited-token-debt-is-absent` and
`pythagorean-intermediate-debt` fixtures check this scope and intermediate
stage locations. Debt labels are reflection prompts, not diagnoses.

Raw expression sums equal the vowel sum plus the consonant sum under
identical options. Reduced values need not add to the reduced expression,
especially when a master stops reduction. The exhaustive-ASCII-pairs test
checks every ordered pair of uppercase ASCII letters under both systems
and master policies, with the default Y rule. The seeded-mixed-script test
assembles expected emissions from handwritten spelling pairs, applies every
Y policy, checks raw sum conservation and digital roots, replays all nested
receipts, and checks canonical decomposition and ASCII normalization
equivalence for its declared inputs. Its reproducible generator and scope
are in `name-numbers.test.mjs`. Handwritten fixtures cover both systems,
all master and debt values, intermediate paths, non-Latin and caller
spellings, intentional omissions, and empty selections. Allocation tests
enforce the existing name and caller-expansion bounds, and ownership tests
check deep freezing and caller-table snapshots. These controls establish
declared arithmetic behavior, not linguistic completeness or predictive
accuracy.
