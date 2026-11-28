# Chart-reading factual rubric

Rubric `chart-reading-factual`, version `1.0.0`, defines how the evaluation
suite compares extracted assertions with the local engine. The normative
rules are this document and [factual-v1.json](rubrics/factual-v1.json). The JSON
records the vocabulary, decision tables, identities, counters and formulas for
the scorer to consume. It is an authored policy, not generated evaluation data.

The [reading scorer](SCORING.md) implements claim comparison and evidence
reports; the [evaluation CLI](EVALUATION.md) combines it with supplied readings,
optional prose extraction and report persistence.
[rubric.checks.mjs](tests/rubric.checks.mjs) checks compatibility with the
existing contracts and the arithmetic below.
[scoring.checks.mjs](tests/scoring.checks.mjs) exercises the implemented rules
against synthetic cases and original inline readings. These checks establish
scoring behavior, not independent astronomical accuracy or extraction quality.

The reference is `computeChartFacts` from [chart-facts.mjs](lib/chart-facts.mjs),
computed for an invented case under its recorded conventions. Correctness means
agreement with that computation. It does not establish independent astronomical
accuracy, the truth of a personality description, predictive validity or the
quality of an interpretation. No model judges prose quality in this rubric.

## Version and input boundary

The rubric's `contracts` names the supported reading, claim, factor and synthetic
case schemas, and the fact adapter's identity and version. Validate the complete
reading and synthetic case before comparison. The reading's `caseId` must equal
the case used to compute the reference. A malformed input, unknown rubric or
contract version, case mismatch, failed engine computation or incomplete reference
is an evaluation error. Refuse it without numerical scores. Do not replace it
with an empty reading, partial reference or successful result with zero scores.

The scorer must receive the complete result of the local adapter. An arbitrary
imported fact list is not an authenticated reference. In particular, absent rows
must not turn a corrupt or partial reference into evidence of a negative claim.
Record the input and reference identity, adapter, engine, ephemeris, bundle and
runtime provenance with the result. A case id or version label alone does not
attest which bytes were computed.

Retain the reference's time basis, Delta T record, temporal availability,
requested and actual house systems, fallback, coverage and flags. An
`outside-reference-span` flag remains visible but does not disable comparison
with the engine. Such a comparison still makes no accuracy claim about the sky.

Changing eligibility, factor identity, verdicts, contradiction rules, coverage
credit or denominators requires a new rubric version. Keep the previous version
available for interpreting its reports. Reports must name the rubric id and
version, a SHA-256 digest of the exact rubric JSON bytes and the implementation
version or digest. A documentation correction that changes no rule may preserve
the version. No threshold or weighted composite is defined by this rubric.

## Reference factors and comparison

The reference universe is the set of distinct positive factors in the complete
adapter's `facts` array. Group it by factor kind. It is independent of the
reading, the seed meanings, generated interpretations and what a model chose to
mention. Do not shrink it for incompatible conventions, hedging or omitted
claims. No alternative target subset is part of this version.

| Category | Reference and comparison rule |
| --- | --- |
| `placement` | Compare body and tropical sign with the body's computed row. |
| `aspect` | Compare the unordered body pair and aspect under `natal-major-defaults`. Only the policy's eligible bodies participate. |
| `house` | Compare body, house number and actual computed system. Membership is the adapter's `houseOf` on ecliptic longitude and cusps. |
| `dignity` | Compare the complete body, actual sign and label tuple under `classical-sign`. Retain every applicable supported label. |

Comparison is exact categorical membership. The scorer introduces no numerical
tolerance, orb widening, sign-boundary rounding or alternative house algorithm.
Longitude, cusp and orb values in reference evidence retain their engine units
and precision; they are not extra quantities that this factor vocabulary scores.
Assertions about degrees, aspect motion, retrogradation, minor aspects or other
unrepresented features stay unsupported when extracted, rather than being reduced
silently to a supported factor. An explicit categorical assertion in the same
sentence may be extracted separately if the unsupported assertion is also retained.

