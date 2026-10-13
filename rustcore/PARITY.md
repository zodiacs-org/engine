# Rust and TypeScript parity

References: the checked-out engine's `src/signs.ts`, angular helpers in
`src/aspects.ts`, `src/points.ts` and `src/window-ranges.ts`, `src/date-input.ts`
and `src/civil-calendar.ts`, plus `src/deltat.ts`, `src/time-scale.ts`,
`src/nutation.ts`, `src/frame.ts`, `src/equator.ts`, `meanObliquity` in
`src/houses.ts` and `gastHours` in `src/ephemeris.ts`.
The parity tests import those sources directly
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
| Delta T model seconds in the spline, long-term and extrapolated branches | Absolute difference at most 1e-12 seconds on the tested corpus | `tests/time.parity.ts`, model comparisons |
| Delta T model uncertainty in the forecast power branches | Absolute difference at most 1e-14 seconds when years since the last observed knot are greater than 0 and at most 10 | `tests/time.parity.ts`, model comparisons |
| All other Delta T seconds and uncertainty, including table interpolation, IERS and pins | Identical binary64 bits; tolerance 0 seconds | `tests/time.parity.ts` |
| UTC epoch milliseconds, UT1/TT days since J2000 and elapsed intervals | Identical binary64 bits; tolerance 0 seconds | `tests/time.parity.ts`, time-basis and elapsed-day comparisons |
| Time provenance, leap counts, listed flags, basis/segment choices and metadata values | Exact fields; immutable wrapper metadata caveat below | `tests/time.parity.ts` |
| Delta T input rejection | Same RangeError class and message, without JavaScript coercion | `tests/time.parity.ts` |
| Nutation tables, frame input TT and nutation node argument in radians | Identical binary64 bits and exact multiplier string | `tests/frame.parity.ts` |
| Nutation in longitude/obliquity and equation of the equinoxes | Absolute difference at most 1e-12 arcseconds | `tests/frame.parity.ts`, full series and prefix comparisons |
| Mean and true obliquity | Absolute difference at most 1e-10 arcseconds; mean obliquity bit-exact on the tested dyadic centuries | `tests/frame.parity.ts` |
| Apparent sidereal angle | Circular difference at most 1e-8 arcseconds, converting returned hours to degrees | `tests/frame.parity.ts`, UT1/TT and pinned-clock comparisons |
| Mean/true ecliptic/equator matrix entries | Absolute difference at most 2e-15, dimensionless | `tests/frame.parity.ts` |
| Matrix-vector multiplication on identical supplied rows | Identical binary64 bits for non-NaN results, including signed zero; no numeric tolerance | `tests/frame.parity.ts`, supplied and shared matrix comparisons |
| Rotation with independently computed matrices | Each component divided by max(1, sum of absolute input components) differs by at most 8e-15 | `tests/frame.parity.ts` |
| True-ecliptic longitude and latitude on the general-vector corpus | Circular longitude and absolute latitude difference at most 1e-8 arcseconds; all reference latitudes below 89 degrees in magnitude | `tests/frame.parity.ts` |
| Near-ecliptic-pole vectors constructed at latitude magnitudes 89.999 and 89.999999 degrees | Longitude difference at most 0.05 arcseconds and latitude difference at most 0.02 arcseconds, only for the separate corpus below | `tests/frame.parity.ts`, near-pole cases |
| Native arithmetic, signs, date validation and calendars | Exact regression expectations and calendar round trips | Unit tests in `crates/core/src/{lib,angles,signs,date_input,calendar}.rs` |
| Native time model and clock conversion | Table knot checks, segment/uncertainty boundaries, finite synthetic scan, leap seconds and pins | Unit tests in `crates/core/src/{deltat,time_scales}.rs` |
| Native frame kernels | Series-prefix algebra, clock separation, right-handed rotations, matrix order, inverse rotations, vector scale and nonfinite behavior | Unit tests in `crates/core/src/{nutation,frame,equator}.rs` |
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

