# Conservative prose extraction

`extractReadingClaims` recognizes a limited English factual grammar and returns
quoted claims for the existing [reading scorer](SCORING.md). It does not consult
chart facts, infer missing planets or signs, call a model or assess correctness.
Unknown text remains unresolved. The implementation is
[extract-reading-claims.mjs](lib/extract-reading-claims.mjs); its behavior and
boundaries are checked by [extraction.checks.mjs](tests/extraction.checks.mjs).
These are operational checks with original synthetic examples, not measurements
of extraction accuracy or recall on model readings.

## Input and API

Supply a complete valid [reading envelope](schema/reading.schema.json), with
`extraction.method: "none"` and an empty `claims` array. Its conventions,
synthetic case identity, provenance and license must already be supplied. The
extractor preserves that metadata and the original text. It refuses previously
annotated readings instead of replacing their claims.

From a module run at the repository root:

```js
import { readFile } from "node:fs/promises";
import { extractReadingClaims } from "./evals/lib/extract-reading-claims.mjs";

const input = JSON.parse(await readFile("evals/scratch/reading.json", "utf8"));
const { reading, extraction } = extractReadingClaims(input);
console.log(JSON.stringify({ reading, extraction }));
```

The function is synchronous and writes no files. Its result is a frozen owned
snapshot, so neither extraction nor later caller edits modify the other copy.
The returned `reading` passes the existing reading validator. Scoring remains
a separate operation, with its own synthetic-case validation and freshly
computed engine reference. See [EVALUATION.md](EVALUATION.md) for evaluation
commands.

## Recognized grammar

Each statement must match a whole supported sentence. Matching ignores case,
allows `The` before a named body, and normalizes whitespace for recognition.
Quotes retain the exact original characters and UTF-16 offsets. A final period
is allowed, and an unterminated final statement can also match.

The optional prefixes occur in this order:

| Position | Supported wording | Meaning recorded |
| --- | --- | --- |
| Temporal scope | `At the supplied instant,` or `At the reference instant,` | `reference-instant` |
| Temporal scope | `Throughout the day,` | `whole-day` |
| Qualification | `Perhaps` | `hedged` |
| Qualification | `If this input is correct,` | `conditional` |
| Whole-factor denial | `It is not the case that` | `negated` |

Omitting the temporal prefix records `unspecified`; the extractor does not use
birth-time knowledge to strengthen it. Omitting a qualification records
`unqualified`. Under the [rubric](RUBRIC.md), whole-day, unspecified, hedged and
conditional claims receive no factual assessment.

After these prefixes, the supported forms are:

| Factor | Affirmative forms | Local negative forms |
| --- | --- | --- |
| Placement | `Sun is in Aries` | `Sun is not in Aries`, `Sun isn't in Aries` |
| Aspect | `Sun forms trine with Moon`, `Sun forms a trine with Moon` | `Sun does not form a trine with Moon` |
| House | `Moon is in house 3`, `Moon occupies house 3` | `Moon is not in house 3`, `Moon isn't in house 3`, `Moon does not occupy house 3` |
| Dignity | `Mercury is in Virgo with exaltation` | Use an explicit whole-factor denial of the affirmative form. |

Body, sign, aspect, house and dignity values come from the existing
[factor schema](schema/meaning-entry.schema.json). Unsupported bodies, self
aspects, unknown signs, unsupported aspect types, invalid houses and outer-planet
dignities stay unresolved. A representable assertion such as `Mercury is in
Aries with exaltation` remains a supplied claim for later comparison; extraction
does not correct its content using dignity rules or engine facts.

Aspects can append `under natal-major-defaults`, houses can append `under`
followed by a supported house-system id, and dignities can append
`under classical-sign`. An omitted clause uses the corresponding explicit
reading convention only when it names a supported system or policy. Otherwise
the sentence is ambiguous. An explicit supported clause remains as written even
if it conflicts with reading metadata; the scorer handles that disagreement.
The reading's zodiac is preserved, including `sidereal` or `unspecified`, for
the scorer's convention eligibility checks.

