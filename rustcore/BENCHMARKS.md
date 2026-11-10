# Numeric core benchmarks

The [committed baseline table](docs/evidence/benchmark-baseline.md) and
[full-precision summary](docs/evidence/benchmark-baseline.json) measure the
native Rust API and the TypeScript wrapper over WASM against the checked-out
TypeScript engine. These are synthetic workload timings on the recorded
machine, not accuracy evidence or a performance guarantee for other workloads.
In this run, WASM had lower Node medians for complete positions and configured
aspects, while most smaller house/time helpers had higher medians. The table
retains both outcomes. The comparison uses no external ephemeris.

## Reproduce

After the [workspace setup](README.md#setup-and-checks), run from `rustcore/`
with Node 22:

```sh
npm run bench:smoke
npm run bench
npm run bench:check
```

`bench:smoke` builds WASM and executes every Node workload, including the fresh
process path, with short samples. Its output is not accepted as a baseline.
The native smoke command, using the same local environment as `scripts/run.mjs`,
is `cargo bench --locked -p zodiacs-rustcore --bench numeric -- --test`.

`bench` builds the native benchmark executable, runs Criterion, rebuilds WASM,
bundles the Node harness with the pinned esbuild, then runs the Node comparison.
The suites run sequentially. Keep other CPU-heavy tasks stopped during the run.
`bench:native` and `bench:node` run each independently. All build, raw sample and
report outputs stay in ignored `target/`, `pkg/` and `generated/` directories.
No root build or package archive is created.

The combined command writes `generated/benchmark-report.json` and
`generated/benchmark-table.md`. Review both, then copy them to
`docs/evidence/benchmark-baseline.json` and
`docs/evidence/benchmark-baseline.md` when intentionally refreshing the committed
baseline. `bench:check` verifies its complete workload coverage, finite ordered
statistics, table derivation and source hashes; it does not rerun timings or
claim that a different machine will reproduce those timings. Raw Criterion
bootstrap data and Node samples remain ignored. Failed measurement commands
remove their previous summary before starting.

The report binds the source snapshot to SHA-256 digests for the reference
TypeScript, the Rust core, wrapper, benchmark code, scripts and dependency locks.
It also records the native executable, WASM, generated glue and bundled Node
harness digests, compiler description, Node/V8 versions and machine description.
The scripts reject changed sources during measurement, overlapping native/Node runs,
different corpus descriptors, missing workloads and smoke-sized measurements.
Custom `NODE_OPTIONS` or Rust compiler flags must be unset. These checks identify
the measured local files; they are not an attestation of an untrusted machine.

## Inputs and timing boundaries

[numeric.rs](crates/core/benches/numeric.rs) and
[node.ts](benchmarks/node.ts) define the corpus. Their `--describe` and
`describe` output is compared when combining a report, including dates, house
inputs, aspect rows and normalized policies. The committed summary retains
those descriptors. No random or personal birth data is used.

| Workload | One API call and corpus |
| --- | --- |
| `positions/warm` | One complete `positions` result, including all bodies and longitude speeds. A sweep visits January 1 at midnight UTC in 1800 through 2200 at intervals of 50 years. Every touched Pluto integration segment is populated before measurement. |
| `positions/cold` | The same position sweep, starting with an empty Pluto cache in a fresh Rust thread or Node process. The timer runs inside that worker. Thread/process startup, imports, WASM compilation/initialization and worker teardown are excluded. Node includes V8's first-use compilation of calculation paths. |
| `houses/<system>` | One `computeHouses` call. Every supported system runs over the Cartesian product of the date indices and latitudes -80, -66.5, -45, 0, 45, 66.5 and 80 degrees. Sidereal hours are `index * 2.75`, east longitude is `index * 37 - 148` degrees and obliquity is 23.4393 degrees. These are synthetic geometry inputs, not astronomical angles of those dates. Angles are calculated before timing. Polar fallback cases are included in the corresponding system's average. |
| `aspects/legacy` | One `findAspects` call on a fabricated chart. Longitude is `(bodyIndex * 31.25 + chartIndex * (bodyIndex + 1) / 8) % 360` degrees, and speed is `((bodyIndex % 5) - 2) / 4 + chartIndex / 1024` degrees/day. Chart indices follow the date corpus. |
| `aspects/configured_default` | One configured matching call on the same rows, using the engine's default policy. |
| `aspects/configured_all` | All named major and minor angles, each with an orb of 2 degrees. |
| `aspects/configured_custom` | A custom angle of 17.25 degrees with orb 1.5 degrees, then square with orb 3 degrees, selecting all supplied body names including nodes. |
| `time/utc` | One UTC `timeBasis` call for each corpus instant, with no Delta T pin. |
| `frame/ecliptic_of_date` | One rotation of `(1 + index / 16, -0.5, 0.25)` at each instant's TT. Epochs vary every call so the reference's single-frame cache does not reduce this to cached lookup. |

One timed iteration is a complete corpus sweep. The report divides its duration
by the number of API calls, not by returned bodies, cusp counts or aspect pairs.
The tests in [benchmark-report.check.mjs](scripts/benchmark-report.check.mjs)
enforce that normalization and full workload coverage. Policy creation, date
construction and input allocation are outside the timers. Returned values are
consumed with Rust `black_box` or a finite JavaScript checksum, whose reduction
is inside the Node timing. Allocation and result destruction remain part of the
native iterations; JS garbage collection may happen inside Node samples.

The Node comparison times both public function calls, including their validation,
WASM crossings, data copying, object allocation and configured-result freezing.
It does not benchmark an artificial bulk binding that removes per-call costs.
The Rust API uses native structs and `Result` values. Native timings use a
different harness and consumption method, so the report gives a TS/WASM ratio
only between the two Node paths, not between native and Node.

## Sampling and interpretation

Criterion is pinned to 0.5.1 as a development dependency. The native target uses
the workspace's optimized bench profile with release LTO and one codegen unit.
Each workload has a one-second warmup, a two-second measurement target and
30 samples. Criterion may extend measurement to finish the required samples.
The summary reports its mean and median estimates, standard errors and 95%
bootstrap confidence intervals, converted from sweep time to time per call.

The warmed Node workloads use a 100 ms warmup per implementation, then calibrate
a batch toward 25 ms and collect 30 batches. The runtime order alternates within
each sample pair. Cold positions instead use 30 fresh processes per runtime,
alternating their order, and one corpus sweep per process. No empty-loop cost is
subtracted and no outlier is removed from the Node results. Node summaries retain
minimum, quartiles, median, 95th percentile, maximum, mean and sample standard
deviation. The table's Node ratio is TypeScript median divided by WASM median;
it is not an estimate with a confidence interval. Display rounding is separate
from the full-precision evidence.

The baseline was measured with Node 22.23.3 and Rust 1.85.1 on Linux x64, with
the CPU reported as Intel Xeon, in a shared managed container. The JSON records the
reported CPU, architecture, OS, available processors, memory and cgroup limits.
CPU frequency, affinity, host contention and thermal state were not controlled.
Warmup is a procedure, not proof that either JIT has reached a steady state.
Broadly spaced date sweeps, a mixture of polar fallbacks and fixed aspect policies
do not model every application's cache locality or result size. First-use
positions exclude loading costs; browser startup and WASM download/compilation
are outside this suite. Treat small timing differences as noise and rerun on the
deployment machine before making a performance decision.

Run `npm test` to establish numerical compatibility separately. Its acceptance
rules and known rounding deviations are in [PARITY.md](PARITY.md); this benchmark
does not weaken them or substitute performance for parity.
