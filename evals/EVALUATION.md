# Offline reading evaluation

The evaluation command compares a supplied reading extraction with facts computed
by the local engine, optionally extracts claims from an unannotated reading, or
creates a deterministic mock reading to exercise the workflow. It evaluates one
synthetic case per run and saves a machine-readable report under ignored
`reports/`. The [factual rubric](RUBRIC.md) and
[scorer](SCORING.md) define the judgments and their denominators.

Every mode also checks the entire unchanged reading text with the versioned
[reflective-language policy](REFLECTIVE.md). This assessment has its own points,
evidence and detection limits; it is separate from factual scoring.

Factual scores measure agreement with the local engine under recorded conventions.
They do not establish independent astronomical accuracy, faithful or complete
claim extraction, interpretation quality, personality truth or predictive
validity. A mock reading renders the reference factors themselves; its scores
are workflow checks, not a measurement of an LLM's performance.

## Run a mock evaluation

Use Node.js with the eval-local dependencies installed as described in
[README.md](README.md). From the repository root, create an invented input in
the ignored scratch directory:

```sh
mkdir -p evals/scratch
cat > evals/scratch/case.json <<'JSON'
{
  "schemaVersion": "1.0.0",
  "id": "synthetic-evaluation-example",
  "synthetic": true,
  "birth": {
    "utc": "2003-05-17T08:13:00Z",
    "latitude": 35,
    "longitude": 12
  }
}
JSON
node evals/bin/evaluate-reading.mjs evals/scratch/case.json
```

This input follows [synthetic-chart.schema.json](schema/synthetic-chart.schema.json).
It is invented and describes no person. The example's date and coordinates are
also exercised by the [chart adapter tests](tests/chart-facts.checks.mjs).

Omitting the reading selects the offline mock. An explicit `--mock` selects the
same mode:

```sh
node evals/bin/evaluate-reading.mjs evals/scratch/case.json --mock
npm --prefix evals run evaluate -- scratch/case.json --mock
node evals/bin/evaluate-reading.mjs --help
```

Paths supplied to the command are relative to the current working directory.
The npm command runs from `evals/`, so its example uses `scratch/case.json`.
Reports are always written under this project's `reports/` directory regardless
of the current working directory. Computation uses the eval-local engine loader,
which writes temporary bundles only under ignored `.cache/`; no root engine
build, network request, model backend or API key is needed.

## Evaluate a supplied reading

Save a reading that follows [reading.schema.json](schema/reading.schema.json)
under ignored `scratch/`, then run:

```sh
node evals/bin/evaluate-reading.mjs evals/scratch/case.json --reading evals/scratch/reading.json
```

The supplied reading must name the synthetic case's id and contain its original
text, quoted claims, declared conventions, licensing and provenance. Claim spans
must exactly match the text. The reading validator checks this contract; the
scorer preserves the complete reading in its report. A reading can contain
incorrect, conflicting, ambiguous or unsupported assertions. These are scoring
inputs, not grounds for discarding a structurally valid reading.

Without `--extract`, supplied claims are preserved exactly, including an empty
list. A missing reading file does not select the mock.

For an actual model reading, preserve its exact returned text. Use generated
provenance with the real `backend`, `model`, `promptVersion`, `inputDigest` and
`reviewStatus: "unreviewed"`. The digest must identify the recorded invocation
input using a documented encoding; do not invent it or substitute a digest of
the reading. Keep the non-secret invocation record under ignored `scratch/`.
If required provenance was not captured, obtain it before creating the envelope.
Only attach the schema's MIT label to original prose you have the right to
license that way. Metadata validation does not establish those rights.

Declare the conventions actually supplied to or stated by the reading. Use
`unspecified` when they are unknown; copying the engine's conventions onto an
unrelated reading would hide disagreement. The generator backend in
[BACKENDS.md](BACKENDS.md) creates factor meanings; this CLI makes no LLM call
to obtain readings.

## Extract claims from supplied prose

To opt into the conservative offline parser, provide a reading envelope with
`extraction.method: "none"` and an empty `claims` list, then run:

```sh
node evals/bin/evaluate-reading.mjs evals/scratch/case.json --reading evals/scratch/reading.json --extract
```

The reading still requires its synthetic case id, original text, declared
conventions, provenance and license. Extraction preserves those fields and adds
quoted claims with parser metadata. It rejects an already annotated reading
rather than replacing its claims. The scorer receives the extracted reading
and computes its own complete local reference; the parser has no reference facts
and cannot fill omitted assertions from the chart.

