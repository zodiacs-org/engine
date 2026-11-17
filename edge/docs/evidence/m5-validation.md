# M5 validation

Repository base: `96986d545f3ec1db922287faac429d475c902b23`, plus this
milestone's changes under `edge/`. [m5-build.json](m5-build.json) records the
source and output digests for the resulting bundles. Earlier milestone
evidence is unchanged.

The session used the existing ignored Node `v22.22.2` installation on Linux.
The local dependencies and lockfile were unchanged. Commands ran from the
repository root with:

```sh
export PATH="$PWD/edge/.cache/runtime/node_modules/.bin:$PATH"
```

| Command | Observed outcome |
| --- | --- |
| `npm --prefix edge run typecheck` | Passed without emitted files. |
| `npm --prefix edge test` | Passed; final TAP totals below. |
| `npm --prefix edge run build` | Passed for all configured targets. |
| `npm --prefix edge run smoke:node` | Passed full result and exact report repeatability in Node. |
| `node edge/scripts/build-report.mjs > edge/docs/evidence/m5-build.json` | Produced compact build evidence for the final protocol source. |
| `npm --prefix edge run check:isolation` | Passed project limits and exclusion from the root dry-run packing list. |
| `npm_config_cache="$PWD/edge/.cache/npm" npm run package:contents` | Failed with `packed package is missing dist/calc.d.ts`; root build output is absent. |
| `git diff --check` | Passed. |

Final TAP totals from the full edge test command:

```text
1..68
# tests 68
# suites 0
# pass 68
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## What was checked

`tests/exact.check.mjs` checks the tagged transport independently of engine
calculations. It enforces number bit patterns, signed zero, adjacent doubles,
subnormal values, infinities and observable NaNs; valid and invalid Dates;
undefined, null and sparse holes; property ordering and prototype distinctions;
shared references and cycle refusal; mismatch paths; unsupported data and
descriptor refusal without executing getters or `toJSON`; complete validation
of both reports; canonical syntax; and depth, value-count and UTF-8 limits.
Malformed numeric hex and extra array properties ending in line breaks are
explicit rejection cases. Known numeric bit patterns test representation,
not astronomical accuracy.

`tests/exact-workloads.check.mjs` reconstructs the entire synthetic smoke
result from the tagged transport with a separate test-only decoder. Strict
deep equality against the original checks that every field and Date survives.
A changed longitude and a Date replaced with its identical ISO text produce
the expected data paths; ordinary JSON hides the latter change.

`tests/bundles.check.mjs` now requires every target's `runExactSmokeCases()`
output to equal the separate Node source build's output. All those bundles
execute in Node for this test. Existing checks still verify reproducible bytes,
source and output digests, import graphs, engine API exports and licence
notices. The generated protocol is confined to the workload entry. Existing
HTTP adapter tests still pass. Node's mock timer API emits an experimental
warning during the deadline checks.

## Scope and remaining checks

This milestone establishes the protocol and Node execution. It does not
establish exact parity in native Deno, Bun, Workers or browsers. Native
runtime runners remain in M6 and M7; any bit difference must be reported,
without tolerance or rounding. Performance and WASM work remain later
milestones. No external astronomical reference was consulted or compared.

All edits and generated output stayed under `edge/`. Raw test logs and bundles
remain ignored. Root source, packed files, dependencies, build output and
release archives were unchanged. No archive was packed and no git metadata
was changed. Root CI and archive rebuild gates were not run. The passing
edge isolation check does not replace the root package-content gate, which
cannot pass without the root build output this task leaves untouched.