`tests/time.parity.ts` compares the model and every input scale on a monthly
and seeded synthetic corpus from the start of 1800 through the end of 2200.
It also tests every spline, annual table, prediction and uncertainty knot,
adjacent representable values and offsets on either side. Additional model
cases exercise the ancient spline and long-term branch through year -5000,
and a later extrapolation case in year 3998. These are branch probes, not
coverage of that entire extended span or physical accuracy evidence.

The same test visits every decoded UT1 grid knot, adjacent doubles, nearby
millisecond timestamps and an interior point of each interval. It tests
uncertainty-grid and year boundaries, all leap-second changes, TT and UT1
inside each leap second, the leap list's expiry, and both ends of the IERS
table. Pinned Delta T cases include negative values, signed zero, subnormals
and nonfinite values. Mixed-scale and mixed-pin records exercise elapsed-day
branch decisions. The table metadata is compared in full against the imported
reference, including its source digests and expiry. The generator checks
are in `scripts/time-data.check.mjs`; provenance is in [PROVENANCE.md](PROVENANCE.md).

`tests/frame.parity.ts` uses quarterly synthetic instants in every year from
1800 through 2200, the endpoints of that span, J2000 and a seeded timestamp
corpus. It compares nutation, tilt, mean and true ecliptic/equatorial matrices,
their action on axes and general vectors, and the resulting spherical
coordinates. Every series prefix from zero through the full series is checked
at five-year steps in that span. The full native tables and wrapper metadata
are compared with the reference and source hashes are pinned by the test.

The separate near-pole corpus constructs EQJ vectors by transposing the
reference's mean-ecliptic rotation at the start of 1800, 1900, 2000, 2100 and
2200, from ecliptic longitudes 0, 47, 123 and 271 degrees and latitudes
plus/minus 89.999 and 89.999999 degrees. Both implementations receive the same
rounded input vector. These allowances apply only to those constructed cases;
exact output-pole longitude has no stable angular contract.

Sidereal cases use UTC, UT1 and TT time bases on the main corpus, with
additional signed and negative pins, leap-era boundary dates, and independently
shifted UT1/TT clocks. Supplied matrices exercise cancellation, signed zeros,
subnormals and overflow with exact comparisons. Nonfinite clocks, zero vectors,
invalid vectors and fractional/negative/NaN series counts check reference
outcomes separately. Positive-infinite term counts are refused without running
the nonterminating reference case.

## Rounding and deviations

No finite numeric deviation is permitted for the basic angular arithmetic and
civil-date helpers.
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
JavaScript and WASM execution and are not part of this numeric contract.
For quantities requiring exact bits, all other numbers, including infinities
and signed zeros, use binary64 comparisons. The NaN exception grants no finite
tolerance; transcendental frame quantities use their explicit limits above.

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

The Delta T spline uses exponentiation, and its long-term and extrapolation
branches use sine, cosine and exponential functions. The forecast uncertainty
uses fractional powers. Rust's native/WASM math implementation and V8's math
implementation can round those functions differently despite preserving the
surrounding arithmetic order. Only those model quantities receive the explicit
second-valued limits in the table above. In particular, the spline allowance
ends at model year 1941; annual/predicted knot interpolation stays exact through
the last prediction. Forecast uncertainty outside its power branches stays
exact. The tests choose allowances from the reference input and branch, never
from whether a comparison failed. These limits are compatibility requirements
on this corpus, not physical uncertainty bands or guarantees for untested dates
and runtimes. They were checked on Node 22.22.2 with the pinned Rust toolchain.

Time-basis UTC milliseconds and UT1/TT day values remain bit-exact on the
tested corpus, including when their Delta T records need the model allowance.
The model's seam at 1941, the reference's TT fixed-point iterations, its
table-edge selection rules and leap-second timestamp convention are retained.
The seam can change elapsed TT across samples; `elapsedDays` preserves that
decision and leaves the supplied interval untouched within one piece.
It does not repair the reference's clock conventions or smooth a discontinuity.

