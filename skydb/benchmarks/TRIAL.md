# Fresh generation trial

This trial exercises the existing position, event, compression and persistence
pipeline using the default bodies, cadence, tile duration and UTC input basis.
Only the coverage is shortened. The exact half-open span, configuration,
machine, runtime and engine archive identity are in
[trial-output.json](trial-output.json). It measures computing resources, not
astronomical accuracy, interpolation agreement or event completeness.

The recorded run covers 1970-01-01T00:00:00Z inclusive to
1980-01-01T00:00:00Z exclusive. The values below come directly from the
report's `results` fields, measured with its pinned engine archive on the
recorded Linux machine and Node runtime.

| Measured quantity | Value |
| --- | ---: |
| Published tiles | 3,652 |
| Generation wall time | 256,807.871374 ms |
| User CPU time | 240,531.364 ms |
| System CPU time | 5,723.565 ms |
| File lengths | 24,172,800 bytes |
| Allocated storage including directories | 74,895,360 bytes |
| Process peak resident memory | 117,370,880 bytes |

The report's `fullSpanEstimate` uses the default half-open coverage from
1800-01-01T00:00:00Z to 2200-01-01T00:00:00Z. These are arithmetic estimates
from the trial, not measurements of a generated full database.

| Full-span arithmetic | Value |
| --- | ---: |
| Planned tiles | 146,099 |
| Wall time estimate | 10,273,650.930961125 ms |
| File-length estimate | 967,037,763 bytes |
| Allocated storage estimate | 2,996,204,053 bytes |
| Allocation with retained trial, previous contents and reserve | 3,078,685,429 bytes |

The coexistence estimate fits the configured disk cap. Its wall time calls for
generation across bounded sessions with the existing checkpoints. At the end
of P1, full generation had not started. It is now complete as recorded in
[FULL.md](FULL.md); the measured completed database storage in
[VERIFY.md](VERIFY.md) is separate from this trial's arithmetic.

With the project Node runtime on PATH and the locked dependencies installed,
run from the repository root:

```sh
node skydb/benchmarks/trial.mjs > skydb/benchmarks/trial-output.json
npm --prefix skydb test
node skydb/scripts/check-project.mjs
```

The script accepts no arguments. Every invocation creates a fresh trial
directory under ignored generated/ and retains it for inspection; the report
records its relative path. A completed previous trial is never mistaken for
fresh generation. Run it by itself, without other writers under generated/.
An error leaves recoverable data and emits no completed JSON report. It does
not replace the sample, resume an older trial or start full generation.

Wall time and process CPU time cover sequential generation, compression,
file flushes, checkpoint updates, disk checks and progress callbacks. Engine
loading and the final storage walk are excluded. CPU user and system values
are milliseconds; utilization is CPU time divided by wall time, expressed as
a percentage of one core. Filesystem caching and host load are uncontrolled.
Peak resident memory is the process lifetime high-water mark, including engine
loading; it is not isolated generation memory. No workers are spawned.

Storage bytes sum file lengths, including receipts, manifest and checkpoint.
Allocated bytes also include file and directory blocks reported by the local
filesystem. The disk policy and reserves are defined in
[trial-support.mjs](trial-support.mjs). The preflight walks all generated/
contents, including other datasets and staging, and refuses symbolic links.
Between tiles, incremental allocation accounting and free-space checks leave
room for the next bounded tile and metadata replacements. The reserve also
covers metadata absent from the running tile sum. These checks assume no
concurrent writers. If a disk guard stops a run, record the reason and measured
usage in [PHASE2.md](../PHASE2.md) before continuing.

The full-span arithmetic multiplies each measured cost by the full planner's
tile count divided by the measured trial's tile count. Planner counts include
extra splits at pinned clock discontinuities. Storage totals round upward;
fixed metadata is also multiplied, which slightly overcounts it. The
coexistence estimate includes the retained trial, previous generated contents
and the next-tile reserve. Existing parent-directory growth is covered by the
reserve rather than included in the reconstructed sum. The report also records
the actual final generated/ usage.

This arithmetic assumes comparable event density, compression, hardware and
load across the target span. It is neither a measured full run nor a cost
upper bound. Resuming adds verification of every already published tile;
verification and query workloads need separate measurements. Full generation
must use bounded sessions and monitor actual storage growth rather than rely
on this estimate alone.

[test/trial.node-test.mjs](../test/trial.node-test.mjs) checks workload scope,
report identity, projection arithmetic and units, disk limits, allocation
accounting, fresh generation and interrupted-run behavior. It uses short
synthetic-time windows in CI and validates the committed aggregate report;
CI does not regenerate the decade trial or assert stable timings.
The project runs test suites sequentially so whole-generated/ storage walks do
not race another suite creating or removing its temporary database.
