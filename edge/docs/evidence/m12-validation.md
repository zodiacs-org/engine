# M12 validation

Repository base: `3d676f2`, plus this session's documentation and compact
evidence under `edge/`. The [setup guide](../setup.md) records the runtime
matrix; the [CI guide](../ci.md) supplies required compatibility jobs, serial
benchmark collection, report retention and baseline review rules. Current
guides now link to those instructions. Historical evidence remains unchanged.
No engine, timed workload, build configuration or toolchain dependency changed.

## Environment and checks

Checks ran on the Linux x64 host recorded in the reports, with Node 22.22.2
and npm 10.9.7. Node came from the existing ignored runtime installation.
The host's initial npm 9.2.0 installation completed but warned that the locked
AssemblyScript package requires npm 10 or later. A pinned npm 10.9.7 was
installed under the ignored `edge/.cache/npm-tool/`, followed by a clean
edge-local install with no such warning. The final checks use that install.

Commands from the repository root:

```sh
export PATH="$PWD/edge/.cache/runtime/node_modules/.bin:$PWD/edge/.cache/npm-tool/node_modules/.bin:$PATH"
node --version
npm --version
npm ci --prefix edge --cache "$PWD/edge/.cache/npm" --no-audit --no-fund
mkdir -p edge/results
npm --prefix edge run typecheck
EDGE_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm --prefix edge test \
  > edge/results/m12-tests.tap 2>&1
npm --prefix edge run build
npm --prefix edge run build:reference
node edge/scripts/smoke-node.mjs
node edge/scripts/build-wasm.mjs
node edge/scripts/build-report.mjs > edge/results/m12-build-report.json
```

The final install output and typecheck were successful:

```text
added 47 packages in 2s

> typecheck
> tsc --project tsconfig.json
```

The complete suite, with real browser tests enabled, passed:

```text
1..204
# tests 204
# suites 0
# pass 204
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

These are excerpts from the retained ignored install and TAP logs. Every
build and Node command above exited successfully. The
[build report](m12-build.json), emitted by `scripts/build-report.mjs`, retains
each target's output sizes, digests, settings and source identity. The suite
checks build reproducibility and graph isolation, HTTP validation, the exact
codec, process and network failures, benchmark arithmetic and gate decisions,
historical evidence and the compiled WASM kernel. A passing test of a mismatch
detector does not make native parity pass.

## Native execution and exact comparison

After the tests completed, the following commands ran serially. HTTP commands
exited successfully. Both full exact smoke commands exited with status `1`:

```sh
node edge/scripts/check-http-runtime.mjs deno \
  "$PWD/edge/.cache/deno-tool/node_modules/.bin/deno" \
  > edge/results/m12-deno-http.json
node edge/scripts/check-http-runtime.mjs bun /usr/local/bin/bun \
  > edge/results/m12-bun-http.json
node edge/scripts/smoke-runtimes.mjs \
  --deno "$PWD/edge/.cache/deno-tool/node_modules/.bin/deno" \
  --bun /usr/local/bin/bun > edge/results/m12-runtimes.json
node edge/scripts/smoke-web.mjs --browser /usr/bin/google-chrome \
  > edge/results/m12-web.json
