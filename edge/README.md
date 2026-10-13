# Edge and browser lab

This private project reads the engine's source through relative imports. Its
dependencies, build output and checks live here. It does not change the npm
package or require a root build. Code and documentation here use the repository
[MIT licence](../LICENSE); bundles also carry the engine's data attribution and
the dependency's notices. See [LICENSING.md](../LICENSING.md) and
[NOTICE](../NOTICE) before redistributing them.

The lab provides a Node reference build, synthetic workloads and portable ESM
library builds configured for Cloudflare Workers, Deno, Bun and browsers. The
bundles expose the engine's public root API. Optional engine entry points are
not included. [Workers, Deno and Bun HTTP examples](docs/http.md) provide a
bounded chart endpoint with shared Fetch request/response tests and a native
Deno/Bun server check. The [exact comparison protocol](docs/exact.md) preserves
full result types and number bits. The [native runtime checker](docs/runtime-smoke.md)
executes Node, Deno and Bun and fails on any exact difference. The recorded
Deno and Bun runs differ from Node; they do not establish numerical parity.
The [web runtime checker](docs/web-smoke.md) executes local workerd and a real
Chromium page. Its recorded workerd run matches Node exactly, while Chrome
differs. The [local benchmark runner](docs/benchmarks.md) measures chart,
houses and transit-scan workloads with recorded provenance. The
[performance gate](docs/performance-gate.md) verifies comparable evidence and
fails when a workload exceeds a configurable regression threshold. A measured
[WASM experiment](docs/wasm.md) retains an isolated compilation path and its
measurements; its end-to-end acceptance rule failed, so normal bundles keep
JavaScript. Final CI wiring remains in [PLAN.md](PLAN.md).

The foundation's commands, observed results and the missing-root-build
limitation are recorded in [M1 validation](docs/evidence/m1-validation.md).
Bundle checks and their scope are recorded in
[M2 validation](docs/evidence/m2-validation.md), with reproducible
[build measurements](docs/evidence/m2-build.json) from that milestone.
Worker validation is recorded in
[M3 validation](docs/evidence/m3-validation.md).
Deno/Bun validation and that milestone's build measurements are recorded in
[M4 validation](docs/evidence/m4-validation.md).
Exact protocol validation and that milestone's build measurements are recorded in
[M5 validation](docs/evidence/m5-validation.md).
Native exact comparisons and runner validation are recorded in
[M6 validation](docs/evidence/m6-validation.md).
Local Workers and browser checks are recorded in
[M7 validation](docs/evidence/m7-validation.md).
Benchmark checks and the initial local Node baseline are recorded in
[M8 and M9 validation](docs/evidence/m8-m9-validation.md).
Performance gate checks and a comparison with the original baseline are
recorded in [M10 validation](docs/evidence/m10-validation.md).
Kernel profiling and the WASM experiment are recorded in
[M11 validation](docs/evidence/m11-validation.md).

## Run the foundation

Use Node 22, as enforced by `scripts/build-support.mjs`. From the repository
root:

```sh
npm ci --prefix edge --cache "$PWD/edge/.cache/npm"
npm --prefix edge run typecheck
npm --prefix edge test
npm --prefix edge run smoke:node
npm --prefix edge run check:isolation
```

