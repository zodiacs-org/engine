# Rust and TypeScript parity

Reference: the checked-out engine's `src/signs.ts`, imported directly by
`tests/normalize.parity.ts`. The tests execute the release WASM built from
`crates/wasm` and `crates/core`; they do not substitute a TypeScript
implementation. Passing means compatibility on the tested inputs, not
independent astronomical accuracy.

## Current acceptance

| Quantity or behavior | Requirement | Enforcing test |
| --- | --- | --- |
| Normalized longitude, degrees | Identical binary64 bits, including the sign of zero; tolerance 0 arcseconds | `tests/normalize.parity.ts`, finite boundary and deterministic corpus cases |
| Nonfinite longitude and non-number JavaScript input | Same `RangeError` class and message, without coercion | `tests/normalize.parity.ts`, invalid input cases |
| Native normalized longitude | Exact binary64 expectations for synthetic cases | `crates/core/src/lib.rs`, unit tests |
| Loading | Explicit initialization, retry after invalid bytes, reuse on repeated initialization | `tests/loader.parity.ts` |

The corpus combines explicitly listed wrap boundaries, signed zeros, fractional
degrees, subnormals and finite extremes with seeded binary64 bit patterns. Its
generator, seed and span are in the enforcing test. Longitude normalization has
no date or latitude input, so no temporal or geographic coverage is claimed.

## Rounding and deviations

No numeric deviation is permitted for the currently implemented function.
Rust retains the exact evaluation order `((lon % 360) + 360) % 360`, including
its intermediate rounding. A value just below a full turn can round to zero
after adding a turn. Very small magnitudes also round to positive zero. These
are existing reference behaviors, explicitly exercised in the native and WASM
tests; replacing the expression with Euclidean remainder would change them.

The wrapper adds an explicit initialization requirement because WASM must be
loaded before synchronous calculations. After initialization, the implemented
numeric signature and error behavior match the TypeScript function. Native
Rust reports invalid input through `Result`, while WASM constructs the
JavaScript error. The wrapper also retains the reference's rejection of
non-number JavaScript values before wasm-bindgen can coerce them.

## Remaining coverage

The full synthetic date span from 1800 through 2200, polar latitudes, every
house system and legacy/configured/minor/custom aspect sets remain planned
work. Positions, speeds, time scales, coordinate rotations, cusps, house
membership and aspects are not implemented or compared yet.

Each later numeric milestone must add its quantity, units, reference, tested
span and acceptance rule here. Exact decisions, flags and ordering require
exact comparisons; any nonzero numeric tolerance must have a specific reason
and a test that enforces it. Use arcseconds for angular coordinate errors,
arcseconds per day for angular speeds, and seconds for time differences.
Document measured deviations without presenting parity as an accuracy check.
