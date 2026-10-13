# Performance regression gate

`scripts/benchmark-gate.mjs` compares independently collected compact Node
benchmark records. Each workload passes when its candidate median of run
medians does not exceed the baseline's by more than the configured percentage.
Any workload beyond the threshold fails the command; improvements elsewhere
do not offset a regression. It does not benchmark Workers, Deno, Bun or a
browser, and it does not establish astronomical accuracy or runtime parity.

The [benchmark guide](benchmarks.md) defines the synthetic workloads, units,
timed scope, capture procedure and baseline refresh policy. The gate uses that
existing runner and compactor. Historical evidence is preserved.

## Run in CI or locally

Use Node 22 with the edge dependencies installed. First select a reviewed
baseline captured on the intended CI host with the intended protocol. The
[initial development baseline](evidence/m9-node-baseline.json) identifies its
own shared host; it is not a portable speed target for a different runner.
Changing the host requires a separately reviewed baseline, not a bypass of
the comparison checks.

From the repository root, the following shell sequence captures a complete
candidate for the initial baseline and its default protocol. On a controlled
CI runner, substitute that runner's public label and reviewed baseline path.
Decide the threshold and capture count before measuring. Run this serially,
after other tests and builds have finished:

```sh
set -eu
mkdir -p edge/results
for run in 1 2 3; do
  node edge/scripts/benchmark.mjs --machine local-linux-x64 \
    > "edge/results/candidate-$run.json"
done
node edge/scripts/benchmark-baseline.mjs \
  edge/results/candidate-1.json edge/results/candidate-2.json \
  edge/results/candidate-3.json > edge/results/candidate.json
node edge/scripts/benchmark-gate.mjs \
  --baseline edge/docs/evidence/m9-node-baseline.json \
  --candidate edge/results/candidate.json \
  --threshold-percent 10 > edge/results/performance-gate.json
```

The default threshold is `10` percent, an explicit policy choice rather than
a measured noise bound. The option accepts plain decimal percentages from
`0` through `100`, with at most six fractional digits. A threshold of `0`
rejects any increase. Negative values, exponents, nonfinite values, duplicate
options and unknown options are refused. There is no environment override or
automatic baseline refresh. The threshold parser and boundary behavior are
enforced in [`benchmark-gate.check.mjs`](../tests/benchmark-gate.check.mjs).

`npm --prefix edge run benchmark:gate -- ...` also launches the gate, but use
`node` directly when redirecting JSON so npm's script banner is not captured.
All input paths must be regular files below `edge/`, without symlinks and
below the project file limit. The gate writes only to standard output and
standard error; keep captured reports in ignored `edge/results/`.

| Exit status | Meaning | Output |
| --- | --- | --- |
| `0` | Every workload is within the threshold. | JSON with `status: "pass"`. |
| `1` | At least one workload exceeds the threshold. | JSON with `status: "regression"`, including all workload comparisons. |
| `2` | Options, input files, evidence or comparability checks failed. | A diagnostic on standard error; no passing JSON. |

These exit statuses are exercised by the CLI tests in
[`benchmark-gate.check.mjs`](../tests/benchmark-gate.check.mjs). Keep both
failure statuses failing in CI. Run correctness and exact runtime smoke
checks as separate required steps: a passing performance gate does not
override a numerical mismatch. Keep the reviewed baseline and threshold
under code review, and preserve candidate files and the report as CI
artifacts even on failure. Final workflow wiring is tracked in M12; this
milestone adds no GitHub workflow.

## Comparable evidence

Both files must use `edge-benchmark-baseline/1`, the compact format produced
by the baseline command. The candidate is a new compact measurement set, not
a replacement for the committed baseline. The validator reconstructs every
raw run from its retained nanosecond samples, rechecks the run schema,
provenance, counts and checksums, and recomputes every run summary and the
aggregate. Missing, duplicated or reordered workloads, changed summaries,
invalid durations and incomplete sets fail before performance is judged.

The gate requires:

- The same independent run count and complete measurement protocol, including
  samples, warmup, workload order, iteration counts, clock and units.
- Identical concrete workload definitions and workload source digest.
- Identical recorded machine metadata, including the public label, OS/kernel,
  CPU, memory and available cgroup observations; identical Node, V8 and libuv
  versions and runtime options; and identical benchmark runner sources.
- The same build target, configuration, toolchain, engine version and
  ephemeris pin.
- The same exact smoke-result digest and consumed checksum for each workload.
  This checks the runner's observed outputs, not arbitrary inputs or every
  intermediate result.
- Distinct raw file digests and disjoint measurement intervals across both
  sets. Intervals must have positive duration; adjacent intervals may share
  an endpoint. A baseline reused as its own candidate is refused.

Source and bundle digests may change between baseline and candidate. That
allows implementation optimizations while keeping the measurement conditions
and observed results fixed. The report includes both build source identities,
executed workload bundle digests, measurement intervals and raw file digests,
plus hashes of the compact files read by the CLI. A changed runner, workload,
runtime or build configuration requires a fresh reviewed baseline under the
new conditions. There is no flag to ignore a mismatch.

The comparison decision derives the median of each run's retained integer
batch nanoseconds and the median across runs, preserving fractional medians with
integer arithmetic. Equal protocols give identical iteration counts, so that
common divisor cancels. The decimal threshold is compared by exact integer
cross multiplication. Exactly reaching the threshold passes; any excess
fails. Displayed milliseconds and percentage changes use ordinary binary64
arithmetic and do not decide the verdict. The tests include odd and even
medians and cases immediately above a threshold.

## Interpreting failures

A malformed or incompatible record is a refused comparison, not a regression
and not a pass. Fix the collection or choose the baseline for that exact
runner and protocol. Do not edit metadata to force compatibility. Review any
baseline refresh separately, preserve its previous evidence, and record the
reason and full capture rather than selecting faster runs.

A timing regression is a measurement on that host, not proof of a code
regression. Shared CPU time, frequency, JIT activity, garbage collection and
other tenants can move medians despite matching metadata. The gate applies
the chosen threshold without claiming a confidence interval or discarding
outliers. The initial baseline's observed variation remains visible in
[its validation record](evidence/m8-m9-validation.md).

Reports are trusted measurement inputs, not authenticated attestations. The
gate validates their internal consistency; it cannot prove when or where
they were executed, recover deleted raw bytes from a digest, establish a quiet
host, or prove a candidate describes the current checkout. CI must freshly
capture the candidate after a successful build from a quiescent checkout and
protect the reviewed baseline and collection scripts. The runner checks
source identities before and after its measurement.
