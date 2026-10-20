# Adversarial workflow checks

These checks exercise failures across the generation and reading-evaluation
workflows. They use original inline assertions and invented chart inputs.
No model service, credentials, downloaded prose or committed generated corpus
is needed. Engine-derived expectations measure consistency with the local
engine; they do not establish independent astronomical accuracy.

From the repository root, with Node.js 22 and the eval dependencies installed:

```sh
node --test evals/tests/generation-adversarial.checks.mjs evals/tests/adversarial-e2e.checks.mjs
npm --prefix evals test
```

The focused files complement the existing backend, generator, extraction,
scoring and file-boundary tests. The complete suite includes those tests and
the package-exclusion and project-isolation checks.

## Generation

[generation-adversarial.checks.mjs](tests/generation-adversarial.checks.mjs)
composes a registered offline adapter with the interpretation generator.

| Input or event | Behavior checked |
| --- | --- |
| A valid draft followed by concatenated JSON, trailing instructions or unknown metadata | The run rejects, dispatch stops, inputs remain unchanged and no partial dataset or manifest is returned. |
| A valid draft followed by refusal, truncation or a malformed transport envelope | A syntactically complete meaning cannot override the completion status. |
| Instructions embedded in source or model prose | Explicit backend selection and pipeline-owned factor, provenance and license fields remain intact. Generated prose stays unreviewed. |
| Multibyte summaries and legal trailing JSON whitespace | Transport limits count the returned UTF-8 bytes; meaning limits count Unicode code points. Neither layer silently trims to fit. |
| Cancellation after an accepted draft, then a late response | The cancelled run returns no result, and a separate run contains only its own drafts and invocation records. |

These tests check separation of structured fields, not resistance of a model
to prompt injection. Schema-valid prose can still contain false, inappropriate
or hostile instructions. The tests deliberately preserve such prose and its
unreviewed status; validation does not substitute for content review.

## Reading evaluation

[adversarial-e2e.checks.mjs](tests/adversarial-e2e.checks.mjs) starts the actual
evaluation CLI with extraction enabled, loads the saved report and checks its
summary, digests, quote spans, evidence links and explicit score denominators.

| Reading or chart condition | Behavior checked |
| --- | --- |
| Engine-matching prose mixed with invented bodies, signs, aspects, houses or dignities | Supported claims can be assessed while unsupported assertions keep their quotes, unresolved status and occurrence diagnostics. |
| Unknown birth time with instant-specific, whole-day and opposing house assertions | Instant-specific facts remain eligible, while unavailable houses and whole-day assertions gain no assessment, coverage or contradiction credit. |
| Polar fallback and conflicting declared or clause conventions | Requested and actual house systems stay visible; engine-matching factors do not bypass convention eligibility. |
| Repeated affirmative and negative claims in each supported category | Duplicates retain their occurrences without extra factual credit; contradiction edges withhold positive coverage. |
| Claim and Unicode quote limits | The allowed boundary is preserved, excess input rejects as a whole, and an earlier saved report remains unchanged. |
| Compact valid prose whose contradiction evidence exceeds report capacity | Extraction succeeds, evaluation refuses the expanded report, and the CLI returns no success summary or truncated score. |

CLI processes run with guards against common Node network APIs. These are
regression guards, not a sandbox for arbitrary adapter or same-process code.
Temporary inputs and reports stay in ignored project directories and are
removed after testing.

Correctness is calculated over assessed resolved claims. A reading containing
invented factors can still have a perfect correctness ratio for its remaining
assessed claims. The unresolved occurrences, coverage and extraction limits
must remain visible alongside that ratio. The tests enforce those fields;
they do not measure extraction recall, general discourse understanding, model
quality, personality truth or predictive validity.
