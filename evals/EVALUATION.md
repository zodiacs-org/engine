# Offline reading evaluation

The evaluation command compares a supplied reading extraction with facts computed
by the local engine, or creates a deterministic mock reading to exercise the
workflow. It evaluates one synthetic case per run and saves a machine-readable
report under ignored `reports/`. The [factual rubric](RUBRIC.md) and
[scorer](SCORING.md) define the judgments and their denominators.

The scores measure agreement with the local engine under recorded conventions.
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

The command accepts a case path followed by either `--reading` and a reading
path, or `--mock`. The two modes cannot be combined. It rejects additional or
unknown options. `--help` is accepted by itself. There is no prose extraction in
this command: supplied readings already contain claims, whose extraction
coverage remains `unverified`. A missing reading file does not select the mock.

## Reports and exit status

On success, standard output contains a compact JSON summary:

| Field | Meaning |
| --- | --- |
| `report` | Repository-relative path `evals/reports/<hash>.json`. |
| `reused` | Whether an existing report had exactly the expected bytes. |
| `digest` | SHA-256 identity of the persisted report bytes. |
| `mode` | `mock` or `supplied`. |
| `overall`, `diagnostics`, `limits` | The scorer's totals, occurrence diagnostics and limits. |

The report is a complete envelope with `schemaVersion`, `status`, `workflow`
and `score`. `status` is `completed`. The `score` field retains the full scorer
result: the captured case and reading, freshly computed reference, original
occurrences, deduplicated scoring units, evidence links, contradictions, category
totals, overall metrics and provenance. See [SCORING.md](SCORING.md) for the
meaning of those fields. Evidence pointers remain relative to `score.reference`.

`workflow` records id `offline-reading-evaluation`, its version and implementation
digest, the selected `mode` and mock metadata when applicable. Supplied mode has
`mock: null`. These identities describe local implementation bytes and input
values; they do not authenticate an imported report or identify a signed release.
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
| `1` | Input validation, engine computation or scoring failed, or the complete report exceeded its output limit. |
| `2` | Usage, input-file reading or report persistence failed. |

Failures print fixed diagnostic text without echoing supplied paths, reading
text or raw exceptions. No partial score is reported as a successful result.
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
```

The optional object accepts only `reading`, `rubricId` and `rubricVersion`.
Omitting `reading` selects the mock; explicitly supplying `undefined` or `null`
is invalid. Rubric selection follows the scorer's supported id and version.
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
