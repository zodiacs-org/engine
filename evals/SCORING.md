# Deterministic reading scoring

`scoreReading` compares supplied factual claims with a fresh local engine
reference under [RUBRIC.md](RUBRIC.md) and
[factual-v1.json](rubrics/factual-v1.json). It scores agreement with that engine
under recorded conventions. It does not measure independent astronomical
accuracy, interpretation quality, personality truth or predictive validity.

## API

Use Node.js with the eval-local dependencies installed as described in
[README.md](README.md). From a module run at the repository root:

```js
import { readFile } from "node:fs/promises";
import { scoreReading } from "./evals/lib/score-reading.mjs";

const syntheticCase = JSON.parse(await readFile("evals/scratch/case.json", "utf8"));
const reading = JSON.parse(await readFile("evals/scratch/reading.json", "utf8"));
const report = await scoreReading(syntheticCase, reading);
console.log(JSON.stringify(report));
```

The inputs follow [synthetic-chart.schema.json](schema/synthetic-chart.schema.json)
and [reading.schema.json](schema/reading.schema.json). Supply invented birth
inputs only. The scorer validates both inputs and requires matching case ids.
It computes its own reference with [computeChartFacts](lib/chart-facts.mjs),
then checks its contract and factor inventory. There is no imported fact-list
argument, extractor, model call or automatic file output. A CLI is still planned.

The optional final argument accepts only `rubricId` and `rubricVersion`.
Omission selects `chart-reading-factual`, version `1.0.0`; explicit values must
select that same supported policy. The policy cannot be overridden in options.

Input values are captured before asynchronous computation. The report owns
deeply frozen snapshots, retaining reading text, quotes, claim order, provenance
and extraction metadata. Object key order is canonicalized; original JSON
whitespace and formatting are not retained. The scorer does not mutate caller
objects.

## Report and evidence links

A completed report has `status: "completed"` and `schemaVersion: "1.0.0"`.

| Field | Contents |
| --- | --- |
| `case`, `reading` | Captured synthetic case and complete original reading values. |
| `reference` | Full fact-adapter result, including factors, numerical rows, conventions, availability, flags and provenance. |
| `occurrences` | Claim order and links from each original claim to its scoring unit, if resolved. |
| `units` | Deduplicated resolved assertions with eligibility, verdict, evidence, contradiction links and coverage decision. |
| `contradictions` | Conflicting unit pairs, each with all applicable rubric rule ids. |
| `categories`, `overall` | Counts and metrics by factor kind and across the reading. |
| `diagnostics` | Status occurrences, resolved occurrences by category, unique and duplicate resolved counts, and unassigned occurrences. |
| `rubric`, `implementation`, `identity` | Policy and implementation identity plus input and reference digests. |
| `limits` | Unverified extraction coverage, unscored interpretation quality and non-exhaustive contradiction detection. |

For an occurrence, `reading.claims[occurrence.index]` holds its status, exact
quote and span. `claimId` identifies that claim. `unitId` links resolved
occurrences to `units[].id`; `duplicateOf` names the representative unit for a
duplicate and is otherwise `null`. A unit uses the first claim's id and retains
every occurrence's id in `claimIds`. Unresolved, abstained and interpretive
occurrences have no unit and remain `unassigned`.

For an assessed unit, `evidence.membership` is `present` or `absent`.
`referenceFactorIndex` indexes `report.reference.facts` for a present factor and
is `null` for absence. Each `evidence.rows` entry is a JSON Pointer relative to
`report.reference`, not to the report root. For example,
`/reference/houses` resolves to `report.reference.reference.houses`.
`evidence.domain` names the body or pair and applicable policy. Absence evidence
links the complete supported result that was inspected; it invents no positive
fact. House evidence includes the body position and computed cusps. Unassessed
units have `evidence: null` and preserve their eligibility reasons, convention
comparisons and house-availability reasons.

`unit.contradictionIds` links to `contradictions[].id`; each edge links back via
`unitIds`. `coverage` contains a `credited` boolean and a reason: `covered`,
`unassessed`, `incorrect`, `contradicted` or `negated`. Follow contradiction links
even when another coverage reason is reported.