Absence establishes falsehood only inside the supported and available domain.
For a supported aspect pair, absence of an aspect tuple is a negative result
under the recorded policy. For a supported classical planet, an empty dignity
label list establishes absence of the supported sign dignities. It does not
establish peregrine status. Outer-planet dignity claims and node aspects are
outside their respective vocabularies, not confirmed negative claims.

Unavailable houses produce no positive reference house factors. They also
provide no evidence for positive or negative house assertions. Preserve every
availability reason. When the engine falls back from a requested house system,
only the actual computed system provides house evidence. A claim naming the
requested but uncomputed system remains unassessed; its number is not checked
against the fallback as if they were the same system.

For an eligible assertion, apply this truth table to the complete factor:

| Polarity | Factor present | Factor absent within supported domain |
| --- | --- | --- |
| `affirmed` | `correct` | `incorrect` |
| `negated` | `incorrect` | `correct` |

Negation applies to the entire tuple. In particular, negating a dignity factor
means denying the conjunction of its body being in that sign and having that
label. It does not affirm the sign or deny every dignity of that body. A sentence
asserting a sign while denying a dignity needs a separate placement assertion
and a correctly scoped negative dignity assertion. Extractors must preserve that
distinction, or mark the sentence ambiguous. A correct negation earns correctness
credit but never positive-factor coverage.

## Eligibility and unassessed assertions

Schema resolution only means that an assertion has a representable factor. It
does not give the assertion a correctness verdict. Apply these rules before
looking up membership:

| Claim field or condition | Treatment |
| --- | --- |
| `resolved`, `unqualified`, `reference-instant`, compatible explicit conventions and available domain | Eligible for membership comparison. |
| `hedged` or `conditional` | `unassessed`, with the corresponding reason. No partial correctness credit. |
| `whole-day` or `unspecified` temporal scope | `unassessed`, with `whole-day` or `unspecified-temporal-scope`. |
| Required reading convention is `unspecified` | `unassessed`, with `unspecified-convention`. |
| Required convention differs from the reference | `unassessed`, with `convention-mismatch`. |
| A factor's convention conflicts with an explicit reading convention | `unassessed`, with `factor-context-conflict`. |
| House domain unavailable | `unassessed`, with `unavailable-houses`. |
| `ambiguous` or `unsupported` status | Keep an unresolved occurrence and its supplied reason, without a factor or verdict. |
| `abstained` status | Keep an abstention occurrence and its reason, without correctness or coverage credit. |
| `interpretive` status | Keep an interpretive occurrence, outside factual scoring. |

Record all applicable unassessed reason codes in the order given by
`unassessedReasons` in the JSON, without counting the same unit more than once.
For convention problems, also name each affected field and its declared,
factor-level and reference values where applicable. A missing value is not a
mismatch: skip comparison with a missing or `unspecified` value and report the
reason it is missing. In particular, do not compare a house system with a null
actual system when houses are unavailable.

Each category requires the reading's explicit tropical zodiac. Aspects also
require `aspectPolicy: "natal-major-defaults"`, dignities require
`dignitySystem: "classical-sign"`, and houses require the actual computed house
system. Relevant factor-level conventions must match the reading and reference.
Conventions irrelevant to a category do not block it. For example, an
unspecified house system does not block a placement claim. Sidereal context is
unassessed even if a particular aspect would be invariant to a shared rotation;
this rubric does not silently translate conventions or infer missing context.

Only explicit reference-instant claims qualify, even when birth time is known.
When time is unknown, placements, aspects and dignities can still be compared
at the supplied reference instant. Nothing in this reference establishes a
whole-day claim or substitutes a noon chart. A hedge is not a probability
estimate: the schema has no calibrated probability to score. A conditional
sentence does not assert that its condition holds.

An abstention cannot be assigned to a factor or category by this schema, which
stores only its quote and reason. Count it globally. Do not infer that it is an
appropriate abstention, an unavailable-house success or evidence of coverage.
Omitting a fact is different from explicitly abstaining: omission affects
coverage without creating an abstention record.

## Duplicate units and retained occurrences

