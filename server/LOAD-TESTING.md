# Local HTTP load measurements

From the repository root, using the Node release range in
[package.json](package.json):

```sh
npm --prefix server ci
npm --prefix server run load
```

The harness rebuilds the server, launches its production executable on an
ephemeral loopback port and verifies readiness and each selected calculation.
It generates a pool of keys in memory and supplies them only to the child
environment and client headers. Each concurrent connection uses a distinct
key; the pool size equals the largest selected connection count and stays
configured throughout the matrix. It never loads operator key files or records
credentials.
The command owns its child server and stops it after the run or an interrupt.
It accepts no remote target or supplied birth data.

[scripts/load-support.mjs](scripts/load-support.mjs) defines the invented
workloads, option defaults and bounds. Each route uses its own repeated input,
including solar and lunar returns. The same process runs all trials in the
reported order. Each trial has a separate warmup; warmup observations are
retained separately and excluded from the measured result. Options can narrow
or extend a local run, for example:

```sh
npm --prefix server run load -- --routes natal,houses --connections 1,4 --warmup 2 --duration 10 --repetitions 2
```

`--routes` accepts the workload names in the source. `--connections` is a
comma-separated list of concurrent connections, each without pipelining.
`--warmup` and `--duration` use seconds; `--repetitions` repeats the matrix.
Invalid, repeated or unknown options fail before a server starts. Bounds and
metric accounting are tested in [test/load.vitest.ts](test/load.vitest.ts).
The harness runs independently of the usual test suite. Avoid running tests,
builds or other load generators concurrently with a recorded measurement.
After each warmup and measured phase, the harness awaits another calculation
on the same worker queue. This lets earlier-admitted work finish before the
next phase; these between-phase requests are excluded from the statistics.

Authentication, validation, engine calculations, scoped receipts and JSON
serialization all run through HTTP. The child keeps info-level JSON request
logging enabled; the harness continuously drains and discards its output.
This includes formatting and pipe costs, but excludes disk, network and log
collector costs. The calculation worker and resource limits use executable
defaults, recorded from its OpenAPI document. Per-key capacity and refill
are raised to the configuration maximum defined in `src/rate-limit.ts` so
the measurement can exercise calculations beyond the production default
allowance. This is a benchmark setting, not a deployment recommendation.
Using separate connection keys keeps a fast route from exhausting a shared
bucket. Per-key limits remain active, and any throttled response still fails
the run. The report records the key count and assignment alongside the limits.

Each completed body is parsed on the client and checked for engine identity,
receipt scopes and minimum receipt shape. The houses receipt must equal the
one in the result. These checks catch missing receipts and error bodies;
the route tests provide deeper receipt parsing, replay and engine parity.
Neither establishes independent astronomical accuracy.

Throughput means completed successful responses divided by the monotonic
elapsed seconds measured around the autocannon invocation through its
completion callback, including client setup and result aggregation. The report
retains that numerator and denominator as well as the requested duration and
autocannon's separate wall-clock duration, rounded to hundredths of a second.
This distinguishes wall-clock changes from delays that also affect the
monotonic clock. The harness computes
p50 and p95 directly from full-response timing events using Node's bounded HDR
histogram, in nanoseconds with three significant digits. It does not substitute
autocannon's displayed p97.5 for p95. These implementation details are checked
in `test/load.vitest.ts` and trace to
[autocannon's API and implementation](https://github.com/mcollina/autocannon/tree/v8.0.0).
Histogram values are approximate quantiles, not exact sorted observations.

The load is closed loop: each connection sends another request after receiving
its previous response. There is no fixed external arrival rate or correction
for coordinated omission. Latency covers completed HTTP responses, including
server queue wait and transfer, as observed by the client. Client body checking
can limit how quickly it sends more work. At the duration boundary autocannon
destroys in-flight requests; `unfinishedAtStop` records sent minus completed,
and those requests have no latency observation. Do not interpret the figures
as latency under an independently scheduled arrival stream.

Any non-200 response, timeout, transport error, body mismatch or disagreement
between response counts fails the run. Failed warmups also fail the run.
Interruptions, lost readiness, source changes during the run and unclean child
shutdown prevent a successful report. No latency or throughput threshold is
used as a test assertion: this shared machine is not a stable performance gate.

Generated context, reports and per-trial aggregate files go into a unique ignored
directory under `server/.cache/load/`. The command prints the final report
path only after verification and shutdown. Failed runs may leave aggregate
diagnostics and a context file explicitly marked as not a result, but have no
successful report. All output uses an explicit field
allowlist; raw autocannon options, HTTP bodies, headers and child logs are
never written. Each output file has a size bound enforced by the script.

For review, retain a small successful report under `server/docs/evidence/`.
It contains the command, runtime, machine and visible cgroup limits, complete
synthetic workloads, effective server configuration, source hashes, measured
bundle hashes and each trial's observations. The combined input digest hashes
the JSON array of sorted input paths and their SHA-256 digests. Hashes identify
the working-tree build actually measured; they do not imply that the files
already belonged to a commit. The harness rebuilds before hashing and checks
those files again after measurement. Re-run after a source or dependency
change rather than reusing a previous build's results.

The retained machine result is [docs/evidence/load-local.json](docs/evidence/load-local.json).

Earlier [rejected attempts](docs/evidence/load-rejected-attempts.json) are
retained separately. One stopped at a between-phase check following an extended
interval; that harness did not capture enough information to identify the
cause. Another exhausted the single shared key's bucket on the houses route.
The final harness records both monotonic and wall durations and uses distinct
connection keys. The rejected records keep their original wall-duration
semantics and are not accepted performance evidence.

The accepted result measures this checkout and this machine only. CPU and memory values can
describe a shared host; visible cgroup limits do not disclose hidden ancestor
limits or establish exclusive resources. Client and server compete for the
same machine. There is no TLS, reverse proxy, remote client or container in
this measurement. Repeated synthetic requests do not cover varied dates,
mixed traffic, long-running behavior, overload capacity or production sizing.
