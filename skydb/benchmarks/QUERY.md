# Completed database query measurements

P5 measures position and event queries on the retained completed database.
[query-full-output.json](query-full-output.json) records the aggregate result
from [query-full.mjs](query-full.mjs), with the exact command, Node runtime,
CPU model, operating system, available parallelism, host memory, engine archive
pin, manifest identity and configuration. Measurements describe this local run;
they establish no latency or memory guarantee on another machine or workload.

The recorded run covers the default half-open span from
1800-01-01T00:00:00Z to 2200-01-01T00:00:00Z. It measures 512 cold position
lookups and 4,096 immediate warm lookups. The table below uses
`positionQueries` and `eventQueries` from that report; each latency is rounded
upward to the next thousandth of a millisecond. Event range medians use the
recorded 8 ranges per cohort. The full-span row is a single complete stream.

| operation | recorded median milliseconds, rounded upward |
| --- | ---: |
| Open before a position lookup | 0.441 |
| Cold position lookup | 0.886 |
| Warm position lookup | 0.008 |
| Unfiltered nominal day | 1.046 |
| Unfiltered nominal month | 28.068 |
| Unfiltered nominal year | 319.382 |
| Moon ingress nominal month | 22.667 |
| Mercury station nominal year | 230.888 |
| Whole-span event stream | 129439.161 |

The complete stream reads 146,099 tiles and returns 549,078 event records,
matching the prior verification count. The cache retains at most its
configured 4 decoded tiles. Across the whole benchmark, sampled maximum RSS
is 122,560,512 bytes and the process-lifetime RSS high-water mark is
122,937,344 bytes, with the measurement limits described below. These values
come from this report's `memory` fields and do not bound future runs.
The report and workload identity are checked by
[test/query-full.node-test.mjs](../test/query-full.node-test.mjs).

With the project Node runtime on PATH and locked dependencies installed, run
from the repository root without other database writers or benchmark work:

```sh
node skydb/benchmarks/query-full.mjs > skydb/generated/query-full-output.json
```

After successful exit, copy the small aggregate report to its committed evidence
path. The runner accepts no arguments and uses the retained completed full/
database. It creates no tiles, checkpoints or temporary databases. The output
contains timings, counts, result digests and a reproducible query plan, without
individual position or event records. Generated data remains ignored.

Position instants use the deterministic stratified interpolation sampler from
[INTERPOLATION.md](INTERPOLATION.md), with the seed, count and plan digests
recorded in the report. Each instant lies inside its equal-duration stratum
and excludes stored support samples. Each cold lookup opens a fresh database,
asserts an empty application cache, then times one position request. Opening
is timed separately. Warm lookups immediately repeat that same instant on
the same database; they retain the already verified decoded tile. Result
checks and digests require identical cold and warm results. They also check
the expected cache index after every request.

Cold refers to the application's decoded-tile cache. Filesystem caches are
uncontrolled, including effects of prior runs and opening the manifest and
checkpoint. Process startup and module loading are excluded from query times.
The runner does not flush caches or force garbage collection. Every scheduled
query enters the measurements, with no separate warmup phase.
Opening, cold lookup and warm lookup have separate latency distributions.
Position query timers exclude result checks, hashing and memory observations.

Event workloads include unfiltered nominal day, month and year ranges, Moon
ingress month ranges and Mercury station year ranges. Their exact durations,
filters, half-open endpoints and counts are in `workload.eventPlan`. The
nominal day is a fixed JavaScript millisecond duration, without calendar-month,
calendar-year, local-time or leap-second adjustment. Starts use the recorded
integer midpoint-of-strata formula over all permitted starts, spread across
the configured coverage. Short test stores clip requested durations to their
coverage; full-store measurements use the requested durations.

Every event range starts with a fresh empty application cache and consumes
the iterator completely. A separate `fullSpan` range streams the entire
coverage once. Ranges record aggregate returned-event counts, counts by kind,
overlapping tile counts and cache occupancy. Filters still load and verify
every overlapping tile, including its positions. Event timers include
iteration, ordering and filter checks, streaming SHA-256, counters and periodic
memory observations; they exclude opening. They are not raw storage-read
timings. No event array grows with coverage. All event measurements use fresh
application caches, without a warm event-query claim.

Latencies are milliseconds. Reports retain count, total, minimum, median,
p95, p99 and maximum. The median averages the middle pair for even counts;
the quantiles use nearest rank, `sorted[ceil(p * count) - 1]`. Small range
cohorts have coarse quantiles. Timing depends on host load, filesystem state,
runtime optimization and automatic garbage collection. The total wall and
process CPU measurements include diagnostics outside individual query timers.

Memory is reported in bytes. `process.memoryUsage()` records a baseline,
final values and maxima observed separately for RSS, heap, external memory
and array buffers. Observations occur after openings and position requests,
periodically while yielding events and after ranges, as specified by
`method.memory`. Those per-field maxima need not occur simultaneously and
can miss allocations between observations. The process-lifetime native RSS
high-water mark includes preflight and earlier phases of this same process;
it is not an isolated event-phase peak or an allocation bound. The runner
does not force garbage collection or subtract a baseline from that high-water
mark. Application cache occupancy is checked separately from process memory.

The report's manifest bytes, SHA-256 and completed checkpoint must match the
prior [verification evidence](verify-full-output.json). The complete event
scan must return the same event count as that structural verification. The
runner checks metadata before and after measurement, refuses writer locks
and incomplete stores, and fails on corrupt accessed tiles. The whole-span
scan reads every tile. These checks require an immutable trusted local store;
they do not defend against hostile concurrent filesystem mutation or prove
astronomical accuracy, interpolation bounds or event completeness.

[test/query-full.node-test.mjs](../test/query-full.node-test.mjs) checks workload
reproduction and coverage, cache behavior, quantile arithmetic, independent
event reductions, file preservation and failure cases on synthetic-time stores.
It binds the committed report to the existing completed verification evidence.
CI needs neither the retained full database nor a timing threshold.
