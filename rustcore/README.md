# Rust numeric core

An isolated, experimental port of this checkout's numeric engine. The current
milestone builds a native Rust library and a real WebAssembly module and exposes
`normalizeLongitude(lon: number): number` through a TypeScript wrapper.
Planetary positions, houses, aspects and their supporting time/frame functions
remain in [PLAN.md](PLAN.md). This is not a replacement for the engine yet.

## Setup and checks

Use Node from the engine's supported Node 22 line and a rustup installation.
`rust-toolchain.toml` pins the compiler, components and WASM target. Both Cargo
manifests disable publication, and the local npm package is private.

From this directory:

```sh
npm ci
npm run setup:wasm
npm run build
npm test
npm run lint:rust
npm run check:isolation
```

`setup:wasm` installs the pinned toolchain locally and the exact wasm-bindgen
CLI version from `Cargo.toml` under `.tools/wasm-bindgen/`. The CLI and crate must agree.
Build and test scripts use locked dependencies. `npm test` runs Cargo unit
tests, builds WASM, checks TypeScript signatures and runs the Vitest parity
suite. Native release builds are a separate `build:native` step.

All Cargo downloads and npm caches stay in `.cache/`; native and WASM compiler
outputs stay in `target/`, and wasm-bindgen output stays in `pkg/`. These,
local toolchains and generated data are ignored. The scripts use rustup from
PATH, or a local rustup installed in `.cache/cargo/bin`, and always put
toolchains in `.tools/rustup`. For a sandbox without a writable home directory, install rustup
with `CARGO_HOME` set to this directory's `.cache/cargo`, `RUSTUP_HOME` set to
`.tools/rustup`, and `--no-modify-path`. Do not change the repository root's
dependencies or build its `dist/` for this project.

The build uses wasm-bindgen's `web` output so the same module can be explicitly
initialized with bytes in Node or a browser. The local reference dependency is
the engine's exact astronomy-engine version; Vitest resolves relative engine
sources to it without a root install. Tests use the `.parity.ts` suffix and this
directory's explicit Vitest configuration, so the root suite does not discover
tests requiring an unbuilt WASM module.

## TypeScript use

After `npm run build:wasm`, a Node TypeScript caller can use:

```ts
import { readFileSync } from "node:fs";
import { initRustCore, normalizeLongitude } from "./ts/index.js";

initRustCore(readFileSync(new URL("./pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
const longitude = normalizeLongitude(-15);
```

For a browser, supply an ArrayBuffer obtained from your own asset loader, or a
compiled `WebAssembly.Module`. The wrapper makes no network requests and
does not initialize WASM at import time. Initialization is synchronous and
repeated successful calls reuse the instance. Calls before initialization throw;
invalid WASM bytes do not mark the wrapper ready, so loading can be retried.
The browser integration test belongs to the wrapper milestone in the plan.

## Native use

The workspace member `crates/core` exposes `normalize_longitude(f64)` returning
`Result<f64, LongitudeError>`. It rejects nonfinite inputs and preserves the
TypeScript evaluation order. The WASM crate translates that error into the same
JavaScript `RangeError` as the engine.

## Parity and provenance

[PARITY.md](PARITY.md) records current coverage and acceptance rules, enforced
by [the parity tests](tests/normalize.parity.ts) and the native unit tests in
[the core crate](crates/core/src/lib.rs). These compare implementations and do
not establish astronomical accuracy. All inputs are synthetic. Benchmarks and
performance claims wait for the benchmark milestone.

The port's code is MIT under the repository's [LICENSE](../LICENSE).
`normalize_longitude` translates [src/signs.ts](../src/signs.ts), preserving
its validation and expression order. No ephemeris coefficients or time tables
are copied at this milestone. Future translations must retain their sources'
notices and data terms, including the separate Delta T attribution described
in [LICENSING.md](../LICENSING.md). Nothing here enters the root npm package;
`check:isolation` checks npm's actual file listing without running prepack.

The root `npm run package:contents` gate was also attempted during the initial
milestone. It stops at the missing `dist/calc.d.ts` because this checkout has
no root build output. This workspace's isolation check passes independently;
the root package gate still needs a built engine checkout in the normal CI.
