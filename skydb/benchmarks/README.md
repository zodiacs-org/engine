# Measurements

Run from the repository root with the project Node runtime and dependencies
installed by the setup script:

```sh
node skydb/benchmarks/agreement.mjs > skydb/benchmarks/agreement-output.json
node skydb/benchmarks/performance.mjs > skydb/benchmarks/performance-output.json
npm --prefix skydb test
```

The agreement and performance scripts accept no arguments. They create fresh
databases below ignored `skydb/generated/`, and remove their temporary
directories even when a measurement fails. They do not modify the sample or
generate the full database.
The JSON outputs record the runtime, CPU, platform, engine archive identity,
configuration and measurement method. Output is small enough to commit.

The agreement script compares every decoded support sample with a direct engine
call, failing on any difference. It measures interpolated positions at interior
fractions of each support interval in fixed short synthetic calendar windows
across the target centuries, around each pinned clock discontinuity, and at the
coverage end. Longitude errors use the shortest circular difference. Per-body
maxima include their measured instants and units. Read the window configurations
in [agreement-output.json](agreement-output.json) for the exact measured spans.
This is agreement with the consumed engine, not independent astronomical
accuracy, a completeness test for events, or an interpolation bound elsewhere.

The performance script times fresh generation, verified resume, verification,
opening, position queries, direct engine sampling and a streaming event query
on its recorded configuration. The first query pass starts with an empty
application cache; filesystem caches are uncontrolled. The warm pass reuses
decoded tiles. Calls are sequential; engine loading is excluded from timings.
There is no timed warmup, repetition distribution, peak-memory measurement or
full-dataset projection. The recorded storage total includes receipts, manifest
and checkpoint as well as compressed data. Timing varies with machine load.
Read [performance-output.json](performance-output.json) for the workload and
actual measurements; comparisons apply only to that run.

[test/benchmarks.node-test.mjs](../test/benchmarks.node-test.mjs) checks report scope,
identity and finite values, plus maximum selection. The agreement script itself
enforces decoded sample equality when measurements are regenerated. Report tests
do not assert stable timings or turn sampled errors into accuracy guarantees.

The phase 2 generation trial has a separate retained workload and report in
[TRIAL.md](TRIAL.md). It measures the default position and event generation
pipeline over a longer slice and includes resource cost arithmetic for full
coverage. Its cost estimates are separate from the scoped query timings above.

Completed full-database verification and its manifest and storage summary are
recorded in [VERIFY.md](VERIFY.md). That report measures structural integrity;
full-span interpolation and query benchmarks remain separate milestones.
