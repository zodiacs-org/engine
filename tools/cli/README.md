# Offline CLI preparation

Private `@zodiacs/cli@0.0.0` for review against the carried `@zodiacs/engine@1.0.0-rc.2` archive. It is not published, and `npx @zodiacs/cli` is not a promised registry installation yet. The engine implementation, version, public declarations and carried archives are unchanged. This preparation does not accept P3.7.

The executable is `zodiacs`. Commands are `chart`, `positions`, `events`, `verify` and `conformance`; formats are `text`, `json` and `svg`. Calculation requests use the engine's [calc vocabulary](https://github.com/zodiacs-org/engine/blob/7fa964d2a77d09dbb819b5733b36e303fc7fc513/docs/calc.md), with resolved ISO instants or Julian dates on an explicitly named scale. No civil-time inference is added.

```sh
# In a fresh review consumer, install the supplied, hash-verified engine archive
# and private CLI archive. Do not replace the candidate with npm's older latest.
npm install --ignore-scripts /absolute/path/zodiacs-engine-1.0.0-rc.2.tgz /absolute/path/zodiacs-cli-0.0.0.tgz

# A file contains the request; input values do not travel in shell arguments.
zodiacs chart --input synthetic-chart.json --format json > chart-result.json
zodiacs verify --input chart-result.json --format text
zodiacs conformance --format json > conformance-result.json
```

Synthetic chart request:

```json
{"time":"2000-01-01T12:00:00Z","place":{"latitude":40,"longitude":-75},"houseSystem":"whole"}
```

`positions` accepts one calc request or an array, for example `{"body":"Sun","time":"2000-01-01T12:00:00Z"}`. `events` accepts the carried engine's longitude-crossing request. Its evaluation budget is capped at 20,000 and defaults to that cap; refusal remains typed. Positions allow up to 128 requests, and input is limited to 1,048,576 bytes. These limits are enforced by the source and consumer checks. The original engine's frame, correction, zodiac, time conventions, estimated/measured bounds and limitations remain in receipts. Event scans do not gain a proven-complete verdict.

Inputs come from a local file or stdin (default). Calculation and verification commands perform no network requests. Installation can fetch dependencies; computation does not use a hosted API. Errors use fixed codes without echoing request values. JSON/text/SVG output contains calculated data and full receipts, including supplied instants and places, and can reveal a birth. SVG is an escaped text receipt with full JSON metadata, not a natal wheel.

`verify` accepts this CLI's successful JSON results for the same engine version. It replays the recorded requests and compares the complete result and receipt. This checks reproducibility, not origin, authenticity or independent astronomical accuracy. Unknown versions, refusals and modified results are rejected.

`conformance` runs the original read-only adapter over the committed suite's independent vectors. The build copies only named suite files, cited inputs and generators under `conformance/`, plus the suite licence; it never traverses the engine's evidence tree. Runtime checks bundle hashes and the original vector/source validation. Every result is judged with the original tolerances. Failed and unsupported cases remain visible and make the command exit 1. The suite generators are retained for provenance but are not executed by the CLI.

Exit codes: 0 for successful calculation/verification; 1 for typed calculation refusal, verification mismatch, or a conformance result with failures/unsupported/errors; 2 for invalid input, unsupported record, integrity or execution failure.

## Preregistered consumer verification

The workflow packs the private CLI and installs it with the unchanged, digest-verified carried engine archive in a fresh directory outside the checkout. It runs on Linux, macOS and Windows with Node 22.22.2 and Node 24. The actual results and package identities must be recorded before any passing or portability claim.

Checks cover direct installed-engine parity for all three calculation commands, receipt replay and tampering, three output formats, fixed errors without input values, file paths with spaces, input/position/event limits, typed refusals, unknown versions, an explicit network-denial control, and a tampered installed suite. The original adapter is run separately on the same installed engine/runtime and all conformance verdicts must agree. Node 22.22.2 additionally must match the committed baseline; other runtimes' differences from that pinned baseline are reported rather than erased. This is a CLI interoperability/regression gate, not acceptance of the engine's accuracy tolerances.

The complete original engine CI, conformance and atlas gates remain required before merge. No core packing or registry publication is performed. The package remains private, release approval and full affected private searches remain separate, and publication/first-name/provenance prerequisites are unresolved.
