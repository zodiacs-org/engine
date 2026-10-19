# Measurements

The full database has been generated and verified locally under ignored
`skydb/generated/full/`. Its measured half-open coverage is
1800-01-01T00:00:00Z to 2200-01-01T00:00:00Z, with the default hourly
position cadence and nominal daily tiles. The reports bind these completed
measurements to the same pinned engine and configuration. Generated tiles
are not committed or required by CI.

| evidence | measured scope and report |
| --- | --- |
| [Generation trial](TRIAL.md) | Fresh shortened run, wall time, CPU, storage and full-span cost arithmetic in [trial-output.json](trial-output.json). The arithmetic remains an estimate. |
| [Full generation](FULL.md) | Bounded resumable runs, checkpoint progression and wall, CPU and storage observations in [full-sessions/](full-sessions/), with completion in [session-0036.json](full-sessions/session-0036.json). |
| [Verification](VERIFY.md) | Complete traversal, manifest identity, engine pin, configuration and storage in [verify-full-output.json](verify-full-output.json). |
| [Interpolation agreement](INTERPOLATION.md) | Deterministic stratified random samples and separate boundary probes, with per-body maximum, p99 and median differences in [interpolate-full-output.json](interpolate-full-output.json). |
| [Query performance](QUERY.md) | Cold and warm position lookups, event ranges, a whole-span event stream and observed memory in [query-full-output.json](query-full-output.json). |

The verification script records 146,099 tiles, 3,652,427 stored support
instants and 549,078 stored event records. Shared support endpoints count in
each tile. Its report measures 968,174,614 file bytes and 2,997,882,880
allocated bytes under full/, including metadata, receipts and directory
allocation. These values come from `verification.summary` and `storage`
in the verification report. Allocation depends on the filesystem. Whole
generated/ allocation and the disk policy are recorded separately in the
generation reports.

The interpolation comparison uses 4,000 interpolation instants spread across
the whole span, with 95 boundary probes measured separately. The
[per-body longitude table](INTERPOLATION.md) summarizes that main cohort;
the JSON also retains latitude and reported-speed errors and maximum-error
instants. This is agreement with the consumed engine, without a worst-case
bound, statistical confidence claim or independent astronomical accuracy.
Structural verification and record counts do not prove event completeness.

The query report's cold and warm position medians are 0.886 ms and 0.008 ms;
the unfiltered nominal-month and nominal-year event medians are 28.068 ms and
319.382 ms. These latencies are rounded upward to the next thousandth of a
millisecond from `positionQueries` and `eventQueries`. Position opening is
timed separately. Cold means an empty application cache; filesystem caches,
host load and garbage collection are uncontrolled. Event queries consume
their iterators completely, including checks, hashing and counters. The
report's `memory.sampledMaximum.rss` is 122,560,512 bytes; sampled maxima can
miss allocations between observations. The separate process-lifetime RSS
high-water mark includes earlier work in that process. Read QUERY.md for
exact cohorts, filters, units and resource scope before comparing runs.
These local results establish no latency or memory guarantee.

For reproduction, install the locked dependencies with the setup script and
use the project Node runtime on PATH. Run from the repository root, one
command at a time with no database writer:

```sh
node skydb/benchmarks/verify-full.mjs > skydb/generated/verify-full-output.json
node skydb/benchmarks/interpolate-full.mjs > skydb/generated/interpolate-full-output.json
node skydb/benchmarks/query-full.mjs > skydb/generated/query-full-output.json
```

These runners take no arguments, require the retained completed database
and leave its files unchanged. They record the exact command, runtime,
machine, engine archive pin and manifest identity. Inspect the new reports
before replacing committed evidence. A fresh checkout must first generate
the database with the guarded runner in FULL.md. The query runner checks the
committed verification identity. Tests bind both committed query and
interpolation reports to that identity. CI uses short synthetic-time stores
to check methods, failures and committed report
bindings; it does not regenerate the full database or assert stable timings.

Generation resource reports include repeated verification of the retained
prefix on resume. The directory-limit interruption and migration are
documented in [LAYOUT.md](LAYOUT.md). The session reports do not establish a
single uninterrupted full-generation duration. Keep their observed resource
use separate from the trial's arithmetic estimate.

## Small-window regression measurements

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

These short-window reports support regression checks alongside the completed
full-database evidence above. Their timings and errors apply to their own
recorded configurations and must not be presented as full-database results.
