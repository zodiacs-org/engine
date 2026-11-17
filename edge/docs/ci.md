# CI wiring

Use these shell steps in the existing CI system, with the repository root as
its working directory. They install and write only below `edge/`; no root
install, root build, package archive, deployment or publication is needed.
This guide adds no workflow. The repository's existing engine, archive,
conformance and atlas gates remain separate requirements under
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## Provision each job

Pin the runner image and architecture, Node and npm releases, and every native
runtime before running the checks. A reviewed image digest or an installer
with pinned downloads and verified checksums belongs in the consuming CI
configuration. Floating `latest` runtime selections do not reproduce a tested
matrix. The following Node and npm versions are explicit provisioning choices,
matching the repository toolchain recorded in
[the archive instructions](../../artifacts/README.md). Node 22 is enforced by
[`build-support.mjs`](../scripts/build-support.mjs); the locked AssemblyScript
dependency requires npm 10 or later, as recorded in
[`package-lock.json`](../package-lock.json).

```sh
set -eu
test "$(node -p 'process.versions.node')" = 22.22.2
test "$(npm --version)" = 10.9.7
npm ci --prefix edge --cache "$PWD/edge/.cache/npm"
mkdir -p edge/results
```

The lockfile supplies Miniflare, workerd, Playwright Core and the build tools.
It does not provision Deno, Bun or Chromium. For jobs that need them, supply
absolute executable paths through these CI variables, after provisioning exact
reviewed runtime versions:

```sh
set -eu
: "${EDGE_DENO_EXECUTABLE:?Set the pinned Deno executable path}"
: "${EDGE_BUN_EXECUTABLE:?Set the pinned Bun executable path}"
: "${EDGE_CHROMIUM_EXECUTABLE:?Set the pinned Chromium executable path}"
test -x "$EDGE_DENO_EXECUTABLE"
test -x "$EDGE_BUN_EXECUTABLE"
test -x "$EDGE_CHROMIUM_EXECUTABLE"
"$EDGE_DENO_EXECUTABLE" --version
"$EDGE_BUN_EXECUTABLE" --version
"$EDGE_CHROMIUM_EXECUTABLE" --version
export EDGE_CHROMIUM_EXECUTABLE
```

Retain the image identity and version output with the job logs, and verify the
reported versions against the CI configuration's pins. Each runtime smoke
report also records the versions actually executed. Missing or unusable tools
fail these steps and the relevant smoke command; they are not skipped passes.
Linux is the recorded validation platform. The subprocess cleanup limits for
other platforms are described in [native smoke](runtime-smoke.md) and
[web smoke](web-smoke.md).

## Compatibility jobs

Run these as separate required jobs or separate required steps with their own
failure statuses. If jobs share one checkout, serialize them: builders replace
their target output directories. Independent jobs may use independent
checkouts. All jobs must test the same source revision and lockfile.

