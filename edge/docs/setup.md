# Setup and runtime status

Run this lab from a checkout of the engine repository. It imports the engine's
source and installs its own tools under `edge/`. The public API bundles,
example handlers and all checks can be built without installing or building
the root package. Read the repository instructions and licensing records
before modifying or redistributing the bundles.

## Provision the environment

Use a pinned Linux x64 runner image for reproducing the retained environment.
Provision Node and npm before installing the edge lockfile. The build requires
Node 22, enforced in `scripts/build-support.mjs`; the pinned AssemblyScript
package declares npm 10 or later. The [final validation](evidence/m12-validation.md)
records the exact tool versions used. Pin the Node patch and npm version in
your runner image rather than resolving a moving major-version tag on each
run. A changed Node patch requires a separate performance baseline.

The edge lockfile pins esbuild, TypeScript, AssemblyScript, Miniflare,
workerd, Playwright Core and the unchanged engine's ephemeris dependency.
Install it from the repository root:

```sh
set -eu
node --version
npm --version
npm ci --prefix edge --cache "$PWD/edge/.cache/npm"
mkdir -p edge/results
npm --prefix edge run typecheck
npm --prefix edge run build
npm --prefix edge run smoke:node
npm --prefix edge run check:isolation
```

The native runtime checks additionally require Deno and Bun. Browser checks
require an installed Chromium executable; Playwright Core does not download
one. Pin those binaries and any OS libraries in the runner image, record the
image digest in your CI configuration, and verify vendor archive checksums
when provisioning from archives. Do not silently update them during a check.
Use the exact versions in the retained reports to reproduce that matrix, or
record a new matrix for deliberately changed versions. Successful installation
is not evidence that a version matches Node numerically.

Tools can also live under the ignored `edge/.cache/` directory. Give the
checkers explicit executable paths instead of relying on an unrelated global
installation. For an already provisioned environment, for example:

```sh
export EDGE_DENO_EXECUTABLE="$PWD/edge/.cache/deno-tool/node_modules/.bin/deno"
export EDGE_BUN_EXECUTABLE=/usr/local/bin/bun
export EDGE_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome
"$EDGE_DENO_EXECUTABLE" --version
"$EDGE_BUN_EXECUTABLE" --version
"$EDGE_CHROMIUM_EXECUTABLE" --version
EDGE_CHROMIUM_EXECUTABLE="$EDGE_CHROMIUM_EXECUTABLE" npm --prefix edge test
```

These paths describe the validation host, not an installation performed by
the scripts. Substitute your provisioned paths. `EDGE_DENO_EXECUTABLE` and
`EDGE_BUN_EXECUTABLE` are shell variables used in the [CI recipes](ci.md);
the smoke scripts take
their paths as arguments. `EDGE_CHROMIUM_EXECUTABLE` enables browser tests
inside the Node suite. Pass `--browser` separately to the web smoke CLI.
Keep downloaded tools, browser profiles and caches inside ignored folders.
The smoke runners never download missing tools or turn a missing runtime
into a pass.

## Observed runtime matrix

The [M12 native report](evidence/m12-runtimes.json) and
[M12 web report](evidence/m12-web.json) identify the builds, runtime versions,
exact-result digests and first differing field. They execute the complete
synthetic cases in [`src/workloads.ts`](../src/workloads.ts). The following
statuses apply only to those inputs and the recorded Linux host:

| Runtime | Tested version | Execution | Exact agreement with Node |
| --- | --- | --- | --- |
| Node | 22.22.2 | Passed reference and repeatability checks | Reference |
| Local workerd | 1.20251011.0 via Miniflare 4.20251011.0 | Passed imports, workloads, Worker handler and network checks | Passed |
| Deno | 2.5.4 | Passed workload execution and repeatability | Failed |
| Bun | 1.4.2 | Passed workload execution and repeatability | Failed |
| Chromium | Chrome/154.0.8037.97 | Passed ESM imports, workloads and network checks | Failed |

Native Deno and Bun HTTP checks also passed; their separate reports in
[M12 validation](evidence/m12-validation.md) check response structure and
transport, not exact agreement with Node. HTTP JSON loses result types and
signed zero. Exact smoke checks use the [binary64 and Date protocol](exact.md)
before ordinary JSON serialization. They remain failing gates on this matrix.

The bundles make the existing root API executable in the recorded runtimes.
They do not make different JavaScript engines return identical numbers. The
lab neither changes the engine's arithmetic nor widens comparison tolerances.
The reports show numerical differences; they do not establish their cause
for every field or certify other inputs. Local workerd results do not
establish deployment behavior on Cloudflare. Other browsers, operating
systems and architectures remain untested. Optional engine entry points
are outside these bundles.

## Outputs and remaining limits

`build` emits libraries and applicable handlers under `.generated/<target>/`.
The [README](../README.md#build-the-portable-libraries) describes every output
and the graph and licence checks. See the [HTTP guide](http.md) for launching
the examples and the [CI guide](ci.md) for the complete validation sequence.
No deployment credentials or publishing step is needed for these checks.

The [Node benchmarks](benchmarks.md) measure complete chart, houses and
transit-scan invocations, including their loop and result-consumption cost.
They exclude startup, HTTP and deployment overhead. The historical baseline
is tied to its recorded shared host. Capture a reviewed baseline on the
intended runner before enabling the [performance gate](performance-gate.md),
and preserve earlier records when conditions change.

The [WASM path](wasm.md) can compile and run the isolated nutation experiment.
Its retained whole-workload timings failed the preregistered benefit rule.
The experiment remains available for investigation, with JavaScript in every
normal bundle. Its successful completion does not mean acceleration was
accepted. No WASM performance claim is made for the other runtimes.

The edge isolation check verifies project file limits, documentation and npm
packing-list exclusion. It does not replace the root package-content gate,
which requires root build output. When that output is absent, record the
limitation and leave the root checkout unchanged. Keep full generated reports
in `results/`, bundles in `.generated/` and caches in `.cache/`; commit only
reviewed compact evidence under this folder's `docs/evidence/`.
