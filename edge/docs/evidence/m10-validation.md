# M10 validation

Repository base: `65e0592`, plus this session's changes under `edge/`.
The performance gate is `scripts/benchmark-gate.mjs`; compact record
validation is in `scripts/benchmark-baseline.mjs`. The
[usage guide](../performance-gate.md) documents its comparison conditions,
threshold arithmetic, CLI and limits. M10 changes no timed benchmark code,
workload definition, engine source or preexisting baseline evidence.

The gate reconstructs every compact run, checks its samples and summaries,
and compares the complete workload set. Compatible captures must agree on
the protocol, host, runtime, runner, build conditions and observed outputs.
Implementation source and bundle identities can differ. The verdict uses
retained integer nanoseconds and the configured decimal percentage, with no
rounding tolerance. A regression fails independently for each workload.

## Validation commands

The checks use the existing edge-local Node runtime. Commands run from the
repository root; generated logs and raw measurements remain ignored under
`edge/results/`.

```sh
export PATH="$PWD/edge/.cache/runtime/node_modules/.bin:$PATH"
npm --prefix edge run typecheck
node --test edge/tests/benchmark*.check.mjs \
  > edge/results/m10-benchmark-tests.tap 2>&1
EDGE_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm --prefix edge test \
  > edge/results/m10-tests.tap 2>&1
npm --prefix edge run check:isolation
npm_config_cache="$PWD/edge/.cache/npm" npm run package:contents
```

Type checking and the edge isolation check passed. The final full suite,
including the new retained-evidence check and real browser tests, reported:

```text
1..186
# tests 186
# suites 0
# pass 186
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

The final benchmark-focused test invocation reported:

```text
1..72
# tests 72
# suites 0
# pass 72
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

These outputs are from the commands above; ignored logs retain the full TAP
output. The focused evidence check was added after the live capture and the
tests were rerun. No benchmark was recaptured after seeing the gate verdict.

The root package-content command fails because `dist/calc.d.ts` is absent.
Root build output is deliberately not created for this isolated project.
This is separate from the edge exclusion check, which inspects the root
packing list with a dry run and scripts disabled, without creating an archive.

The focused gate tests in `tests/benchmark-gate.check.mjs` cover passing and
failing comparisons, each individual workload regressing, zero and fractional
thresholds, exact boundary equality and a nanosecond excess, even sample and
run medians, timing integers near the safe-integer limit, strict CLI options,
invalid files and malformed or incompatible evidence. Descriptor mocks check
the file-size boundary and a growing input without writing oversized files.
The CLI tests enforce every exit status and refuse a missing input. All timing
fixtures in those tests are constructed arithmetic, not measured performance.

`tests/benchmark-evidence.check.mjs` verifies the original baseline from its
retained samples and recomputes this milestone's gate report from the committed
baseline and candidate files, including their file digests. It checks the
historical verdict without imposing a speed requirement on today's host.

## Live comparison

After the tests completed, the existing runner captured all three predefined
candidate runs serially, each in a fresh Node process, using its default
protocol. No sample or run was discarded and the baseline was not replaced.
The capture commands were:

```sh
for run in 1 2 3; do
  node edge/scripts/benchmark.mjs --machine local-linux-x64 \
    > "edge/results/m10-candidate-$run.json" || exit 1
done
node edge/scripts/benchmark-baseline.mjs \
  edge/results/m10-candidate-1.json edge/results/m10-candidate-2.json \
  edge/results/m10-candidate-3.json > edge/results/m10-candidate.json
node edge/scripts/benchmark-gate.mjs \
  --baseline edge/docs/evidence/m9-node-baseline.json \
  --candidate edge/results/m10-candidate.json \
  --threshold-percent 10 > edge/results/m10-gate.json
```

The gate exited with status `1`, a timing regression. Its JSON was preserved
as [m10-performance-gate.json](m10-performance-gate.json), and the complete
compact candidate as [m10-node-candidate.json](m10-node-candidate.json). The
original [M9 baseline](m9-node-baseline.json) remains unchanged. The candidate
retains every sample and measurement interval, and names the exact synthetic
inputs, Node runtime and shared development host. It covers the same chart
cases, house combinations and Sun scan interval documented in
[M8 and M9 validation](m8-m9-validation.md).

Median of run medians, in milliseconds per complete workload invocation:

| Workload | Original baseline | M10 candidate | Gate verdict at 10 percent |
| --- | ---: | ---: | --- |
| `chart` | 2.3742640625 | 2.7717684375 | Regression |
| `houses` | 0.0809991640625 | 0.06772291015625 | Pass |
| `transit-scan` | 0.40549190625 | 0.4112205625 | Pass |

These are the unrounded aggregate values in the linked evidence, recomputed
by `tests/benchmark-evidence.check.mjs`. The candidate's executed workload
bundle has the same SHA-256 as the baseline's. Its build source digest differs
because this milestone adds a script to the private edge package metadata;
the timed runner sources and workload identity match. Matching build output
with differing timings demonstrates why a measured threshold failure on
this shared host cannot by itself establish a code slowdown. The comparison
does not isolate CPU scheduling, frequency, JIT or other sources of variation.
The threshold was neither widened nor bypassed after seeing this result.

## Scope

All session changes belong to `edge/`. The root engine tests, conformance
suite, archive rebuild and release workflow were not run. No engine package
input, root build output, immutable archive or git metadata was changed. No
external ephemeris comparison is part of these checks. The harness owns git
operations and the draft PR. M11's measured WASM evaluation and M12's final
CI wiring remain outstanding.
