# Rust numeric core

An isolated, experimental port of this checkout's numeric engine. The native
library and WebAssembly module implement angular arithmetic, sign annotations,
resolved-instant date validation and Julian/Gregorian civil-calendar helpers.
The TypeScript wrapper retains the reference function signatures after explicit
initialization. Planetary positions, houses, aspect matching, time scales and
frame rotations remain in [PLAN.md](PLAN.md).

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

The wrapper also exports `signIndexForLongitude`, `signForLongitude`,
`degreeInSign`, the frozen sign tables, `separation`, `wrap360`, `signedDelta`,
`advance`, `antiscion`, `contraAntiscion` and `midpoint`. `dateFrom(input, label)`
returns a newly allocated Date after Rust validates and resolves the instant.
`parseCalendarDate`, `julianDayNumber`, `civilDateOf`, `format`,
`julianToGregorian` and `gregorianToJulian` mirror the civil-calendar module.
Their reference files, tested inputs and edge behavior are in [PARITY.md](PARITY.md).

For a browser, supply this build's WASM as an ArrayBuffer obtained from your own
asset loader, or as a compiled `WebAssembly.Module`. The wrapper makes no network requests and
does not initialize WASM at import time. Initialization is synchronous and
repeated successful calls reuse the instance. Calls before initialization throw.
Invalid WASM syntax does not mark the wrapper ready, so loading can be retried.
Recovery from a valid but incompatible module requires reloading the wrapper
and generated glue; always pair the generated glue with its matching WASM file.
The browser integration test belongs to the wrapper milestone in the plan.

## Native use

The workspace member `crates/core` exposes `normalize_longitude(f64)` and the
`angles`, `signs`, `date_input` and `calendar` modules. Fallible angular functions
return `Result<_, LongitudeError>`; the unchecked angular helpers propagate NaN
as the reference does. Date parsers return `Result<f64, DateError>` with epoch
milliseconds. Calendar string parsers and conversions return `Option`, and
`CivilDate` has numeric year, month and day fields.

Native date validation parses ISO syntax and resolves Gregorian calendar fields
and UTC offsets without calling JavaScript. The wrapper handles JavaScript input
types, Date allocation, error labels and string formatting. Native `calendar::format`
accepts finite integer civil fields within its documented range; the TypeScript
`format` also preserves the reference's unchecked JavaScript string formatting.

## Parity and provenance

[PARITY.md](PARITY.md) records current coverage and acceptance rules, enforced
by [the parity tests](tests/) and the native unit tests in
[the core crate](crates/core/src/). Dates are compared from 1800 through 2200,
with additional parser boundary cases; the exact corpus is in
[date-input.parity.ts](tests/date-input.parity.ts) and
[civil-calendar.parity.ts](tests/civil-calendar.parity.ts). These compare
implementations and do not establish astronomical accuracy. All inputs are
synthetic. Benchmarks and performance claims wait for the benchmark milestone.

The port's code is MIT under the repository's [LICENSE](../LICENSE).
The kernels translate [src/signs.ts](../src/signs.ts), the arithmetic helpers
of [src/aspects.ts](../src/aspects.ts), [src/points.ts](../src/points.ts) and
[src/window-ranges.ts](../src/window-ranges.ts),
[src/date-input.ts](../src/date-input.ts) and
[src/civil-calendar.ts](../src/civil-calendar.ts). Numeric operation order is
preserved; ISO parsing uses equivalent integer calendar arithmetic. The local
TypeScript sign table holds the reference's immutable labels, while Rust
calculates the index and degree and provides native sign metadata. No ephemeris
coefficients or time tables are copied yet. Future translations must retain their sources'
notices and data terms, including the separate Delta T attribution described
in [LICENSING.md](../LICENSING.md). Nothing here enters the root npm package;
`check:isolation` checks npm's actual file listing without running prepack.

The root `npm run package:contents` gate was also attempted during the initial
milestone. It stops at the missing `dist/calc.d.ts` because this checkout has
no root build output. This workspace's isolation check passes independently;
the root package gate still needs a built engine checkout in the normal CI.