Extraction recognizes a bounded grammar of explicit assertions. Unsupported
wording and ambiguous context remain unresolved. It does not establish that
every factual assertion was found or that every extraction is faithful. Read the
extraction diagnostics and limits with the scores; both the parser and scorer
continue to label extraction coverage `unverified`. The grammar, quote spans,
paragraph handling and refusal limits are described in
[EXTRACTION.md](EXTRACTION.md).

The command accepts a case path followed by either `--reading` and a reading
path with optional trailing `--extract`, or `--mock`. The modes cannot be
combined. Extraction requires a supplied reading and cannot run on the mock.
Additional, repeated, reordered or unknown options are rejected. `--help` is
accepted by itself.

For a complete example, first create the invented case above. Then run this
from the repository root to save original inline demonstration prose with its
metadata. The opposing assertions intentionally exercise contradiction handling;
they are not a captured model benchmark:

```sh
node --input-type=module <<'JS'
import { writeFile } from "node:fs/promises";
const reading = {
  schemaVersion: "1.0.0",
  id: "supplied-prose-example",
  caseId: "synthetic-evaluation-example",
  synthetic: true,
  language: "en",
  text: [
    "At the supplied instant, Sun is in Aries.",
    "At the supplied instant, Sun is not in Aries.",
    "This symbol invites reflection on how you begin a task."
  ].join("\n\n"),
  offsetUnit: "utf16-code-unit",
  conventions: {
    zodiac: "tropical", houseSystem: "whole",
    aspectPolicy: "natal-major-defaults", dignitySystem: "classical-sign"
  },
  provenance: {
    kind: "authored",
    authors: ["OpenAI Codex (AI assistant)"],
    note: "Original inline documentation example composed with AI assistance; no human review is asserted."
  },
  extraction: {
    method: "none", producer: "documentation-example",
    version: "example-v1", coverage: "unverified"
  },
  claims: [],
  license: {
    spdxId: "MIT",
    attribution: "Original documentation prose with AI-assisted authoring by OpenAI Codex."
  }
};
await writeFile("evals/scratch/reading.json", JSON.stringify(reading, null, 2), { flag: "wx" });
JS
node evals/bin/validate-reading.mjs evals/scratch/reading.json
node evals/bin/evaluate-reading.mjs evals/scratch/case.json --reading evals/scratch/reading.json --extract > evals/scratch/evaluation-summary.json
```

The setup refuses to replace an existing `reading.json`. Rerun just the
validation and evaluation commands with saved inputs to check repeatability.
The summary file is an ignored local convenience; the complete report uses the
writer's content-addressed path and no-overwrite rules.

The parser requires an explicit supported time prefix for reference-instant
assessment. Bare `Sun is in Aries` has `temporalScope: "unspecified"` and remains
unassessed even when the chart's time is known. Do not add a prefix to an existing
LLM reading to improve its score. If you annotate claims manually, retain the
exact original text and quote context, record the actual extraction method, and
justify its scope without consulting the expected chart result. Inspect the
unresolved reflection sentence as well: the parser cannot establish that unknown
wording is purely interpretive. Its coverage remains unverified.

These example forms and their limitations are exercised by
[extraction.checks.mjs](tests/extraction.checks.mjs),
[extraction-evaluation.checks.mjs](tests/extraction-evaluation.checks.mjs) and
[scoring.checks.mjs](tests/scoring.checks.mjs).

## Inspect a saved report

After the preceding command, open the path returned in the JSON summary from
the repository root. This prints the overall and category metrics alongside
each original quote and its eligibility, verdict and evidence:

```sh
node --input-type=module <<'JS'
import { readFile } from "node:fs/promises";
const summary = JSON.parse(await readFile("evals/scratch/evaluation-summary.json", "utf8"));
const { workflow, score, reflective } = JSON.parse(await readFile(summary.report, "utf8"));
const units = new Map(score.units.map((unit) => [unit.id, unit]));
console.log(JSON.stringify({
  mode: workflow.mode,
  extraction: workflow.extraction,
  reflective,
  overall: score.overall,
  categories: score.categories,
  diagnostics: score.diagnostics,
  claims: score.occurrences.map((occurrence) => {
    const claim = score.reading.claims[occurrence.index];
    const unit = units.get(occurrence.unitId);
    return {
      id: claim.id, status: claim.status, quote: claim.span.quote,
      unresolvedReason: claim.reason ?? null,
      eligibility: unit?.eligibility ?? null,
      verdict: unit?.verdict ?? null,
      evidence: unit?.evidence ?? null,
      coverage: unit?.coverage ?? null,
      contradictionIds: unit?.contradictionIds ?? []
    };
  }),
  contradictions: score.contradictions,
  limits: score.limits
}, null, 2));
JS
```