Preserve all original claims, their order, ids, quotes and spans. Separately form
unique resolved units within each reading. A unit key contains a canonical
factor, polarity, certainty and temporal scope. Use JSON tuple serialization,
with factor fields in the JSON policy's order. For aspects, sort the body labels
by ordinary JavaScript string order before placing them in the `a` and `b`
slots. Do not use locale-dependent collation or reorder other values.

Claim ids and spans do not affect resolved identity. Use the first occurrence
as the representative and link every occurrence to it. Repetition, a reversed
aspect pair or reordered JSON object keys earns no extra credit and creates no
extra penalty. Different polarity or value remains a separate unit; do not let
the last claim overwrite an earlier claim. Different certainty or scope remains
separate so an assessed assertion cannot hide an unassessed one. The reading's
global context applies to all its units. Never deduplicate across readings.

Unresolved, abstained and interpretive records have no canonical factor.
Preserve and count their occurrences as supplied, including repeated spans.
Do not guess semantic equivalence from similar prose. These occurrence counts
are diagnostics and do not enter denominators defined over resolved units.

## Contradictions

Detect the following pairwise conflicts only among assessed unique resolved
units in the same reading. Thus qualifiers, unsupported scopes and incompatible
conventions do not generate a contradiction by themselves.

| Rule id | Conflict |
| --- | --- |
| `same-factor-opposite-polarity` | The identical canonical factor is affirmed and negated. |
| `affirmed-exclusive-placement-signs` | The same body is affirmed in different signs. |
| `affirmed-exclusive-house-numbers` | The same body is affirmed in different house numbers under the same computed system. |
| `affirmed-exclusive-aspect-types` | The same unordered pair is affirmed with different aspect types under the same natal policy, whose result selects a single type for a pair. |
| `incompatible-placement-and-dignity-signs` | At least one unit is an affirmed dignity. Treat affirmed placements and dignities as asserting their sign: different signs for the same body conflict. An affirmed dignity also conflicts with a negated placement of that body in that same sign. |

Different dignity labels are not inherently exclusive. Domicile and exaltation,
or detriment and fall, can coexist; separate matching labels earn separate
coverage. A negated dignity does not assert or deny a placement, so it supplies
no implied sign constraint for the last rule. House numbers and aspect types
are exclusive only in their matching convention context.

Emit one unordered edge per conflicting unit pair, with every applicable rule
id in policy order. Link all original claim ids through the units. Count each
participating unit only once for the contradiction rate, regardless of how many
edges touch it. Keep its membership verdict: a correct assertion remains
correct for the correctness denominator even when another assertion contradicts
it. Withhold coverage from every participating unit so listing competing
answers cannot earn coverage for the answer that happens to match.

This is a bounded set of pairwise rules, not a complete logical consistency
checker. It does not infer all placements from house membership or detect every
collective impossibility, such as denying every possible sign through separate
negative claims. Reports may say no contradiction was detected under these
rules; they must not claim that the reading is logically consistent.

## Counts, rates and coverage

The following counters are required per category and overall:

| Counter | Definition |
| --- | --- |
| `correct` (C) | Unique resolved units judged correct. |
| `incorrect` (I) | Unique resolved units judged incorrect. |
| `unassessedResolved` (R) | Unique resolved units excluded before membership comparison. |
| `contradicted` (X) | Assessed unique units participating in a contradiction edge. |
| `referenceFactors` (F) | Distinct available positive reference factors. |
| `coveredFactors` (K) | Distinct reference factors matched by a correct affirmed unit participating in no contradiction. |

All are nonnegative integer counts. C, I and R partition the unique resolved
units. X cannot exceed C + I. K cannot exceed F or C. Coverage gives no credit
for an implied factor: a dignity assertion does not also cover its placement
unless a separate placement assertion was extracted and qualifies. Unsupported
and unavailable reference domains supply no F; omitted available factors remain
in F. No readings can change these denominators by asking for a smaller scope.