Negation applies to the entire factor tuple. For example,
`It is not the case that Mercury is in Virgo with exaltation` denies that
combined proposition. It does not separately assert Virgo or deny all Mercury
dignities. The extractor leaves `Mercury is in Virgo but not exalted`, missing
signs, double negation, `not only`, alternatives and compound assertions
unresolved. A dignity claim produces no implied placement claim.

## Segmentation and unresolved context

Blank lines delimit paragraphs; a single newline is a soft wrap. Within a
paragraph, a period followed by whitespace or the end of the paragraph ends a
segment. Commas, colons and semicolons do not create independent assertions.
Decimal points with a following digit do not split a segment.

If any segment in a paragraph is unsupported or ambiguous, other recognizable
sentences in that paragraph are also withheld as ambiguous. This prevents
unknown conditions, trailing qualifications or corrections in that paragraph
from being discarded while their recognizable fragments receive credit.
Question marks and exclamation marks make their paragraph ambiguous.
Quotation delimiters, backticks, tilde fences or angle brackets (including
markup and blockquote markers) make the entire reading ambiguous, including fenced or
quoted material that crosses blank lines. Straight and curly single quotes
used as delimiters also trigger this guard; apostrophes inside contractions
do not disable the supported `isn't` form.

Some unresolved wording can qualify another paragraph. If an unresolved block
has a conditional, hypothetical, quotation, refutation or discourse cue, or
ends with a colon, the extractor withholds otherwise recognizable assertions
throughout the reading. The tests exercise conditions, examples and corrections
separated from their assertions by blank lines. Ordinary unknown symbolic
prose without a recognized cue does not automatically disable other paragraphs.

The extractor does not understand discourse. A blank paragraph boundary does
not prove that a condition, hypothetical context or correction has ended.
It also cannot establish whether the supplied reading conventions faithfully
describe the prose. Its syntactic safeguards reduce obvious partial matches;
they do not establish faithful or exhaustive semantic extraction.

Every non-whitespace segment is retained as an exact quote, including unknown
text. Unknown text is not automatically labeled interpretive or an abstention.
Duplicates and reversed aspect pairs retain separate occurrences and distinct
claim ids; the scorer handles their identity. Facts absent from the prose
produce no claims, and no engine reference is supplied to the extractor.

## Extraction evidence and limits

The returned `reading.extraction` identifies `conservative-prose-extractor` and
`prose-v1`, with `coverage: "unverified"`. The separate `extraction` record
contains implementation identity and digest, canonical input and output-reading
digests, limits, paragraph and segment counts, counts by extraction status,
reason counts and UTF-16 character accounting. Its implementation version is
`1.0.0`. Identity and snapshot assertions are enforced in
[extraction.checks.mjs](tests/extraction.checks.mjs).

Quoted and unquoted character counts describe where spans lie in the retained
text. They are not estimates of claim recall. A fully segmented reading can
still contain misunderstood or unresolved assertions. Extraction coverage
stays unverified when every recognized claim later agrees with the engine.
Read factual scores alongside unresolved occurrences, positive-factor coverage
and the report's extraction limits.

The extractor inherits the reading schema's text limit and enforces the quote
and claim bounds in `EXTRACTION_LIMITS`. A sentence exceeding the quote bound or
a reading producing excess segments is refused as a whole. It is never
truncated into a resolved prefix or returned as a successful partial extraction.
The compact result must also fit `EXTRACTION_REPORT_BYTES`. The boundary tests
check the exported limits against accepted and refused inputs.

Failures throw `ExtractionError` with fixed diagnostic text and no supplied
prose or raw nested error:

| Code | Meaning |
| --- | --- |
| `invalid-reading` | Input capture, reading schema or quote validation failed. |
| `already-extracted` | A valid envelope has an extraction method other than `none`. |
| `extraction-limit` | A quote or the segment count exceeds the extraction bounds. |
| `output-limit` | The complete extraction result exceeds its byte bound. |
| `extraction-contract` | The constructed reading failed its required contract. |

Schema validation occurs before the already-extracted check. For example, an
envelope with method `none` and nonempty claims is malformed. The library reads
no credentials, makes no network requests and writes no files. Keep locally
generated readings and reports in the ignored project folders.