Read eligibility before judging an unassessed claim. Check the declared and
reference conventions, temporal scope and house availability reasons. Follow
evidence pointers relative to `score.reference`, as [SCORING.md](SCORING.md#report-and-evidence-links)
describes. A membership verdict can stay correct while a contradictory assertion
withholds its coverage credit. Unresolved prose has no scoring unit and earns no
factual credit. Neither an undefined metric (`null`) nor a successful CLI exit
means that the reading is correct.

The separate `reflective` assessment checks all text, including unresolved or
unquoted passages. Its finding spans address `score.reading.text`, and its
`input.textDigest` identifies those exact UTF-8 text bytes. Treat finding quotes
as rejected-input diagnostics. No detected violations means only that the policy
patterns found none; it does not certify reflective or interpretive quality.
Read the policy limitations alongside its points. Those points never change
factual verdicts, counts, denominators or `interpretiveQuality: "not-scored"`.

When comparing model readings, keep the synthetic cases, rubric, conventions
and extraction procedure fixed and record all attempted runs, including failures.
Review extraction against the original text independently of chart membership.
The CLI produces a report per case, without a batch leaderboard or pass threshold.
If you aggregate elsewhere, sum each metric's counts before dividing, preserve
the refusal count, and retain category results and unresolved occurrences. The
[rubric](RUBRIC.md#counts-rates-and-coverage) defines these denominators; averaging
the reported per-reading rates can change their meaning.

## Reports and exit status

On success, standard output contains a compact JSON summary:

| Field | Meaning |
| --- | --- |
| `report` | Repository-relative path `evals/reports/<hash>.json`. |
| `reused` | Whether an existing report had exactly the expected bytes. |
| `digest` | SHA-256 identity of the persisted report bytes. |
| `mode` | `mock` or `supplied`. |
| `extraction` | Full parser identity, diagnostic counts and limits when `--extract` ran; otherwise `null`. |
| `overall`, `diagnostics`, `limits` | The scorer's totals, occurrence diagnostics and limits. |
| `reflective` | Language assessment with policy, implementation and input identities, status, points, counts and limits. Contains every assessment field except `findings`; rejected-input quotes stay in the saved report. |

The report is a complete envelope with `schemaVersion`, `status`, `workflow`
and separate `score` and `reflective` fields. `status` is `completed`. The `score`
field retains the full scorer result: the captured case and reading, freshly
computed reference, original occurrences, deduplicated scoring units, evidence
links, contradictions, category
totals, overall metrics and provenance. See [SCORING.md](SCORING.md) for the
meaning of those fields. Evidence pointers remain relative to `score.reference`.
The `reflective` field retains the complete unchanged
[language assessment](REFLECTIVE.md), including evidence findings and limitations.

`workflow` records id `offline-reading-evaluation`, version `1.1.0` and implementation
digest, the selected `mode`, mock metadata when applicable, and the parser report
in `extraction` when requested. Supplied mode has `mock: null`; evaluations
without extraction have `extraction: null`. The workflow digest includes the
extractor, reflective checker, language policy and local schema dependencies.
The workflow version and report fields are enforced by
[evaluation-cli.checks.mjs](tests/evaluation-cli.checks.mjs).
These identities describe local implementation bytes and input values; they do
not authenticate an imported report or identify a signed release.
Results include no wall-clock timestamp or temporary path. Repeatability checks
cover fresh processes and working directories on the same runtime, not
bitwise agreement across runtimes or architectures.

Scores retain their separate numerators and denominators. An undefined rate is
`null`. Read correctness together with coverage, contradiction rate, resolved
assessment rate and unresolved occurrences. An empty claim list does not earn
perfect correctness. A completed evaluation can find false claims or withhold
assessment because facts are unavailable or conventions differ.

| Exit status | Meaning |
| --- | --- |
| `0` | Evaluation completed and its report was saved or reused; also successful help. Incorrect claims can appear in a completed evaluation. |
| `1` | Input validation, extraction, language assessment, engine computation or scoring failed, or the complete report exceeded its output limit. |
| `2` | Usage, input-file reading or report persistence failed. |

Failures print fixed diagnostic text without echoing supplied paths, reading
text or raw exceptions. No partial score is reported as a successful result.
Detected language findings still produce a completed evaluation and exit zero.
The CLI has no combined score or pass threshold. Empty or whitespace-only text
has null language points, retaining the checker's `unassessed` status.
[evaluation-cli.checks.mjs](tests/evaluation-cli.checks.mjs) exercises command
selection, summaries, exit behavior and input preservation.

Input files must be regular UTF-8 JSON files within the input byte limit;
symlinks and nonregular files are refused. The complete report is canonical JSON
with a trailing newline and must fit within 1 MiB. Each input file is also
bounded to 1 MiB. The shared canonical-data capture also imposes depth and node
budgets, so being within the byte limit alone does not guarantee acceptance.
The bounds are operational limits, enforced by
[evaluation-files.checks.mjs](tests/evaluation-files.checks.mjs) and
[evaluation.checks.mjs](tests/evaluation.checks.mjs), not model token budgets.
An otherwise valid reading can produce too much evidence or too many
contradictions to fit a report; that evaluation is refused as a whole.

Output names are content-addressed. Identical bytes reuse an existing report;
conflicting content is refused without overwriting it. Output publication checks
directories and files, rejects symlinks, and publishes complete bounded files.
It does not sandbox another process that concurrently replaces directories.
Keep all generated reports ignored rather than adding them to the authored seed
set. The persistence tests cover reuse, conflicts, refusal and staging cleanup.

## Library and mock provenance

The library entry is `evaluateReading` in
[lib/evaluate-reading.mjs](lib/evaluate-reading.mjs):

```js
import { evaluateReading } from "./evals/lib/evaluate-reading.mjs";

const mockEvaluation = await evaluateReading(syntheticCase);
const suppliedEvaluation = await evaluateReading(syntheticCase, { reading });
const extractedEvaluation = await evaluateReading(syntheticCase, { reading: unannotatedReading, extract: true });
```

The optional object accepts only `reading`, `extract`, `rubricId` and
`rubricVersion`.
Omitting `reading` selects the mock; explicitly supplying `undefined` or `null`
is invalid. `extract` must be a boolean when supplied; `true` requires a supplied
unannotated reading, and `false` is the default behavior. Extraction contract or
budget failures produce the fixed `EvaluationError` code `extraction-failed`,
without echoing text or raw parser errors. Rubric selection follows the scorer's
supported factual id and version. The reflective policy is always the default
version documented in [REFLECTIVE.md](REFLECTIVE.md); it cannot be disabled or
overridden through these factual rubric options. Language checker failures,
including excess raw matches, produce fixed `EvaluationError` code
`reflective-failed` without raw exceptions or partial output.
The library captures and validates inputs and returns an immutable envelope. It
does not save a report by itself. A caller cannot provide reference facts or
override scoring policy.

Mock construction calls `computeChartFacts` and renders affirmative,
unqualified assertions scoped to the supplied reference instant. The reading
declares the actual computed house system after any polar fallback, or
`unspecified` when houses are unavailable. Missing houses produce no resolved
house assertions; the reading records an explicit abstention with the reference's
availability reasons. The scorer then computes its own complete reference through
`scoreReading`, preserving its trust boundary rather than accepting the mock's
fact list as evidence.

Mock metadata uses id `engine-fact-reading-mock` and records the input and
reference digests. The generated reading records backend `mock-reading`, model
`offline-fact-renderer-v1`, prompt version `mock-reading-v1` and
`reviewStatus: "unreviewed"`. Extraction uses method `parser`, producer
`mock-reading-renderer`, version `mock-reading-v1` and coverage `unverified`.
These labels describe deterministic template construction, not an LLM call or a
general prose parser. The meaning-generation backend is a separate workflow.

[evaluation.checks.mjs](tests/evaluation.checks.mjs) checks the orchestration,
mock provenance, supplied reading preservation, availability and convention
handling, reproducible identity and refusal behavior. These are local engine
consistency tests, not independent accuracy or interpretation-quality evidence.

[extraction-evaluation.checks.mjs](tests/extraction-evaluation.checks.mjs) checks
the opt-in parser integration, metadata preservation, unresolved and omitted
assertions, convention and availability limits, and CLI reports.

[reflective-evaluation.checks.mjs](tests/reflective-evaluation.checks.mjs) checks
language assessments across supplied, extracted and mock readings, exact text
identity and evidence, preserved factual scores, empty text, bounded refusals
and saved reports with summaries that omit rejected-input quotes.
