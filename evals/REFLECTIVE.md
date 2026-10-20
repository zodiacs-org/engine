# Reflective-language assessment

The original MIT policy `chart-reading-reflective`, version `1.0.0`, defines a
separate `reflective-not-predictive` rubric dimension. Its normative patterns,
penalties and limits are in [reflective-v1.json](rubrics/reflective-v1.json).
[checkReflectiveLanguage](lib/check-reflective-language.mjs) implements that
policy as a synchronous, deterministic text check. This milestone provides the
library assessment; evaluation-report and CLI integration belong to P4 in
[the phase 2 plan](PHASE2.md).

The checker reads the entire unchanged text, independently of factual claims,
claim status, extraction coverage and chart conventions. Unsupported or omitted
claims therefore cannot hide wording from this check. It computes no chart,
extracts no factual claims, calls no backend and writes no files. The factual
rubric, its denominators and factual scorer remain separate.

## Use the library

From the repository root in a Node ES module:

```js
import { checkReflectiveLanguage } from "./evals/lib/check-reflective-language.mjs";

const assessment = checkReflectiveLanguage(
  "Consider what steady effort means to you."
);
console.log(assessment.status, assessment.score);
```

The optional second argument accepts only `rubricId` and `rubricVersion`, matching
the policy above. Omitting them selects that policy. Unknown options, non-data
options and unsupported selections are refused. Text must be a primitive,
well-formed Unicode string. There is no coercion, caller mutation or replacement
of unsupported inputs with an empty successful result.

## What the rules check

| Rule id | Trigger scope |
| --- | --- |
| `future-assertion` | Listed personal or named sky subjects with explicit future auxiliaries, contractions or going-to constructions. A bounded possessive subject is also recognized. |
| `hedged-outcome` | Listed personal subjects with possibility modals and listed outcome verbs. Reflection and exploration verbs are absent from the list. |
| `future-period-outcome` | Listed future periods directly described as delivering or promising outcomes. |
| `promised-outcome` | Destiny, certainty, guarantees or explicit divination constructions asserting listed outcomes. |
| `financial-language` | Listed financial terms or currency symbols, whether reflective, quoted or otherwise. |

Patterns are case insensitive and accept whitespace across soft wraps. ASCII
and curly apostrophes are recognized where the patterns specify contractions.
Unicode letter and number guards prevent matching terms inside larger word
tokens. No normalization, case rewriting or line-ending conversion changes the
stored text or offsets. The exact vocabulary is the committed regex policy;
the table describes its scope rather than promising general English coverage.

Quotations and negation receive no context exemption. This conservative choice
also flags some rejected-example discussion, disclaimers, historical passages
and procedural language. Financial terms are flagged even in reflective
language. Ordinary discussion of values, worth, free will and computed returns
has no corresponding trigger. Original passing and explicitly rejected inline
cases in [reflective.checks.mjs](tests/reflective.checks.mjs) enforce these rules.
Negative cases belong to tests, never to suggested interpretation examples.

## Evidence and points

Every raw rule match records an original text interval. Matches sort by start,
end and policy rule order. Strictly overlapping matches merge transitively into
one finding, retaining every applicable rule id in policy order. Its evidence
span is the union of those matches. Adjacent intervals remain separate, and
repeated wording at separate locations counts again.

A finding subtracts the largest penalty among its matching rules. Each current
rule assigns 25 points; the maximum score is 100 points. The raw penalty sums
finding penalties. The applied penalty is capped at 100, and remaining points
are 100 minus that applied penalty. Evidence and raw counts remain complete when
the score reaches zero. Adding unrelated prose cannot dilute a penalty. These
are authored policy points, with no calibration as probabilities or factual
correctness and no combination with factual scores.

The tests named "rejected-input overlaps merge transitively and preserve all
rules without multiplying penalties" and "rejected-input repetition counts each
location and caps points without discarding evidence" in
[reflective.checks.mjs](tests/reflective.checks.mjs) enforce the arithmetic on
their exact original inline inputs. No corpus performance figure is claimed.

The frozen, JSON-serializable assessment contains:

- `status`: `unassessed` for empty or whitespace-only text, `flagged` for findings,
  or `no-detected-violations` for other text.
- `score`: `points`, `maximum`, `rawPenaltyPoints` and `appliedPenaltyPoints`.
  Empty text has null points, with zero penalties, rather than positive credit.
- `counts`: raw `matches`, merged `findings` and raw match counts `byRule`.
- `findings`: stable local ids, applicable `ruleIds`, `penaltyPoints` and evidence
  `span` objects with `start`, `end` and the exact original `quote`.
- `input`: the raw UTF-8 text digest, UTF-16 length and Unicode code-point count.
  `offsetUnit: "utf16-code-unit"` means `text.slice(start, end) === quote`.
- `rubric`: id, version and digest of the exact policy JSON bytes, plus a separate
  `implementation` identity and digest of the checker and shared data helper.
- `limits` and `limitations`: the operational bounds and scope qualifications.

Evidence quotes are diagnostic records of rejected input. They are not reading
suggestions and must retain that context if displayed. The API returns no full
copy of the text beyond these evidence spans. Original text changes, including
normalization or line endings, change the input digest. These identities describe
local bytes, not a signed attestation or verified authorship.

## Bounds, errors and detection limits

The input allows 32,768 Unicode code points, matching the reading text contract.
There may be at most 512 raw rule matches before overlap merging. More matches
refuse the whole assessment, preserving no partial success. Compact JSON plus a
trailing newline must fit within 1,048,576 bytes. These bounds, empty handling,
Unicode evidence, immutable output and same-runtime repeatability across fresh
offline processes are enforced by
[reflective-boundary.checks.mjs](tests/reflective-boundary.checks.mjs). The tests
check defined inputs, not detection performance on arbitrary readings.

Failures throw `ReflectiveLanguageError` with fixed diagnostics and one of
`invalid-options`, `unsupported-rubric`, `invalid-text`, `input-limit`,
`match-limit` or `output-limit`. They return no partial points, evidence or raw
input in error messages. All checking remains bounded and offline.

A nonempty result with no findings means only that these patterns found no
prohibited wording. It does not certify reflective quality, intent, truth or
complete absence of prohibited content. Paraphrases, unlisted subjects and
verbs, passive outcomes, likelihood or expectation constructions, implications,
other languages, euphemisms, obfuscation and Unicode lookalikes can evade these
rules. False positives also remain possible because discourse is not understood.
The checker is a repeatable rubric dimension, not a semantic judge. Any change
to patterns, penalties, overlap behavior or limits requires a new policy version;
keep old policies available to interpret their assessments.