No root install is needed. The local lockfile pins the toolchain, and the build
checks its installed ephemeris against the root package's exact dependency.
The build resolves that dependency from `edge/node_modules`, even when the
root has another installation. This uses esbuild's
[alias option](https://esbuild.github.io/api/#alias).

`build:reference` writes `.generated/reference/workloads.mjs`, the build's
import metadata and copies of the engine's licence, licensing record and
notice. It retains dependency legal comments in the bundle. That ignored
directory is a local test artifact; it is not a release package.

`src/workloads.ts` contains only invented inputs. Chart cases exercise UTC,
southern and polar locations, and unknown birth time. The houses workload
computes angles and every system exported in `HOUSE_SYSTEMS` on fixed angular
inputs. The transit scan searches the Sun's longitude crossing over the
explicit interval in `TRANSIT_CASE`, with a fixed sample budget. Calls return
their full engine results, without rounding or replacing numerical values.
The test checks that the scan completes and contains a crossing.

Node test files use `tests/*.check.mjs`, explicitly selected by the edge test
command. Do not name them `*.test.*` or `*.spec.*`: the root Vitest command
would discover those and run this separate project in the engine's jobs.

`smoke:node` checks repeatability within Node and prints a summary. The tests
also repeat calculations after the other workloads to exercise shared
ephemeris state. These are compatibility checks, not evidence of astronomical
accuracy. It also checks repeatability of the exact encoded reports.
`runExactSmokeCases()` preserves signed zero, Dates and all result fields for
the native runtime runners. See the [protocol](docs/exact.md).

`check:isolation` checks project file limits and documentation, then inspects
the root package's dry-run file list with scripts disabled. It checks that
this folder stays out of the package. The repository's separate
`npm run package:contents` needs an existing root `dist/`; the edge check does
not substitute for that complete gate. Do not create or alter root build
output for this project.

Keep raw runs in `results/`, generated bundles in `.generated/` and downloaded
tools in `.cache/`; all are ignored. Reviewed baseline summaries belong under
`docs/evidence/`, with their measurement scripts under `scripts/` within this
folder. Do not commit secrets, personal birth inputs or external ephemeris
output.

## Build the portable libraries

After the local install above, run these commands from the repository root:

```sh
npm --prefix edge run build
# Or select one target: workers, deno, bun or browser.
npm --prefix edge run build -- workers
```

`build.config.mjs` defines each target explicitly. The Workers, Deno and Bun
configurations use esbuild's neutral platform, with the target's export
conditions; the browser configuration uses its browser platform. Every target
emits ES2022 ESM, bundles its dependency, and leaves minification off. These
are build configurations, not runtime version requirements. The Workers, Deno
and Bun builds also emit the HTTP handlers described below. No host
compatibility shims are installed. See esbuild's
[platform](https://esbuild.github.io/api/#platform) and
[conditions](https://esbuild.github.io/api/#conditions) documentation.

Each build replaces its own ignored `.generated/<target>/` directory. It holds:

| File | Purpose |
| --- | --- |
| `engine.mjs` | Public root API re-exported by `src/engine.ts`. |
| `workloads.mjs` | Synthetic cases and workload runners for compatibility checks. |
| `worker.mjs` (Workers only) | Module Worker with a default Fetch handler for `POST /chart`. |
| `deno.mjs` (Deno only) | Importable handler and a local server started by direct execution. |
| `bun.mjs` (Bun only) | Importable handler and a local server started by direct execution. |
| `metafile.json` | esbuild's input and output import graph. |
| `manifest.json` | Build settings, tool versions, source digests, output sizes and digests. |
| `LICENSE`, `LICENSING.md`, `NOTICE` | Unmodified engine licence and attribution records. |
| `ASTRONOMY-LICENSE.txt` | The dependency's full preserved MIT comment, also kept inline in each module. |

For example, a page served from `edge/` can import the browser module:

```js
import { natalChart } from "./.generated/browser/engine.mjs";

const syntheticChart = natalChart({
  utc: "2000-03-20T12:34:56Z",
  latitude: 35.25,
  longitude: -110.75,
  houseSystem: "whole"
});
```

Serve ESM over HTTP with a JavaScript content type. The
[browser checker](docs/web-smoke.md) imports this module in Chromium and calls
the chart API with the same synthetic input. Applications should import `engine.mjs`;
`workloads.mjs` separately bundles the engine for testing, so importing both
loads separate copies. Keep the licence and attribution files with any copy
of the bundles. The private lab's MIT licence does not replace the engine's
`MIT AND CC-BY-4.0` terms or the licensing record's open questions.

The build rejects warnings, unresolved or external imports, dynamic imports,
CommonJS, unexpected source or dependency paths and opt-in modules in the root
graph. It also rejects oversized output, including metadata and copied
notices. The strict file limit is enforced by `tests/bundles.check.mjs` and
recorded in the build measurements. The graph check reuses the repository's
`OPT_IN_SOURCE` definition. It is an import-graph check, not a proof about every
possible runtime side effect.

The manifest records SHA-256 and byte length for compiled source, the
ephemeris ESM file, package metadata, lockfile, build scripts, configuration
and copied licence files. Its `sourceDigest` hashes the sorted source records
serialized with indented JSON and a trailing newline. Each output except the
manifest itself has its own digest. Source identity alone does not identify a
target configuration or output; use the manifest's target, settings and output
digests together. Compiled bytes are retained during bundling and checked
against files read for the manifest. Build from a quiescent checkout: these
local digests are reproducibility records, not authenticated attestations.

`npm --prefix edge test` compares repeated build bytes, checks digests and
notices, and imports every target in Node to compare its complete public API
namespace and synthetic workload results with a separate Node source build.
The comparison uses strict deep equality, with no rounding or tolerance.
This establishes Node bundle compatibility for the cases in
`src/workloads.ts`. The separate Deno/Bun server check tests HTTP behavior,
not numerical parity. `npm --prefix edge run smoke:runtimes` runs the complete
exact transport in native Node, Deno and Bun; every selected runtime is
required. See [runtime setup, reports and observed failures](docs/runtime-smoke.md).
`npm --prefix edge run smoke:web` checks local Workers and browser execution.
See [its tested versions, reports and limits](docs/web-smoke.md).
Transcendental arithmetic can differ between runtimes.

To regenerate the compact build evidence after reviewing a build change:

```sh
mkdir -p edge/results
node edge/scripts/build-report.mjs > edge/results/build-report.json
```

The report builds in memory, records exact bytes and digests, and does not
measure performance. Copy a reviewed compact report to a new milestone's
evidence filename; keep older milestone evidence unchanged. Raw generated
bundles and full manifests stay ignored.

## Chart HTTP endpoints

Build and test the Worker from the repository root with the local Node toolchain:

```sh
npm --prefix edge run build -- workers
node --test edge/tests/http.check.mjs
```

The source entry is `src/worker.ts`; its self-contained output is
`.generated/workers/worker.mjs`. It exports a default object with a `fetch`
method and needs no bindings. The shared handler in `src/http.ts` accepts a
JSON chart request, validates its size and supported fields, and calls the
unchanged engine synchronously. See the [request contract](docs/http.md) for
inputs, limits, status codes and a local invocation.

These tests run Fetch requests in Node. The separate
[web smoke command](docs/web-smoke.md) also executes the handler in local workerd.
HTTP JSON serialization is not
the exact comparison protocol: dates become strings and signed zero
is lost. The handler has no storage or request logging, and every response
asks caches not to store it.

The Deno and Bun entries, `src/deno.ts` and `src/bun.ts`, export the same
`handleRequest` function. Direct execution of their generated modules starts
a loopback HTTP server; importing them does not start one. See
[Deno and Bun launch instructions](docs/http.md#deno-and-bun) for commands and
the native server check. Node tests exercise the shared contract through every
adapter. The native checks cover HTTP transport and response structure without
claiming exact cross-runtime results.
