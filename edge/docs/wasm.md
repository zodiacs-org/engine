# Measured WASM experiment

The nutation kernel has an isolated AssemblyScript compilation path. Its
measured end-to-end benefit did not meet the acceptance rule, so normal
Workers, Deno, Bun and browser bundles continue to use JavaScript. The
experimental build is for investigation, with no supported public WASM API.
See the [retained measurement](evidence/m11-wasm-experiment.json) and
[validation record](evidence/m11-validation.md).

## Reproduce

Use Node 22 and the edge-local locked dependencies, from the repository root:

```sh
npm ci --prefix edge --cache "$PWD/edge/.cache/npm"
mkdir -p edge/results
node edge/scripts/profile-kernels.mjs --machine local-linux-x64 \
  > edge/results/kernel-profile.json
node edge/scripts/build-wasm.mjs
node edge/scripts/evaluate-wasm.mjs --machine local-linux-x64 \
  > edge/results/wasm-experiment.json
node --test edge/tests/wasm.check.mjs edge/tests/wasm-evidence.check.mjs \
  edge/tests/profile-kernels.check.mjs
```

Use a public runner label, not a hostname or secret. Stop other benchmark or
test processes before capturing timings. The evaluator fixes its sample
protocol and benefit rule in `scripts/evaluate-wasm.mjs`; it exposes no option
to relax them after seeing a result. It exits successfully after a completed
experiment even when the decision is `rejected`. Compiler, parity or
measurement failures exit unsuccessfully. The existing
[performance gate](performance-gate.md) has its own CI exit-status contract;
this experiment does not change that gate or its baseline.

The [CPU profile](evidence/m11-kernel-profile.json) uses Node's inspector on
the shared synthetic workloads. It retains self and inclusive sample counts,
including runtime, consumption and profiler overhead. Counts are approximate
sampling observations. Module locations come from esbuild section markers;
reported line numbers belong to the generated bundle, not the original source.
No inspector session is active during the timing experiment.

## Compilation and substitution

`wasm/nutation.ts` translates the arithmetic loops in `src/nutation.ts`.
Tables are loaded from the unchanged engine at initialization. The adapter
imports the host's `Math.sin`, `Math.cos` and JavaScript remainder; it preserves
the original multiplication, addition and summation order. Fast math is not
enabled. Host transcendental differences therefore remain: this experiment
does not resolve the native-runtime mismatches recorded in earlier milestones.

The pinned AssemblyScript compiler uses its
[optimization and runtime options](https://www.assemblyscript.org/compiler.html),
with the [stub runtime](https://www.assemblyscript.org/runtime.html) and explicit
[host imports](https://www.assemblyscript.org/concepts.html#code-annotations).
The kernel uses fixed memory and allocates nothing during calls. The JS
adapter returns a fresh result object and checks its experimental input domain.
Tests enforce the imports, exports, fixed memory and exact result comparisons.

`scripts/build-wasm.mjs` writes only ignored `.generated/wasm/` output.
An esbuild hook substitutes the nutation function in memory for the experiment,
leaving its constants and the surrounding engine code intact. A source digest
blocks a stale translation after any change to the original module. Updating
that digest requires reviewing the translation and repeating validation.
The ordinary build has no hook or WASM import. The experiment emits separate
`javascript.mjs` and `wasm.mjs` workload bundles, `nutation.wasm`, and copies
the engine's licence and attribution records. Keep those records and the
dependency's inline MIT notice with any copied output.

To call the experimental bundle locally after building it:

```js
import { readFile } from "node:fs/promises";
import * as experiment from "./edge/.generated/wasm/wasm.mjs";

const bytes = await readFile("edge/.generated/wasm/nutation.wasm");
experiment.initializeKernel(new WebAssembly.Module(bytes), experiment);
console.log(experiment.chartWorkload());
```

Initialization is explicit and synchronous after module compilation. Calling
the replacement before initialization fails. The single instance's scratch
memory is reused synchronously, with only the captured host math imports
calling out. This is not a shared-memory or reentrant adapter.

## Measurement scope

The experiment uses paired alternating JS and WASM batches in the same Node
process. It measures complete chart, houses and transit-scan workloads, an
isolated kernel sweep, and an identity-call control. Each pair consumes results;
full result comparison happens outside timing. All warmup and measurement
durations are retained. Rounds share JIT and host state, so they are not
independent process replications or a statistical confidence interval.

Compiler-process time includes loading the compiler and writing the binary.
The initial observed `WebAssembly.Module` construction follows byte validation;
later compilation samples may reuse V8's cache. Instance startup includes
copying tables. The identity control includes the driver loop and checksum,
and JavaScript may inline it; it does not isolate a universal call cost.
Steady-state workload timings exclude compilation, startup, file reads and
network transfer. They are not deployment cold-start measurements.

Only the recorded Node runtime, processor and synthetic inputs were measured.
Kernel and full-result equality are compatibility checks against the unchanged
JavaScript engine, with no astronomical accuracy claim. A faster isolated
kernel is insufficient for enabling an application option. Any later candidate
needs fresh exact checks, whole-workload evidence and its target runtimes
measured before it is offered outside this lab.
