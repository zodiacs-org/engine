# M8 and M9 validation

Repository base: `f3e7be1`, plus this session's changes under `edge/`.
The benchmark runner, consumer definitions and summary calculation are
committed in `scripts/benchmark.mjs`, `scripts/benchmark-workloads.mjs` and
`scripts/benchmark-core.mjs`. The baseline compactor is
`scripts/benchmark-baseline.mjs`. See the [benchmark guide](../benchmarks.md)
for the protocol, timed scope and baseline refresh policy.

The [initial Node baseline](m9-node-baseline.json) retains every sample
duration, every run median and the aggregate median of those medians. Its
provenance identifies the executed build and runner, rather than assuming the
repository base identifies uncommitted work. Raw runs and test logs remain in
ignored `edge/results/`. Earlier milestone evidence is unchanged.

## Measured scope

Only Node executes these performance measurements. The build uses the
Workers configuration and measures its bundled synthetic workloads; it does
not measure a deployed Worker or local workerd. The report names the Node,
V8, OS, CPU and build versions. Its public machine label is `local-linux-x64`.
The host is a shared development environment, without dedicated CPU, fixed
frequency or scheduling guarantees. Readable cgroup observations are in the
report; null fields mean unavailable observations.

Each chart invocation computes the fixed `CHART_CASES`, each houses
invocation computes the `HOUSE_CASES` and `HOUSE_SYSTEMS` combinations, and
each transit-scan invocation performs `TRANSIT_CASE`, the Sun longitude scan
from `2000-03-01T00:00:00Z` to `2000-04-01T00:00:00Z`. These exact definitions
and their inputs are retained in the baseline. Reported milliseconds are per
whole workload invocation, not per chart, house system or sampled instant.
Checksums consume outputs inside timing. Exact comparisons, serialization,
build and import costs are excluded. No astronomical accuracy comparison is
part of this work.

The capture used all three predetermined default-protocol runs, each in a
fresh Node process, serially after tests finished. No run or sample was
discarded. The short development run used different sample/warmup counts to
check execution and is not baseline evidence. The retained minimum/maximum
run medians and individual samples show observed variation; no confidence
interval or universal performance guarantee is claimed.

The exact aggregate values from `m9-node-baseline.json`, in milliseconds per
workload invocation, are:

| Workload | Median of run medians | Lowest run median | Highest run median |
| --- | ---: | ---: | ---: |
| `chart` | 2.3742640625 | 2.344192 | 4.0719620625 |
| `houses` | 0.0809991640625 | 0.06985416796875 | 0.1051117109375 |
| `transit-scan` | 0.40549190625 | 0.4045151875 | 0.442375375 |

Chart and houses run medians varied substantially on this host. This capture
does not isolate why they varied. Keep that variation visible when choosing
a future CI environment and threshold; a small regression threshold on this
shared development host can fail because of noise. No faster-only recapture
replaced these runs. `tests/benchmark-evidence.check.mjs` recomputes the
committed baseline from its retained samples and validates its identities.

## Commands

Commands ran from the repository root with the existing edge-local runtime:

```sh
export PATH="$PWD/edge/.cache/runtime/node_modules/.bin:$PATH"
npm --prefix edge run typecheck
node --test edge/tests/benchmark*.check.mjs \
  > edge/results/m8-m9-benchmark-tests.tap 2>&1
EDGE_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm --prefix edge test \
  > edge/results/m8-m9-tests.tap 2>&1
npm --prefix edge run check:isolation
npm_config_cache="$PWD/edge/.cache/npm" npm run package:contents
```

Type checking and edge tests passed. The isolation check passed file-size,
documentation and root packing-list exclusion checks. The root
package-content check failed with `packed package is missing dist/calc.d.ts`:
root build output is absent. It was not created for this project. This
limitation remains separate from the passing edge exclusion check.

The final full edge test invocation, with Chrome enabled, reported:

```text
1..148
# tests 148
# suites 0
# pass 148
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

The benchmark-only invocation reported:

```text
1..34
# tests 34
# suites 0
# pass 34
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Tests cover warmup exclusion, monotonic timing boundaries, consumed results,
mutable result detection, strict CLI options, invalid and sparse durations,
summary arithmetic, malformed provenance, noncomparable runs, duplicate raw
measurements, file containment and the committed evidence. The real CLI smoke
uses reduced counts only to verify execution and reporting, not to provide
performance evidence. Existing runtime tests retain their prior scope; a
passing test of a mismatch detector does not mean every runtime matches Node.
`git diff --check` passed. Every source digest retained in the baseline's
runner and build records was also checked against its current file after
capture and matched.

The capture and compaction commands are:

```sh
for run in 1 2 3; do
  node edge/scripts/benchmark.mjs --machine local-linux-x64 \
    > "edge/results/baseline-$run.json" || exit 1
done
node edge/scripts/benchmark-baseline.mjs \
  edge/results/baseline-1.json edge/results/baseline-2.json \
  edge/results/baseline-3.json > edge/results/baseline.json
```

After reviewing the compact output, it was copied to
`edge/docs/evidence/m9-node-baseline.json`. The compactor validates the
recorded samples and summaries and rejects incomparable runs; it does not
judge a performance regression. That gate remains M10.

## Repository scope

All edits are under `edge/`. Engine source, root package metadata and lockfile,
root build output and immutable archives are unchanged. Root engine,
conformance and archive-rebuild gates were not run. No archive was packed,
no release or workflow was run, and no git metadata was changed. The harness
owns commits and PR updates. The performance gate, measured WASM experiment
and final CI wiring remain later milestones.
