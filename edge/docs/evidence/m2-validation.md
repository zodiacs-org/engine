# M2 validation

Repository base: `54534576da684bc755ec0a4773a2eeb588c41905`, plus this
milestone's changes under `edge/`. The source digests in
[m2-build.json](m2-build.json) identify the measured build inputs.

The session used Node `v22.22.2`, npm `9.2.0`, Linux x64, and the existing
local installation pinned by `edge/package-lock.json`. The engine version,
ephemeris version and esbuild version are recorded in the build report.
The shell's default Node was `v20.19.2`; commands used the ignored runtime
installed during M1:

```sh
export PATH="$PWD/edge/.cache/runtime/node_modules/.bin:$PATH"
```

All commands below ran from the repository root.

| Command | Observed outcome |
| --- | --- |
| `npm --prefix edge run build` | Passed for Workers, Deno, Bun and browser configurations; generated files stayed under `edge/.generated/`. |
| `npm --prefix edge run typecheck` | Passed, no emitted files. |
| `npm --prefix edge test` | Passed; the TAP summary is reproduced below. |
| `npm --prefix edge run smoke:node` | Passed on Node; transit scan complete with a crossing. |
| `npm --prefix edge run check:isolation` | Passed file and documentation limits and exclusion from the root dry-run packing list. |
| `node edge/scripts/build-report.mjs > edge/docs/evidence/m2-build.json` | Produced the accompanying compact build measurements. |
| `npm_config_cache="$PWD/edge/.cache/npm" npm run package:contents` | Failed: `packed package is missing dist/calc.d.ts`. Root `dist/` is absent. |
| `git diff --check` | Passed. |

TAP totals from `node --test tests/*.check.mjs`, as run by the edge test command:

```text
1..14
# tests 14
# suites 0
# pass 14
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## What was compared

`edge/tests/bundles.check.mjs` builds each target in memory and compares all
output bytes and the manifest with a repeated build on this host. It checks
source and output SHA-256 values against the actual files, the dependency's
full MIT notice inline and alongside the bundles, and unmodified copies of
the root licence and attribution files. The strict file limit and rejection
of external, unresolved, dynamic, CommonJS and unexpected imports are tested,
as are invalid target names and output paths.

For Node compatibility, the test independently bundles `src/index.ts` and
`edge/src/workloads.ts` for Node, imports their outputs and every target's
modules in Node, and compares complete public export names, chart results
and full workload results with strict deep equality. Dates and numerical
values are not serialized, rounded or assigned a tolerance. The corpus is
exactly the invented inputs in `edge/src/workloads.ts`: its chart and angle
cases, and the Sun longitude scan from `2000-03-01T00:00:00Z` through
`2000-04-01T00:00:00Z`. `foundation.check.mjs` continues to check the corpus's
coverage, finite results, fallback cases, complete scan and repeatability.

The build report comes from `edge/scripts/build-report.mjs`, using the same
builder and configuration as the CLI. It records uncompressed file sizes in
bytes and content digests, including legal sidecars and esbuild metadata.
The manifest itself is omitted from its own output digest list. Full
manifests and generated JavaScript remain ignored. These are build
measurements, not performance baselines or astronomical accuracy evidence.

## Limits of this validation

Reproducibility was checked on repeated builds in this checkout with the
recorded toolchain. It was not checked across operating systems, processor
architectures or relocated checkouts. Source bytes given to esbuild are
retained and checked against the files hashed into the manifest, including
changes that preserve length. Build scripts and configuration are expected
to remain unchanged while a build runs; the digests are not authenticated.

Workers, Deno, Bun and a browser were not executed. Naming those targets
describes the build configurations. HTTP examples and runtime parity belong
to the following milestones, and the eventual parity harness must report any
runtime arithmetic differences without rounding them away.

No root dependencies or build output were created, no engine or packed file
was changed, and no archive was packed. The full root CI suite and archive
rebuild gates were not run. The passing edge isolation check establishes
package exclusion only; it does not replace the root package-content gate.