## How to read the scores

Comparison uses exact categorical membership for placements, natal major
aspects, houses under the actual computed system, and classical sign dignities.
It introduces no numeric tolerance. Negation applies to the entire factor
tuple. Only unqualified reference-instant assertions with compatible explicit
conventions and available evidence receive `correct` or `incorrect` verdicts.
Other resolved assertions are `unassessed`; their reasons remain visible.

Duplicate factors with the same polarity, certainty and scope form a single
unit; aspect body order is irrelevant. Correct negations receive correctness
credit but cover no positive factor. Contradictions retain membership verdicts
and withhold coverage from every participant. Coverage always uses the full
available positive reference inventory, regardless of what the reading mentions.
Missing houses supply neither positive factors nor negative evidence. Requested
house systems are never substituted for the engine's actual fallback system.

Each metric records its numerator, denominator and unrounded value. Empty
denominators yield `null`. Overall metrics sum category counts before division.
Read correctness alongside coverage, contradiction rate, resolved assessment
rate and unresolved occurrences; an empty extraction is not a perfect reading.
The precise formulas, contradiction rules and worked arithmetic are in
[RUBRIC.md](RUBRIC.md). [scoring.checks.mjs](tests/scoring.checks.mjs) tests these
rules on original inline readings of synthetic charts, including duplicates,
negation, unavailable houses, convention conflicts and contradictions.

## Provenance, bounds and failures

`rubric.digest` hashes the exact rubric JSON file bytes. `implementation` names
the scorer and hashes its listed source, validation, adapter, loader, schema and
lockfile inputs. `identity.caseDigest`, `readingDigest` and `referenceDigest`
hash canonical JSON: sorted object keys, preserved array order and string
contents. Digests use SHA-256 with a `sha256:` prefix. They identify local bytes
and values; they do not authenticate an imported report or attest a released
engine archive.

`reference.provenance` retains the adapter, engine, ephemeris, computation bundle,
bundler and runtime identity. The complete reference also retains its time basis,
Delta T, coverage warning, fallback and availability. Restart the process after
changing engine or scorer sources. Repeatability checks apply to fresh processes
and working directories on the same runtime; they do not promise identical
numbers across runtimes or architectures.

Each input's canonical JSON is limited to 1 MiB. The shared data capture also
rejects cycles, non-finite numbers, malformed Unicode, accessors and non-JSON
objects, and imposes depth and node budgets. Schema limits apply after capture.
Ordinary data is expected; reflective operations on a same-process JavaScript
Proxy are not sandboxed. A report serialized as compact `JSON.stringify(report)`
plus a newline must fit within `SCORING_REPORT_BYTES`, also 1 MiB. A valid input
can exceed the report limit through its evidence or contradiction expansion;
the scorer refuses the whole report. Pretty printing can produce larger output.
Keep reports in ignored `reports/` and temporary inputs in ignored `scratch/`.

Failures throw `ScoringError` from [score-reading.mjs](lib/score-reading.mjs),
with a stable `code` and fixed diagnostic text, without numerical scores or
supplied reading text:

| Code | Cause |
| --- | --- |
| `invalid-options` | Options are not bounded ordinary JSON data with only supported option names. |
| `unsupported-rubric` | An explicit rubric id or version is unsupported. |
| `invalid-case` | Case capture or schema validation fails. |
| `invalid-reading` | Reading capture or schema/quote validation fails. |
| `case-mismatch` | Reading and synthetic case ids differ. |
| `reference-failed` | Local engine loading or computation fails, including an unevaluable instant. |
| `reference-contract` | The computed reference fails the adapter contract or capture checks. |
| `output-limit` | The complete compact report plus newline exceeds its byte limit. |

[scoring-boundary.checks.mjs](tests/scoring-boundary.checks.mjs) checks input and
output boundaries, snapshots, digests, refusal behavior and fresh-process
repeatability. The shared data restrictions are also exercised by
[generator.checks.mjs](tests/generator.checks.mjs). These are operational
tests, not accuracy evidence. Extraction coverage stays `unverified`: successful
scoring cannot establish that the claims faithfully represent the quotes or
exhaust the reading.