The build and test job uses the installed browser to enable the ordinary test
suite's real-browser cases. Without `EDGE_CHROMIUM_EXECUTABLE`, those cases
are explicitly skipped, so a plain `npm test` is not the full browser suite.
Native Deno and Bun HTTP checks are separate commands and must run serially
with the example port free; their executable arguments are paths, not shell
command strings. See [the HTTP guide](http.md#deno-and-bun).

```sh
set -eu
: "${EDGE_CHROMIUM_EXECUTABLE:?Enable the real-browser tests}"
: "${EDGE_DENO_EXECUTABLE:?Provision Deno}"
: "${EDGE_BUN_EXECUTABLE:?Provision Bun}"
export EDGE_CHROMIUM_EXECUTABLE
npm --prefix edge run typecheck
npm --prefix edge test
npm --prefix edge run build
npm --prefix edge run smoke:node
node edge/scripts/check-http-runtime.mjs deno "$EDGE_DENO_EXECUTABLE" \
  > edge/results/http-deno.json
node edge/scripts/check-http-runtime.mjs bun "$EDGE_BUN_EXECUTABLE" \
  > edge/results/http-bun.json
npm --prefix edge run build:wasm
npm --prefix edge run check:isolation
```

The native parity job runs the full default Node, Deno and Bun selection:

```sh
set -eu
node edge/scripts/smoke-runtimes.mjs \
  --deno "$EDGE_DENO_EXECUTABLE" --bun "$EDGE_BUN_EXECUTABLE" \
  > edge/results/runtime-smoke.json
```

The web parity job runs the full default Node, Workers and browser selection:

```sh
set -eu
node edge/scripts/smoke-web.mjs --browser "$EDGE_CHROMIUM_EXECUTABLE" \
  > edge/results/web-smoke.json
```

Both parity jobs compare full synthetic results with the freshly built Node
reference, including binary64 bits and Dates. HTTP checks alone do not establish
this parity. The retained [native report](evidence/m6-runtimes.json) and
[web report](evidence/m7-web.json) contain exact mismatches in their measured
Deno, Bun and Chrome runs. Those runs are failing gates. Local workerd coverage
does not establish deployed Cloudflare behavior. Keep mismatches failing:
rounding results, narrowing the required runtime selection or accepting an
expected failure would change the compatibility requirement.

The isolation check uses a root packing dry run with lifecycle scripts
disabled. It checks edge exclusion and local file rules without producing an
archive. It does not replace the repository's package-content gate, which needs
root `dist/`. Run that gate in its existing engine job; do not create root build
output in an edge job.

## Serial performance job

Use a controlled runner reserved for measurement. Wait for the compatibility
jobs to pass, then stop build, browser, test and profiling processes before
starting timings. Avoid concurrent benchmark jobs on the same host. Reinstall
the edge lockfile in an independent performance checkout if needed, then leave
the checkout unchanged throughout collection. A container image alone does not
control the host kernel, CPU allocation, frequency or contention.

Select a reviewed baseline for this exact runner and protocol before running
this job. The [initial development baseline](evidence/m9-node-baseline.json)
is evidence from its recorded local host, not a CI baseline to copy onto an
incompatible runner. The gate compares machine metadata, runtime, workload,
runner sources and build conditions. A changed host, kernel, runtime or
protocol requires fresh reviewed baseline evidence. Do not rename the machine
label or edit metadata to force a comparison.

The following uses the default protocol and the same three independent runs
as the initial baseline. That capture count is an option for this job, supported
by the retained baseline and
[`benchmark-baseline.check.mjs`](../tests/benchmark-baseline.check.mjs), not a
claim about statistical confidence. The selected CI baseline must contain the
same run count and protocol. Set `EDGE_BENCHMARK_MACHINE` to its public runner
label, `EDGE_BENCHMARK_BASELINE` to its committed path below
`edge/docs/evidence/`, and `EDGE_REGRESSION_PERCENT` to the reviewed policy
threshold. The gate's default is `10` percent, a policy choice enforced by
[`benchmark-gate.check.mjs`](../tests/benchmark-gate.check.mjs), not a measured
noise allowance. The variable below makes that choice explicit.

```sh
set -eu
: "${EDGE_BENCHMARK_MACHINE:?Set the reviewed public runner label}"
: "${EDGE_BENCHMARK_BASELINE:?Set the reviewed baseline path below edge/docs/evidence/}"
: "${EDGE_REGRESSION_PERCENT:?Set the reviewed regression threshold}"
mkdir -p edge/results
for run in 1 2 3; do
  node edge/scripts/benchmark.mjs --machine "$EDGE_BENCHMARK_MACHINE" \
    > "edge/results/candidate-$run.json"
done
node edge/scripts/benchmark-baseline.mjs \
  edge/results/candidate-1.json edge/results/candidate-2.json \
  edge/results/candidate-3.json > edge/results/candidate.json
node edge/scripts/benchmark-gate.mjs \
  --baseline "$EDGE_BENCHMARK_BASELINE" \
  --candidate edge/results/candidate.json \
  --threshold-percent "$EDGE_REGRESSION_PERCENT" \
  > edge/results/performance-gate.json
```

Invoke the benchmark without Node CLI flags or `NODE_OPTIONS`; the runner
refuses them. Each loop iteration starts a fresh process. The compactor retains
every run and the gate compares medians of run medians. This measures the
Workers-configured bundle executing in Node, not native Workers, Deno, Bun or
browser performance. See [benchmark scope and capture](benchmarks.md) and
[comparison rules and exit statuses](performance-gate.md).

## Preserve failures and review evidence

Use each command's exit status as the job verdict. Direct `node` invocations
keep npm banners out of captured JSON. Redirection can leave an empty report
on failure; its existence is not success. Configure the CI artifact upload
step to run even after failure, with the provider's `always` or equivalent
condition, and retain `edge/results/` plus job logs. Uploading a report must not
replace the failed step's status. Do not add `continue-on-error` or an
unconditional success after a smoke or performance command. If reports are
piped through a logger, use a shell with `pipefail` enabled.

The performance gate distinguishes a timing regression from malformed or
incompatible evidence; both fail CI. Preserve its returned status and diagnostic
stderr. Compatibility failures remain independent required failures even if
performance passes. Keep generated bundles, browser profiles, downloaded tools
and raw results in their ignored edge directories, not committed evidence.

For a first CI baseline or an intentional refresh, decide the host, runtime,
protocol, run count and threshold before collection. Follow the complete
[baseline capture procedure](benchmarks.md#capturing-a-baseline) on that host,
review the compact output, and add it as a new named evidence file under
`edge/docs/evidence/`. Record the reason, source identity, environment and full
capture set in the review. Preserve old evidence. Update the CI baseline path
only through review; never automatically overwrite it after a regression,
select only fast runs, or substitute the candidate as its own baseline. The
gate refuses reused raw runs and overlapping measurement intervals.

The WASM compiler and parity checks belong in the build and test job above.
Profiling and `wasm:evaluate` are separate, serial investigations under the
[WASM procedure](wasm.md), outside the performance-gate timing job. A completed
experiment may exit successfully with a `rejected` decision; that exit status
means the experiment completed, not that WASM was accepted. The retained
experiment did not meet its whole-workload acceptance rule, so the ordinary
bundles continue using JavaScript. Repeating an experiment or changing its
translation requires fresh reviewed exact and timing evidence before enabling
any runtime option.
