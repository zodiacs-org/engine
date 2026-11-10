# Electional command line

Build and run from `electional/` on its declared Node runtime:

```sh
npm run build
node bin/electional.mjs help
node bin/electional.mjs presets
node bin/electional.mjs validate --rules examples/synthetic-hours.yaml
node bin/electional.mjs search --rules examples/synthetic-hours.yaml --controls examples/controls.json
```

`npm run cli -- ...` is also available. Invoke the executable with `node` when
stdout must contain only machine-readable output; npm can print script banners.
The workbench stays private and the parent package does not install this CLI.

The example uses an invented place and activity. Its required planetary-hour
rule selects every classical ruler; its optional Venus rule demonstrates facts
about a preference. It needs the local engine bridge, and can run without the
optional events build. It is an executable transport example, with no claim
that selecting an hour predicts an outcome.

## Rule files and preset generation

`validate` and `search` take one complete rule file. The extension selects JSON
or YAML: `.json`, `.yaml` and `.yml`, case-insensitively. `--format json` or
`--format yaml` explicitly selects the parser, including for another extension.
Both formats use the existing [strict schema and loader](RULES.md), including
duplicate-key rejection, resolved clocks and synthetic natal declarations.
Validation reports a valid schema without calculating a chart or loading events.

The `preset` command generates a complete JSON document for editing. It requires
the range, place, house system and fixed solar-day offset explicitly:

```sh
node bin/electional.mjs preset launch \
  --start 2000-01-02T06:00:00Z --end 2000-01-02T07:00:00Z \
  --latitude 0 --longitude 0 --house-system whole --utc-offset-minutes 0 \
  > generated/launch.json
node bin/electional.mjs validate --rules generated/launch.json
node bin/electional.mjs search --rules generated/launch.json --controls examples/controls.json
```

`contract-signing` and `travel` use the same context arguments. The dates and
place above are synthetic inputs exercised by the built CLI check. Preset
generation performs no astronomical computation. [PRESETS.md](PRESETS.md)
lists the exact authored choices and their interpretation. Searching these
packs needs the existing events capability for their required rules. Its
absence produces a refusal with rule audits, rather than passing windows.
There is no implicit pack selection from an activity label or preset merge.

Arguments are strict: unknown options, positional extras, duplicates, missing
values and `--key=value` syntax are rejected. Coordinates and the offset use
plain signed decimal notation, in degrees and minutes respectively. Local
wall times must be resolved before constructing a request. A fixed hour offset
does not follow daylight-saving changes.

## Explicit work controls

`search` requires a separate JSON controls file. The executable example in
[examples/controls.json](examples/controls.json) supplies every required field.
It is a starting configuration for this example, not a guarantee of complete
astronomical event discovery across other rules or ranges.

| Field | Meaning |
| --- | --- |
| `stepMs` | Milliseconds between delegated coarse scan samples. |
| `lookaheadMs` | Milliseconds of Moon-not-void lookahead beyond each chunk. |
| `maxEvaluations` | Shared native request allowance across all rules and chunks. |
| `maxSkySamples` | Shared sky sample allowance, separate from request counts. |
| `chunkMs` | Maximum requested UTC duration per emitted chunk. |
| `maxChunks` | Maximum chunks before refusing an unattempted suffix. |
| `maxChunkEvaluations` | Per-chunk native request allowance, capped by remaining shared work. |
| `maxChunkSkySamples` | Per-chunk sky sample allowance, capped by the shared remainder. |
| `maxFrameBytes` | Inclusive UTF-8 JSON size allowance for a chunk, before its newline. |
| `eclipse` | Optional explicit spherical `model` radii in au and `derivativeStepMs`; required when an eclipse rule is present. |

The numeric controls must be safe integers with positive allowances; lookahead
may be zero. Eclipse model validation is described in [AVOIDANCE.md](AVOIDANCE.md).
No eclipse radius model, timeout, signal or scoring option is inferred or
accepted through arbitrary extra fields. Controls JSON rejects duplicate keys
at every level. [STREAMING.md](STREAMING.md) explains inherited scan assumptions,
padding, output-size refusals and seam continuation.

Files must be regular local files and fit the shared `RULE_LIMITS.documentBytes`
allowance before decoding. Reads remain bounded if the file grows. UTF-8
decoding rejects invalid byte sequences and accepts an initial UTF-8 byte-order
mark. The CLI reads files only; it does not accept stdin, fetch URLs or write
result files. Use shell redirection into a gitignored directory for local data.

## Output and exit status

Search writes one JSON object per line, using the library's `chunk` and `end`
frames unchanged. Chunks contain chronological constant-state window fragments,
per-rule explanations, known eligibility, exclusions, unknown coverage,
source audits and engine receipts. Required failures and unknowns remain visible
as condition windows. Receipt scope and clocks remain explicit.
Fragment IDs connect touching states across chunk seams. Public output carries
no scores, contributions or ranks. Declared preference weights remain visible
inside their rule definitions, as submitted configuration facts.

The end frame states whether the entire range was complete, unresolved or
refused and preserves any unemitted suffix. Earlier chunks are provisional
until it arrives. An input, source or output exception leaves no successful end
frame; diagnostics go to stderr as a bounded JSON error code without submitted
values, filesystem paths or stack traces. Rule-specific search refusals remain
in stdout's full source audits. Schema errors use the generic code
`invalid-rule-set`; the library loader additionally exposes validation issues
for applications that need field diagnostics.

| Exit code | Meaning |
| --- | --- |
| `0` | Complete search, valid document, generated preset, catalog or help. An empty required-check intersection retains its failed condition windows. |
| `1` | Invalid arguments/input, filesystem/runtime failure or broken output transport. |
| `2` | All chunks were emitted but some rule coverage remains unresolved. |
| `3` | A source or work/output allowance refused the search. |
| `130` | Cancellation, including SIGINT. |
| `143` | SIGTERM in the executable. |

Writes provide backpressure before the next chunk is pulled. SIGINT and SIGTERM
request cancellation at the next available native checkpoint or chunk boundary.
The existing synchronous source call cannot be interrupted mid-call. These
controls bound declared work and emitted chunk size, not elapsed time or heap.
A broken pipe ends work with an error rather than draining more chunks.

## Verification

[test/cli.electional-check.ts](test/cli.electional-check.ts) transports the
independently hand-derived [composition sets](test/fixtures/composition-windows.json)
through the actual CLI coordinator and stream on that fixture's declared UTC
integer domain. It checks JSON/YAML equivalence, facts-only output, receipt
preservation, cancellation, backpressure, budgets, failure status and strict
input controls. [test/cli-files.electional-check.ts](test/cli-files.electional-check.ts)
checks regular-file, byte and UTF-8 boundaries. Preset tests enforce their
authored choices and immutable validated documents; they are convention tests,
not accuracy evidence.

After a local build, `node scripts/check-cli-esm.mjs` runs the real executable,
round-trips generated packs, checks the native hour example's receipts and
all-ruler eligibility, and checks process signals and broken pipes. It does not
pin engine-produced reference instants. The records are
[docs/evidence/m12-tests.json](docs/evidence/m12-tests.json) and
[docs/evidence/m12-cli-esm.json](docs/evidence/m12-cli-esm.json), generated by the
committed recording scripts. Existing independent ephemeris comparisons remain
in [references/README.md](references/README.md).
