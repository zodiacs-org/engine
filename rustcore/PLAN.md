# Rust numeric core plan

This workspace ports the numeric path of the checked-out TypeScript engine.
All implementation, tooling, tests and evidence stay inside `rustcore/`.
The TypeScript engine is the parity reference, not an independent accuracy
reference. Do not run Swiss Ephemeris or JPL comparisons for this project.

Implement the next unchecked milestone, run its checks, mark it complete and
append a session summary to `CHANGES.txt`. Stop after one or two milestones.
The external harness owns commits, pushes and the draft pull request.

- [x] M1 Create an isolated Cargo workspace with a safe native library, a wasm-bindgen adapter, a thin TypeScript loader, reproducible build scripts and a real WASM parity smoke test for `normalizeLongitude`. Record setup and current parity scope.
- [x] M2 Port angular arithmetic, sign annotations, date validation and Julian date helpers with native tests and bit-level WASM comparisons on synthetic boundary inputs.
- [x] M3 Port the Delta T model and UTC/UT1/TT time basis, preserving table provenance, licences, discontinuities and pinned overrides. Generate any Rust tables from checked source inputs into ignored build folders.
- [x] M4 Port nutation, precession, frame rotations, obliquity and apparent sidereal time. Test the same numeric operation order and document explicit angular tolerances against the TypeScript functions.
- [x] M5 Port the pinned astronomy-engine solar and planetary series needed for geocentric vectors, light time and aberration to Rust. Preserve MIT attribution and coefficient provenance; no JavaScript callbacks in the Rust calculation path.
- [x] M6 Port the Moon position and state series, true lunar nodes and their finite differences. Compare synthetic instants and node wrap/station cases against the pinned TypeScript implementation.
- [x] M7 Port Pluto's required integration path and finish native planetary position assembly, longitude speeds, reference/span checks and sign metadata for every body returned by `positions`.
- [x] M8 Port angles, whole sign, equal, equal-MC, Vehlow, Porphyry, Meridian and Morinus cusps, plus `houseOf`, with northern, southern and polar synthetic cases.
- [x] M9 Port Placidus, Koch, Regiomontanus, Campanus, Topocentric and Alcabitius, preserving convergence rules, polar fallbacks and cusp ordering. Cover every supported house system.
- [ ] M10 Port legacy and configured aspects, exact binary64 expansion arithmetic, policy validation, minor/custom aspect sets, orb boundaries, motion classification and deterministic result ordering.
- [ ] M11 Complete WASM bindings and synchronous TypeScript function signatures for positions, time/coordinate helpers, houses and aspects after explicit initialization. Preserve result shapes and error behavior; add a browser loading smoke test and signature checks against relative engine imports.
- [ ] M12 Complete the Vitest parity corpus over synthetic dates from 1800 through 2200, polar latitudes, all house systems and aspect sets. Enforce bit equality where possible and quantity-specific tolerances otherwise; explain every deviation and coverage limit in `PARITY.md`.
- [ ] M13 Add Criterion native and Node WASM-versus-TypeScript benchmarks, commit baseline summaries and machine/toolchain descriptions, and finish usage/provenance docs. Keep raw generated benchmark/parity data ignored and check file sizes and package isolation.

## Acceptance rules

Each numeric milestone adds Rust unit tests and extends the WASM parity suite.
Preserve arithmetic evaluation order before considering optimizations. Do not
silently relax a tolerance to make a comparison pass. State units, the reference
function, tested span and the reason for every nonzero tolerance in `PARITY.md`.
Matching the engine measures compatibility only, not astronomical accuracy.

The TypeScript wrapper may reuse input types and JavaScript boundary validation;
the completed numeric implementation must execute in Rust for native and WASM
builds. Never substitute TypeScript ephemeris results for the Rust port.

Keep `target/`, `pkg/`, dependency caches, generated data and local toolchains
ignored. All files intended for git must remain below the user's file-size cap.
Retain attribution when translating existing code or data, including the
separate terms on Delta T values. Do not modify the repository's packed files,
engine source, root dependency locks, artifacts or release settings.