| Metric | Numerator | Denominator |
| --- | --- | --- |
| `correctness` | C | C + I |
| `coverage` | K | F |
| `contradictionRate` | X | C + I |
| `resolvedAssessmentRate` | C + I | C + I + R |

Each metric must report its numerator, denominator and value. If its denominator
is zero, its value is JSON `null`, never a perfect score, zero, NaN or Infinity.
Otherwise divide without rounding in the machine report. Compute overall rates
by summing the category counts before dividing, not by averaging category rates.
For a later multi-reading summary, likewise sum counts across readings, including
each reading's reference universe; do not deduplicate identical cases across
readings. Also expose how many readings were attempted, completed or refused;
errors do not disappear into the scored denominator.

Report occurrence counts for every original status, resolved occurrence counts
by category, unique resolved counts and duplicate counts. Unresolved, abstained
and interpretive occurrences belong to `unassigned`, not a guessed category.
Their counts stay separate from resolved-unit counts and rates. In particular,
`resolvedAssessmentRate` describes only the resolved portion, not the fraction
of all prose or all assertions that the evaluator understood.

Correctness must be read alongside coverage, the other rates and unresolved
occurrence counts. A stream of correct negations can have perfect correctness
while covering no positive facts. Unassessed or unsupported assertions are
neither correct nor incorrect, and remain visible rather than receiving free
credit. An all-abstention reading and an empty extraction have undefined
correctness and zero coverage when positive reference factors exist. Omission
reduces coverage; this rubric does not apply an additional correctness penalty
for it. Coverage describes completeness against the full factor inventory, not
a requirement that a useful short interpretation discuss every factor.

The following arithmetic examples use hypothetical tally inputs, not measured
charts or stored model readings. The test named "rubric worked examples use
explicit counts and null empty denominators" in
[rubric.checks.mjs](tests/rubric.checks.mjs) enforces each row over these exact
inputs. C, I, R, X, K and F refer to the counter definitions above.

| Scenario | C, I, R, X, K, F | Correctness | Coverage | Contradiction rate | Resolved assessment rate |
| --- | --- | --- | --- | --- | --- |
| Empty extraction | 0, 0, 0, 0, 0, 4 | null | 0 | null | null |
| Correct assertion repeated | 1, 0, 0, 0, 1, 4 | 1 | 0.25 | 0 | 1 |
| Correct negation only | 1, 0, 0, 0, 0, 4 | 1 | 0 | 0 | 1 |
| A factor affirmed and negated | 1, 1, 0, 2, 0, 4 | 0.5 | 0 | 1 | 1 |
| Wholly hedged assertion | 0, 0, 1, 0, 0, 4 | null | 0 | null | 0 |
| Independent wrong and right assertions | 1, 1, 0, 0, 1, 4 | 0.5 | 0.25 | 0 | 1 |
| Category without claims or positive facts | 0, 0, 0, 0, 0, 0 | null | null | null | null |

## Required evidence and limits

The scorer's report must retain per-occurrence and per-unit evidence:
the original quote, span, status, normalized factor where present, eligibility
reasons, membership verdict, reference factor or absence evidence, contradiction
links and coverage decision. Positive evidence points to the matching factor
and the relevant body, aspect, cusp or dignity rows. Negative evidence names the
supported domain and inspected rows, rather than inventing a positive fact id.
For houses also include the body's longitude and computed cusps. Provenance and
conventions belong to the whole reference, with clear links from each unit.

Preserve the reading's origin and extraction metadata. Its
`extraction.coverage: "unverified"` remains unverified even after all extracted
claims have been compared. Schema validation establishes exact quotes, not that
the claims faithfully represent those quotes or exhaust the reading. No factual
score is evidence of extractor recall or extraction accuracy. Empty extraction
from nonempty text must be visible through the text, extraction metadata and
counts. The scorer must not relabel it as a wholly correct reading.

Symbolic themes, style, empathy, advice and interpretive coherence remain outside
these rates. The seed text is not a gold answer for prose quality. Any later
human or model assessment of interpretations needs its own rubric, provenance
and report fields, without changing this factual rubric's scores.
