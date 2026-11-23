# Submitting an engine

An adapter reads one UTF-8 JSON object per line on standard input and writes
one per line on standard output. Before reading, it writes a handshake with
the adapter name and version, engine name and version, and configuration. Each
request contains only `id`, `kind` and `input`. Answer in order with the same
ID. Use the engine's public functions, including its own coordinate
transformations. Return `output` for a supported quantity, `unsupported` with a
reason for a missing function, frame or input range, and `error` if a
calculation fails. The protocol, units and frame definitions are in [SPEC.md](SPEC.md).

## Run and verify

From the repository root on Node 22.22.2, this example installs the pinned
astronomia adapter, measures all 640 vectors and checks the saved verdicts.
For another engine, substitute its install command, adapter command and results
filename.

```sh
npm ci --prefix conformance/adapters/astronomia
adapter='node conformance/adapters/astronomia.mjs'
results=conformance/results/astronomia.json

node conformance/harness/validate.mjs --expect-total 640
node conformance/harness/run.mjs --adapter "$adapter" --out "$results"
node conformance/harness/run.mjs --adapter "$adapter" --check "$results"
node conformance/harness/report.mjs
node conformance/harness/report.mjs --check
```

Use `--values none` on the measurement command for verdicts and summary
statistics without per-vector residuals. Ensure any response metadata is
also suitable for redistribution.

## Submit a draft pull request

- Put the adapter source and pinned dependency manifest under `conformance/adapters/`.
- Include the generated `conformance/results/<name>.json` and both regenerated reports.
- In `conformance/results/<name>.notes.md`, state the exact engine version and
  licence, the data release or digest, the public functions used and any limits
  on coverage. Include the install and run commands in the submission.

Before listing an entry, maintainers review the calls and licences, install
the pinned release, rerun the adapter, check the vector digests and verdicts,
and regenerate the reports. Results are published as measured, pass or fail.
The report also shows unsupported inputs and calculation errors by kind.

To dispute a vector, cite its ID and suite version, the disputed value,
tolerance or arbiter, and independent evidence. Confirmed corrections receive
a new ID and the original is withdrawn. Use the form linked in
[DISCREPANCIES.md](DISCREPANCIES.md).
