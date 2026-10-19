# Completed database interpolation agreement

P4 compares queries on the completed database with direct calls to the pinned
engine consumed by this project. [interpolate-full-output.json](interpolate-full-output.json)
contains the aggregate result from [interpolate-full.mjs](interpolate-full.mjs).
The database configuration covers the half-open span from 1800-01-01T00:00:00Z
to 2200-01-01T00:00:00Z at the default hourly sample cadence. This measures
consumer agreement, not independent astronomical accuracy or an error bound
at unmeasured instants.

The recorded run measures 4,000 interpolation instants distributed across the
whole configured span. It also measures a separate group of 95 boundary probes,
including 63 stored support instants that must match direct calls exactly.
The remaining 32 boundary probes use interpolation. Counts, plan digests and
manifest identity are checked by
[test/interpolate-full.node-test.mjs](../test/interpolate-full.node-test.mjs).
The full database stays ignored and is not needed by CI.

With the project Node runtime on PATH and locked dependencies installed, run
from the repository root:

```sh
node skydb/benchmarks/interpolate-full.mjs > skydb/generated/interpolate-full-output.json
```

After successful exit, copy the small JSON report to its committed evidence
path. The runner accepts no arguments, reads the retained completed full/
database and creates no tiles or checkpoints. Queries and engine comparisons
run sequentially in one process, with one decoded tile cached. The output
contains aggregate errors, maximum-error instants and sample-plan digests,
without individual position rows. The report records the command, runtime,
CPU model, operating system, engine archive pin and full configuration.

The main cohort has one seeded pseudorandom integer-millisecond instant in
each equal-duration stratum. Stratum endpoints are
`startMs + floor(spanMs * index / count)`, calculated with exact integer
arithmetic. Sampling uses the recorded xorshift32 recipe and seed; it is a
deterministic sampling plan, without a statistical confidence claim. The
runner retries any instant that coincides with a stored support sample,
including a clipped final support instant. Retry exhaustion fails the run.
The report states the retry limit and exact selection recipe. A SHA-256 of
the chronological instant array, serialized as compact JSON followed by a
newline, permits plan reproduction without committing individual samples.

Boundary probes cover the start, the final covered millisecond, the first
regular tile seam and every in-range pinned clock split. Around each seam
they query the preceding millisecond, the seam itself and the following
millisecond. The query library retains its existing half-open ownership and
separate interpolation support on either side of clock jumps. Duplicate probe
instants are removed. Boundary statistics are kept separate from the main
cohort so exact support matches do not alter its median or p99.

`results.random.errors` and `results.boundaries.errors` each contain entries
for every configured body. Each entry has these fields:

| field | measured absolute difference from the direct engine |
| --- | --- |
| `lon` | shortest circular longitude difference in degrees |
| `lat` | latitude difference in degrees |
| `speed` | difference of reported longitude speeds in degrees/day |

Each field records the count, `maximum.error`, `maximum.atMs`, `p99` and
`median`. The median averages the middle pair for an even count. The p99 is
the nearest-rank quantile, at sorted index `ceil(0.99 * count) - 1`. A tied
maximum retains its first instant in chronological order. Speed is compared
with the engine's reported finite-difference longitude speed; it is not the
derivative of the database's interpolated longitude. Units and quantile rules
are also recorded in the report.

The report's manifest bytes, SHA-256 and completed checkpoint match the prior
whole-database [verification report](verify-full-output.json). That run checked
the entire store; this measurement verifies only tiles accessed by its queries.
Manifest identity does not hash every tile or authenticate the data. The
runner rejects writer locks, incomplete stores, corrupt accessed tiles,
nonfinite or misaligned rows, and metadata changes during measurement. The
completed database must remain immutable on a trusted local filesystem.
Before/after checks do not defend against hostile concurrent modification.

The test suite checks stratum coverage and reproducibility, circular errors,
quantile definitions, maximum selection and invalid measurements. It exercises
the complete runner on a short synthetic-time store spanning a clock split,
independently reduces its errors and checks that database files remain
unchanged. It also rejects incomplete, locked and corrupt stores, and binds
the committed full-span report to the completed verification evidence.

The measured sample does not cover every longitude wrap, station, extreme
curvature or instant in the span. It establishes no worst-case interpolation
bound, independent ephemeris accuracy or event completeness. Boundary probes
are local consumer checks at the recorded instants. Elapsed time describes
this comparison run; full query performance remains a separate milestone.
