# Edge and browser work plan

All implementation, dependencies, configuration, evidence and generated output
belong under `edge/`. Read repository instructions before each session. Leave
the engine source, root package, release archives and root `dist/` unchanged.
Use synthetic inputs only. Runtime parity is a compatibility check, not an
astronomical accuracy claim. Do not round away runtime differences.

Complete the next unchecked milestone, run its checks, tick it and append a
single session summary to `CHANGES.txt`. The harness owns all git mutations.

- [x] M1 Create a private isolated toolchain, shared synthetic chart, houses and transit-scan workloads, a Node reference build and smoke tests. Verify dependencies match the engine and generated files stay local.
- [x] M2 Add reproducible esbuild configurations for Cloudflare Workers, Deno, Bun and browser ESM, with graph checks, file-size limits, source digests and preserved licence notices.
- [x] M3 Add a Cloudflare module Worker example with bounded request validation, explicit calculation errors and local request/response tests.
- [x] M4 Add Deno and Bun HTTP examples using the shared request contract, plus runtime-specific launch instructions and handler tests.
- [x] M5 Implement an exact comparison protocol for full results, including dates and binary64 values, with mismatch paths and tests for differences JSON would hide.
- [x] M6 Run Node, Deno and Bun smoke cases through that protocol; record runtime versions and fail required-runtime checks on missing tools, process errors or any unequal output.
- [x] M7 Extend smoke checks to a local Workers runtime and a real browser ESM page; verify imports and handlers without network access during calculations and report exact parity failures honestly.
- [ ] M8 Add chart, houses and transit-scan micro-benchmarks with warmup, repeated samples, consumed results, workload identity and machine/runtime/build provenance; keep raw runs in ignored folders.
- [ ] M9 Capture and commit compact baseline evidence from the benchmark runner, documenting its host, runtime, sample protocol and limits; keep raw generated data ignored.
- [ ] M10 Add a CI-ready performance gate with a configurable regression threshold, comparable-baseline validation and tests for regressions, malformed data and missing workloads.
- [ ] M11 Profile numeric kernels and evaluate an isolated WASM compilation path against JavaScript with identical synthetic workloads; record compilation and call overhead, exact-result checks and measured benefits or rejection. Enable a WASM option only if it measurably helps.
- [ ] M12 Document reproducible setup, runtime support and failures, benchmark refresh rules, WASM findings and CI wiring examples entirely under edge; run the complete edge checks and verify package isolation.

## Validation policy

Use Node 22 for reference tests and measurements. Pin build dependencies under
this directory and keep the ephemeris version equal to the engine's pin.
Do not install dependencies or build output in the repository root. Run the
repository package-content check when possible; if it requires missing root
build output, record that limitation and inspect the dry-run packing list for
edge leakage without creating a package archive.

Every milestone must describe its actual validation. A runtime absent from the
host is untested, never a pass. Baseline numbers require committed measurement
scripts and compact evidence under `edge/docs/evidence/`. Tests and reports
must not use external ephemeris comparisons. Documentation uses no em dashes.