Time metadata exported by the wrapper is an immutable build snapshot. Unlike
the reference's shallowly frozen `UT1_DATA`, its nested `observedErrors` and
`predictedErrors` arrays are frozen too. Mutating the reference arrays can
change its uncertainty results; the port rejects that mutation and keeps its
compiled, digest-checked tables. The initial metadata values match exactly.
The test explicitly enforces this deviation rather than implying support for
runtime table editing. All time calculations themselves run in Rust.

The low-level time helpers accept number-valued inputs as in their declared
signatures; Delta T additionally rejects all nonfinite and non-number inputs
before WASM can coerce them. The time helpers' unchecked NaN/infinite inputs
and pins are compared by outcome and numeric classification, with the existing
NaN-payload exception. Time-scale names must be members of the declared union,
and elapsed-day inputs must be ordinary TimeBasis records. Getter/proxy access
order, invalid scale strings and malformed records are outside this low-level
compatibility scope. The public chart validation boundary remains future work.

The frame port retains the reference's scalar multiplication and addition
order, its full nutation series summed from smallest to largest term, and its
precession and equinox rotation order. Rust does not use fused multiply-adds
or substitute a different astronomical model. Sine, cosine, inverse trig and
power functions can round differently in Rust/WASM and V8. Mean obliquity
retains floating exponentiation for the reference's powers rather than
reassociating integer multiplications. These operations motivate the separate
angular and matrix limits; the arithmetic-only matrix products remain exact
when supplied the same rows.

The latitude calculation retains the reference's `asin(z / norm)` and no
clamp. Rust uses a max-scaled, compensated sum of three squares for the norm,
avoiding overflow and an extra intermediate square root from chained
two-argument `hypot` calls. JavaScript `Math.hypot` rounding is runtime-dependent.
Near an ecliptic pole, `atan2(y, x)` amplifies errors in the small horizontal
components, while `asin` amplifies norm roundoff near plus/minus one. That
conditioning requires the separate near-pole allowances; they are not a
larger allowance for ordinary planetary longitudes or a claim over all
possible vectors. The frame tests run on Node 22 with the pinned Rust
toolchain; other runtime versions remain to be checked.

The reference's exported nutation arrays and frame cache can be mutated at
runtime despite readonly return declarations. This port freezes wrapper
metadata, coefficients and cached frame records, and native tables are
constant. Table edits and cache mutation are unsupported. Direct repeated
`eclipticFrame` calls and `eclipticRows(..., "mean")` reuse a cached snapshot;
other frame functions compute inside Rust and do not update that wrapper cache.
Mixed-function object identity therefore differs from the reference, without
changing numeric output for unmodified inputs. Native calculations have no
shared cache. Array outputs from `turn` and independently computed rows remain
ordinary arrays, with the reference's field and element ordering.

The native integer-count `nutation` helper accepts a series prefix length.
`nutation_with_terms` preserves the reference's unusual numeric-count behavior
at the WASM boundary, including fractional array indices, truncated string
indices and NaN results. Positive infinity makes the reference loop forever;
the wrapper instead throws RangeError with an explicit message. This defensive
refusal is an intentional deviation. Counts at least 78 return NaN sums
immediately: the first out-of-table term already makes both sums NaN.
This also avoids nonterminating reference loops at very large finite counts,
where subtracting one leaves the binary64 value unchanged. The tests exercise
that port-only termination rule without calling the reference.
The remaining numeric helpers accept
ordinary number-valued inputs and complete matrix/frame records; arbitrary
objects, proxies, malformed records and invalid frame-kind strings are outside
this low-level scope.

## Remaining coverage

Planetary and house parity over synthetic dates from 1800 through 2200, polar
latitudes, every house system and legacy/configured/minor/custom aspect sets
remain planned work. Positions, speeds, cusps,
house membership and aspect matching are not
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
