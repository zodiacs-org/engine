# Rust and TypeScript parity

References: the checked-out engine's `src/signs.ts`, angular helpers in
`src/aspects.ts`, `src/points.ts` and `src/window-ranges.ts`, `src/date-input.ts`
and `src/civil-calendar.ts`. The parity tests import those sources directly
and execute the release WASM built from `crates/wasm` and `crates/core`.
Passing means compatibility on the tested inputs, not independent astronomical
accuracy. No external ephemeris is a reference for this port.

## Current acceptance

| Quantity or behavior | Requirement | Enforcing test |
| --- | --- | --- |
| Normalized longitude, degrees | Identical binary64 bits, including the sign of zero; tolerance 0 arcseconds | `tests/normalize.parity.ts`, finite boundary and deterministic corpus cases |
| Degree in sign, separation, wrapping, signed delta, advance, antiscia and midpoint, degrees | Identical binary64 bits for non-NaN results; tolerance 0 arcseconds | `tests/angles.parity.ts` |
| Sign index and metadata | Exact index and field values, frozen tables, stable identity within this wrapper | `tests/angles.parity.ts` |
| Nonfinite or non-number input to normalization and sign helpers | Same `RangeError` class and message, without coercion | `tests/normalize.parity.ts` and `tests/angles.parity.ts`, invalid input cases |
| Resolved instant, epoch milliseconds | Identical binary64 timestamps, including positive zero; tolerance 0 seconds | `tests/date-input.parity.ts` |
| Date validation and allocation | Same accepted syntax, rejection class/message, Date cloning and intrinsic timestamp extraction | `tests/date-input.parity.ts` |
| Julian Day Number, days; civil year/month/day fields | Identical binary64 bits for non-NaN fields; tolerance 0 days | `tests/civil-calendar.parity.ts` |
| Civil calendar parsing, formatting and conversion | Exact objects, strings and null results | `tests/civil-calendar.parity.ts` |
| Native arithmetic, signs, date validation and calendars | Exact regression expectations and calendar round trips | Unit tests in `crates/core/src/{lib,angles,signs,date_input,calendar}.rs` |
| Loading | Explicit initialization, retry after invalid WASM syntax, reuse on repeated initialization | `tests/loader.parity.ts` |

## Corpus

`tests/normalize.parity.ts` combines explicit wraps, signed zeros, fractional
degrees, subnormals and finite extremes with seeded binary64 patterns.
`tests/angles.parity.ts` adds sign boundaries from -1080 to 1080 degrees in
30-degree steps and their adjacent representable doubles, reversed argument
pairs, antipodal ties, the advance threshold and a seeded binary64 corpus.
Generators and seeds are committed in these tests and `tests/parity-helpers.ts`.
These helpers take no date or latitude.

`tests/date-input.parity.ts` checks every month from 1800 through 2200 inclusive
on candidate days 1, 28, 29, 30 and 31, as both a date-only input and the final
millisecond of the day; invalid month/day combinations must reject identically.
It compares seeded instants in that span as timestamps, Dates and ISO strings.
Separate cases cover the complete JavaScript Date range's endpoints and seeded
interior values, fractional milliseconds, astronomical year zero and years
below 100, expanded and negative years, UTC offset signs, offset-induced day
changes, and invalid syntax/types. These broader inputs check parsing only.

`tests/civil-calendar.parity.ts` uses the same monthly candidate dates in both
calendars and compares conversions, leap-year decisions, day numbers and civil
fields. It adds seeded day numbers over years 0000 through 9999, boundary
conversions that leave that range, negative years/day numbers that exercise
floor division, and unchecked fractional/nonfinite numeric fields. The native
calendar tests round-trip every day from 1800 through 2200 in both calendars.
Every input is synthetic; no personal birth data or ephemeris fixture is used.

## Rounding and deviations

No finite numeric deviation is permitted for the implemented helpers.
Rust retains the exact evaluation order `((lon % 360) + 360) % 360`, including
its intermediate rounding. A value just below a full turn can round to zero
after adding a turn. Very small magnitudes also round to positive zero. These
are existing reference behaviors, explicitly exercised in the native and WASM
tests; replacing the expression with Euclidean remainder would change them.
`separation`, `signedDelta` and `midpoint` subtract before wrapping, so finite
extreme inputs can overflow. The unchecked functions then return NaN; midpoint
rejects through the reference's finite-longitude check. Antipodal midpoint
selection depends on argument order. None of these cases is repaired or
mathematically rearranged in the port.

NaN results from unchecked arithmetic are compared by classification, with no
requirement on sign or payload. These representation details can change across
JavaScript and WASM execution and are not part of this numeric contract. All
other numbers, including infinities and signed zeros, use binary64 comparisons.
This exception does not grant a tolerance to finite values.

Date validation uses strict ASCII parsing and integer Gregorian arithmetic in
Rust. Numeric timestamps truncate toward zero only after the range check,
and both signed zeros become positive zero, matching JavaScript Date. Date-time
offsets are applied before testing the resulting instant's range. The JS wrapper
keeps error labels out of WASM string encoding, preserving even unpaired UTF-16
surrogates. Epoch milliseconds have no leap-second representation here.

The wrapper adds an explicit initialization requirement because WASM must be
loaded before synchronous calculations. After initialization, the implemented
numeric signatures match the TypeScript functions. Native Rust reports invalid
input through `Result` or `Option`, and the WASM/JS boundary constructs the
matching JavaScript errors and null results. The wrapper retains the sign
helpers' rejection of non-number JavaScript values before wasm-bindgen can
coerce them. Angular arithmetic and raw civil numeric helpers are compared
within their declared number-valued signatures; arbitrary objects, proxies
and out-of-type coercion are not a compatibility promise for those helpers.

Static sign labels live in frozen wrapper tables and in native Rust metadata.
`signForLongitude` selects its shared wrapper object using the Rust index. It
does not return the TypeScript engine's own object by identity. Object fields
and stable identity within each implementation are compared.

The public TypeScript `format` retains the reference's JS string-only formatting,
including unchecked numeric fields. Native `calendar::format` has a narrower
documented domain: finite integer years 0000 through 9999, months 1 through 12
and days 1 through 31. Calendar conversions only call it within those civil
field ranges and reject results outside the year range. The native tests
enforce this distinction. All calendar arithmetic and conversions run in Rust.

## Remaining coverage

Planetary and house parity over synthetic dates from 1800 through 2200, polar
latitudes, every house system and legacy/configured/minor/custom aspect sets
remain planned work. Positions, speeds, Delta T and UTC/UT1/TT time scales,
coordinate rotations, cusps, house membership and aspect matching are not
implemented or compared yet. The civil Julian Day Number helpers do not apply
astronomical time scales. No performance baseline is claimed at this milestone.

Initialization requires the matching generated WASM artifact. A valid module
with incompatible exports can leave the current wasm-bindgen singleton unusable
after a failed initialization; recovery then needs fresh wrapper and glue
instances. The retry test covers invalid WASM syntax only. Compatible-module
validation and browser integration remain part of the wrapper milestone.

Each later numeric milestone must add its quantity, units, reference, tested
span and acceptance rule here. Exact decisions, flags and ordering require
exact comparisons; any nonzero numeric tolerance must have a specific reason
and a test that enforces it. Use arcseconds for angular coordinate errors,
arcseconds per day for angular speeds, and seconds for time differences.
Document measured deviations without presenting parity as an accuracy check.
