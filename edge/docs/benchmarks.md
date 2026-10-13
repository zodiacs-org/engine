# Local computation benchmarks

The runner measures the existing synthetic workloads on Node. It builds the
Workers configuration in memory, then imports its self-contained
`workloads.mjs` bytes. The runtime is Node, not workerd. These measurements
describe repeated synchronous computation in one process, not Worker CPU
limits, deployment latency, browser responsiveness or astronomical accuracy.
Builds, imports, exact serialization and HTTP transport are outside timing.

From the repository root, with Node 22 on `PATH` and the edge dependencies
installed:

```sh
mkdir -p edge/results
node edge/scripts/benchmark.mjs --machine local-linux-x64 \
  > edge/results/benchmark-run.json
```

Use a public, nonsecret runner label for `--machine`. It distinguishes the
measurement host or CI runner class; it is not automatic hardware discovery.
Do not use a hostname, token or personal identifier. Invoke the script in a
fresh process for each run. Node CLI flags and `NODE_OPTIONS` are refused so
preloads, inspector sessions and flags are not silently mixed into a baseline.
The command fails on malformed options, a failed build or calculation,
nonrepeatable results or a source change during measurement. Failed commands
must not be used as evidence, even if shell redirection left an empty file.

## What a sample means

The unit is **milliseconds per complete workload invocation**. A batch times
repeated calls and divides its elapsed nanoseconds by the iteration count and
by the nanoseconds per millisecond. It does not divide by chart cases, house
systems, ephemeris samples or returned crossings.

| ID | Complete invocation |
| --- | --- |
| `chart` | `chartWorkload()`: every fixed input in `CHART_CASES`, including the polar fallback and unknown birth time. |
| `houses` | `housesWorkload()`: angles and house calculations for every `HOUSE_CASES` and `HOUSE_SYSTEMS` pair. |
| `transit-scan` | `transitScanWorkload()`: the complete Sun longitude scan in `TRANSIT_CASE`, including root refinement. |

Inputs are exported by [`src/workloads.ts`](../src/workloads.ts) and copied
into each report's workload definitions. No random or current-date input is
used. The benchmark consumers read body longitudes and speeds, aspect counts,
angles, cusps, crossing instants and sample counts, and accumulate a checksum
inside the timed loop. This consumption cost and the JavaScript loop are part
of the measurement. An empty chart or an incomplete or empty transit scan
fails validation.

[`benchmark-core.mjs`](../scripts/benchmark-core.mjs) fixes the batch sizes,
warmup and sample protocol. It runs workloads serially in the recorded order.
Warmup batches are separate from measured samples; every measured sample is
retained. `--samples` and `--warmup-batches` can change their counts within the
script's validated ranges. Such runs have a different protocol and must not
be combined with a default baseline. Batch iteration counts are fixed in the
protocol rather than calibrated differently on each host.

Before warmup, the runner validates and snapshots each full result. Outside
timing after every batch it checks the checksum and compares the final full
result with that snapshot, including signed zero and Date values. This is
not a full comparison of every intermediate result. Exact serialized smoke
results must also match before and after the complete benchmark. The report
records their digest; it is a repeatability check against this build's own
output. Runtime parity remains the separate smoke checks.

Samples include automatic garbage collection, JIT activity and scheduling
delays. No collection is forced, no empty-loop overhead is subtracted, and no
outlier is removed. The report includes the median, minimum, maximum,
nearest-rank percentile and median absolute deviation of milliseconds per
invocation. `tests/benchmark.check.mjs` verifies timing boundaries, output
checks, option validation and summary arithmetic without imposing a speed
requirement on arbitrary machines.

## Provenance and raw reports

Reports record Node and V8 versions, OS/kernel and architecture, CPU models,
logical and available CPU counts, total system memory and, when readable,
Linux cgroup v2 limits exposed at `/sys/fs/cgroup`. Missing cgroup observations
are null. These observations cannot prove a quiet or dedicated host, detect
every nested container limit, or account for CPU frequency and other tenants.
No environment dump, hostname, username or machine identifier is recorded.

The build manifest records the engine and ephemeris versions, pinned build
tool, configuration, input source digests and executed bundle digest. A
separate digest identifies the benchmark runner sources. The workload digest
identifies the fixture source, consumer source and concrete workload
definitions. Documentation or evidence edits do not change workload identity.
Build and runner sources are checked again after measurement to detect edits
during a run. Use a quiescent checkout; these are local provenance records,
not authenticated attestations.

Raw reports belong in ignored `edge/results/`. The runner writes JSON to
standard output only and enforces the project file limit. Capture logs there
too. Compact reviewed baseline evidence lives under `edge/docs/evidence/`.

The initial [Node baseline](evidence/m9-node-baseline.json) and
[validation record](evidence/m8-m9-validation.md) record the measured host,
protocol, scope and observed variation. Its shared-host measurements are a
starting reference; establish a controlled CI host before interpreting small
timing differences as regressions.

## Capturing a baseline

Decide the host, protocol and number of independent runs before collecting
evidence. Stop other benchmark and test processes, then execute every run in
a fresh Node process. For the initial baseline the complete capture is:

```sh
for run in 1 2 3; do
  node edge/scripts/benchmark.mjs --machine local-linux-x64 \
    > "edge/results/baseline-$run.json" || exit 1
done
node edge/scripts/benchmark-baseline.mjs \
  edge/results/baseline-1.json edge/results/baseline-2.json \
  edge/results/baseline-3.json > edge/results/baseline.json
```

The compactor verifies matching workload, protocol, exact-result, machine,
runtime, runner and build identities, checks the recorded summaries against
the samples and keeps every run. Its aggregate is the median of the run
medians, with the lowest and highest run medians shown alongside it. The
compact evidence retains sample durations so its arithmetic remains
recomputable after ignored raw files are removed. Raw file digests connect
the evidence to the local capture. `tests/benchmark-baseline.check.mjs`
checks that inconsistent or incomplete runs are refused.

Review the compact output and copy it to a new named evidence file. Never
refresh a baseline automatically because a candidate is slower. Preserve old
evidence, record the refresh reason, and repeat the complete predefined run
set after a host, runtime, workload or protocol change. Do not select only
the fastest run or treat these host-specific numbers as portable guarantees.
The [performance gate](performance-gate.md) compares a fresh compact candidate
with a reviewed baseline and fails on incompatible evidence or regressions.
Its guide gives the shell sequence and exit statuses. The [CI guide](ci.md)
describes runner provisioning, job order and report retention.