```

Reviewed outputs are retained unchanged:

| Record | Outcome |
| --- | --- |
| [Deno HTTP](m12-deno-http.json) | Deno 2.5.4 passed import-without-listener and native HTTP cases. |
| [Bun HTTP](m12-bun-http.json) | Bun 1.4.2 passed import-without-listener and native HTTP cases. |
| [Native exact smoke](m12-runtimes.json) | Node 22.22.2 passed; Deno and Bun executed repeatably but differed from Node. |
| [Web exact smoke](m12-web.json) | Local workerd 1.20251011.0 matched Node; Chrome/154.0.8037.97 executed repeatably but differed from Node. |

The first Deno difference is the latitude at
`charts[0].result.bodies[2].lat`. Bun and Chrome first differ at
`charts[0].result.bodies[1].speed`. The reports retain expected and actual
binary64 values and all runtime versions. They compare the complete synthetic
inputs in `src/workloads.ts`, with no tolerance or rounding. Later fields are
not claimed to agree after the first mismatch. Worker and browser imports,
handler or public API checks and the observed network checks passed.

These results reproduce the earlier compatibility failures. They establish
execution on the measured runtimes, not exact portability across them or
astronomical accuracy. No deployed Worker or additional browser was tested.
The CI recipes keep these mismatches failing.

## Performance gate

After all build, browser and test processes from this session finished, the
default benchmark protocol captured the complete predefined candidate set
serially, each run in a fresh Node process:

```sh
set -eu
for run in 1 2 3; do
  node edge/scripts/benchmark.mjs --machine local-linux-x64 \
    > "edge/results/m12-candidate-$run.json"
done
node edge/scripts/benchmark-baseline.mjs \
  edge/results/m12-candidate-1.json edge/results/m12-candidate-2.json \
  edge/results/m12-candidate-3.json > edge/results/m12-candidate.json
node edge/scripts/benchmark-gate.mjs \
  --baseline edge/docs/evidence/m9-node-baseline.json \
  --candidate edge/results/m12-candidate.json \
  --threshold-percent 10 > edge/results/m12-performance-gate.json
```

Collection and compaction succeeded. The gate accepted the evidence as
comparable and exited with status `1`, a timing regression. The complete
compact [candidate](m12-node-candidate.json) retains every sample, input and
measurement interval. The [gate report](m12-performance-gate.json) retains
the comparison and input hashes. Its unrounded medians of run medians, in
milliseconds per complete workload invocation, are:

| Workload | M9 baseline | M12 candidate | Verdict at 10 percent |
| --- | ---: | ---: | --- |
| chart | 2.3742640625 | 3.3613878125 | Regression |
| houses | 0.0809991640625 | 0.06995948828125 | Pass |
| transit-scan | 0.40549190625 | 0.415501125 | Pass |

The baseline and candidate executed identical workload bundle bytes. Build
source identities differ because the edge tooling evolved after M9; the gate
confirmed matching timed runner, workload, runtime and host metadata. This
shared host does not isolate scheduling, CPU frequency or JIT effects, so the
measurement alone does not establish an implementation slowdown. No run or
sample was discarded, no threshold was changed, and no repeat capture was
made after seeing the failure. The original baseline remains unchanged.

The committed candidate and report were revalidated with
`validateBenchmarkBaseline` and `gateFromFiles` from the existing scripts;
the recomputed report matched exactly. No new baseline is installed for CI.
The CI guide requires a reviewed baseline on its intended measurement host.

## WASM, isolation and scope

The WASM compiler and exact-result tests passed in the full suite. The
[M11 experiment](m11-wasm-experiment.json) and its rejection remain the
retained timing evidence; profiling and timing were not recaptured for a
documentation-only change. Normal bundles continue to use JavaScript.

The final edge isolation command passed:

```sh
npm --prefix edge run check:isolation
```

```text
edge files satisfy project limits and are excluded from the root packing list.
This checks edge exclusion only; the repository package-content gate also requires root dist/.
```

The root gate was attempted with the cache under edge:

```sh
npm_config_cache="$PWD/edge/.cache/npm" npm run package:contents
```

It exited with status `1` and reported
`AssertionError [ERR_ASSERTION]: packed package is missing dist/calc.d.ts`.
Root output was not created. This limitation remains separate from the passing
edge exclusion check. Root engine, conformance and archive rebuild jobs were
not run for this documentation-only milestone. No external ephemeris
comparison was run.

Shell examples in the new guides passed `bash -n`; their local links and
retained evidence were checked. File-size and no-em-dash checks passed.
All changed files are under `edge/`. The root package, engine source,
release artifacts and git metadata are unchanged. The harness retains control
of commits and the draft PR. M12 completes the plan's documentation and
validation work with the parity, performance and missing-root-output failures
explicitly retained above.
