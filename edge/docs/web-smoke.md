# Local Workers and browser smoke checks

`scripts/smoke-web.mjs` runs a fresh Node reference, local Cloudflare workerd
through Miniflare, and a real Chromium browser through Playwright. It compares
the complete synthetic chart, houses and transit-scan results using the
[exact protocol](exact.md). Dates, signed zero, binary64 values and metadata
are preserved. There is no numerical tolerance or rounding step.

The [M7 evidence](evidence/m7-web.json) records an exact match for local workerd
and a numerical mismatch for Chrome on the tested host. Chrome imported the
bundles and completed the workloads and network checks. Its unequal result
makes the combined command fail. These are compatibility checks with Node,
not astronomical accuracy evidence or a guarantee about other runtime
versions. Local workerd is not a deployed Cloudflare Worker.

## Run

Use Node 22 and install the edge lockfile as in [the README](../README.md).
Miniflare and Playwright Core are pinned in `edge/package.json`; the lockfile
also pins workerd. Playwright Core does not download a browser. Supply an
already installed Chromium executable. From the repository root:

```sh
npm --prefix edge run smoke:web
# The default browser path is /usr/bin/google-chrome. Override it as needed.
node edge/scripts/smoke-web.mjs --browser /path/to/chromium
```

The default selection requires Node, Workers and browser. A missing browser,
a failed workerd startup, an import error, a network attempt, a handler failure,
nonrepeatable results or an exact mismatch fails the run. A tool is never
downloaded or silently skipped by the smoke runner. Select a narrower check
explicitly when appropriate:

```sh
node edge/scripts/smoke-web.mjs --runtimes workers
node edge/scripts/smoke-web.mjs --runtimes browser --browser /path/to/chromium
node edge/scripts/smoke-web.mjs --runtimes node
```

Node is always the reference. The report lists unselected runtimes, and a
passing narrow selection says nothing about them. `smoke:runtimes` remains
the separate [Node, Deno and Bun check](runtime-smoke.md); run both commands
to cover the full runtime matrix. The existing Deno and Bun evidence also
records exact differences.

## What executes

Both web adapters build with the existing graph and licence checks, keeping
the resulting bytes in memory. They execute those captured bytes rather than
reading a potentially stale `.generated/` directory. Neither adapter alters
the engine source or patches its arithmetic. Each runtime repeats the full
workload before returning a result.

The Workers probe dynamically imports `engine.mjs`, `workloads.mjs` and
`worker.mjs` after installing a fetch guard. The worker's default `fetch`
method receives native Fetch requests for every synthetic chart and the
handler's route, method, input, calculation and size error cases. The adapter
checks statuses, headers and response bodies against the engine running in
the same isolate, then compares the responses and exported names with Node
executing the same bundles. HTTP JSON is compared separately because it
cannot preserve the full result types that the exact workload protocol does.
`tests/smoke-workers.check.mjs` tests the runner's failure cases.

The browser loads an actual loopback HTTP page and dynamically imports
`engine.mjs`, `workloads.mjs` and an independently bundled exact-codec helper
as ESM. It calls the public engine's chart API and compares it exactly with
the corresponding workload chart in that browser. It also verifies that the
public export names match the build graph. This page is a test harness, not
an application UI. Its server serves only captured assets, never arbitrary
filesystem paths. `tests/smoke-browser.check.mjs` covers the server, request
policy and browser failures.

## Network checks and scope

In workerd, the fetch guard is installed before importing any bundle and
counts attempted calls even when bundle code catches the exception. Miniflare
also routes outbound requests to a local denying service. A deliberate call
through the original native fetch verifies that service is connected.
`cf: false` disables Miniflare's automatic request for Cloudflare request
metadata. Unexpected attempts during imports, calculations or handler calls
fail the check. See Cloudflare's
[Miniflare setup](https://developers.cloudflare.com/workers/testing/miniflare/get-started/)
and [module configuration](https://developers.cloudflare.com/workers/testing/miniflare/core/modules/).

In Chromium, request routing permits only each named loopback bootstrap
resource, once. Page network APIs are guarded before imports, service workers
are blocked, and all further requests are denied after bootstrap. The runner
checks for both guarded API calls and browser requests, including swallowed
errors. Deliberate fetch and image requests verify that the guard and request
route deny access without reaching the server. The report records the
bootstrap requests, checks and actual browser and V8 versions. These checks
cover the observed page imports and synchronous calculations. They are not an
operating-system network sandbox or a monitor for browser background services.
No general guarantee is made about code scheduled beyond the observation
window. The test uses trusted local source and Chromium's automation launch
settings; it is not a sandbox for hostile input or third-party pages.
Playwright documents [request routing](https://playwright.dev/docs/api/class-browsercontext#browser-context-route),
[WebSocket routing](https://playwright.dev/docs/api/class-browsercontext#browser-context-route-web-socket)
and [scripts installed before page code](https://playwright.dev/docs/api/class-browsercontext#browser-context-add-init-script).

## Results and CI

The direct `node` command emits compact JSON to stdout and uses a nonzero exit
status on any selected-runtime failure. Save raw runs in the ignored folder:

```sh
mkdir -p edge/results
node edge/scripts/smoke-web.mjs > edge/results/web-smoke.json
```

Use that command's exit status as the gate. A JSON file being present does not
mean the run passed. A mismatch includes the first original data path and
expected and actual exact values. Later fields are not claimed to agree.
When the Node reference fails, otherwise successful targets are `uncompared`.
Build, runner, protocol and result digests identify the measured inputs;
compact evidence does not contain the full generated results. Build from a
quiescent checkout. These are local provenance records, not attestations.

The launchers receive a limited environment without inherited credentials,
runtime flags or proxies. Child time and output are bounded. Temporary browser
profiles and launcher artifacts stay in the ignored edge cache. The adapters
dispose runtime resources on success and failure. POSIX shutdown is tested;
Windows process-tree cleanup remains untested.

The ordinary edge suite includes controlled workerd tests because Miniflare is
an installed dependency. Tests requiring a real browser are explicitly enabled
with the same installed executable:

```sh
EDGE_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome \
  node --test edge/tests/smoke-browser.check.mjs
```

For CI, provision Node, the edge lockfile and a pinned Chromium installation,
then run the edge typecheck, tests, both runtime smoke commands and isolation
check in separate steps. Configure Deno and Bun as described in their guide.
Keep workflow configuration in the consuming repository; this project adds no
root GitHub workflow. With the recorded matrix, strict runtime parity is a
failing gate. Do not convert mismatches to success or claim support for an
untested browser or deployed Workers version. The [CI guide](ci.md) gives the
complete command sequence and separate benchmark and performance jobs.
