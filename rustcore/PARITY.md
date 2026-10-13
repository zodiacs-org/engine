# Rust and TypeScript parity

References: the checked-out engine's `src/signs.ts`, angular helpers in
`src/aspects.ts`, `src/points.ts` and `src/window-ranges.ts`, `src/date-input.ts`
and `src/civil-calendar.ts`, plus `src/deltat.ts`, `src/time-scale.ts`,
`src/nutation.ts`, `src/frame.ts`, `src/equator.ts`, `meanObliquity` in
`src/houses.ts` and `gastHours` in `src/ephemeris.ts`, plus the installed,
pinned astronomy-engine series, lunar state and light-time functions used
by the engine, and the lunar branches of `src/ephemeris.ts`.
The parity tests import those sources directly
and execute the release WASM built from `crates/wasm` and `crates/core`.
Passing means compatibility on the tested inputs, not independent astronomical
accuracy. The engine and its pinned dependency are the only numeric references
for this port.

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
| Sun and Mercury through Neptune, including Earth: heliocentric, geocentric and backdated Cartesian components | Absolute difference at most 2e-12 AU per component | `tests/planets.parity.ts`, against astronomy-engine `HelioVector`, `GeoVector`, `BackdatePosition` |
| Heliocentric Cartesian velocities | Absolute difference at most 2e-14 AU per TT day per component | `tests/planets.parity.ts`, against astronomy-engine `HelioState` |
| True-ecliptic longitude and latitude of nonzero heliocentric and geocentric vectors of implemented bodies | Circular longitude and absolute latitude difference at most 1e-7 arcseconds | `tests/planets.parity.ts`, against the pinned vectors transformed by `src/frame.ts` |
| Backdated emission UT1 and TT | Absolute difference at most 2e-6 seconds, after subtracting J2000 day values | `tests/planets.parity.ts`, against astronomy-engine `BackdatePosition` on a fixed Delta T clock |
| Sun heliocentric position/state, Earth geocentric position and coincident-body vectors on coherent clocks | Identical binary64 zero bits; tolerance 0 AU and 0 AU/day | `tests/planets.parity.ts` |
| Moon EQJ Cartesian vector and state position | Absolute difference at most 2e-17 AU per component | `tests/moon.parity.ts`, against astronomy-engine `GeoMoon` and `GeoMoonState` |
| Moon EQJ finite-difference velocity | Absolute difference at most 2e-12 AU/day per component | `tests/moon.parity.ts`, against astronomy-engine `GeoMoonState` |
| Moon true-ecliptic longitude and latitude | Circular longitude and absolute latitude difference at most 1e-7 arcseconds | `tests/moon.parity.ts`, against `GeoMoon` transformed by `src/frame.ts`, and the engine's lunar longitude |
| True north/south node longitude | Circular difference at most 0.005 arcseconds | `tests/moon.parity.ts`, against the engine's orbit-plane construction |
| Moon longitude speed | Absolute difference at most 1e-4 arcseconds/day | `tests/moon.parity.ts`, against the engine's central difference |
| True north/south node longitude speed | Absolute difference at most 0.02 arcseconds/day | `tests/moon.parity.ts`, against the engine's central difference |
| Lunar state midpoint and derivative on identical supplied sample vectors; South Node offset on the port's North Node longitude | Identical binary64 bits; tolerance 0 for this arithmetic | `tests/moon.parity.ts`, short-difference reconstruction and node normalization |
| Lunar TT span acceptance and outer speed-sample refusal | Exact accepted/refused outcomes and reference span error message | `tests/moon.parity.ts`, pinned TT endpoint and outside probes |
| Native arithmetic, signs, date validation and calendars | Exact regression expectations and calendar round trips | Unit tests in `crates/core/src/{lib,angles,signs,date_input,calendar}.rs` |
| Native time model and clock conversion | Table knot checks, segment/uncertainty boundaries, finite synthetic scan, leap seconds and pins | Unit tests in `crates/core/src/{deltat,time_scales}.rs` |
| Native frame kernels | Series-prefix algebra, clock separation, right-handed rotations, matrix order, inverse rotations, vector scale and nonfinite behavior | Unit tests in `crates/core/src/{nutation,frame,equator}.rs` |
| Native solar and planetary kernels | Series algebra and derivatives, vector/state consistency, correction geometry, clock reconstruction and bounded solver behavior | Unit tests in `crates/core/src/planets.rs` |
| Native lunar kernels | Harmonic recurrence, spherical/vector rotation round trip, state-clock reconstruction, angular-momentum orientation, circular difference endpoints and time-basis seams | Unit tests in `crates/core/src/{moon,lunar}.rs` |
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

`tests/planets.parity.ts` compares astronomy-engine's Sun and VSOP bodies
(Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune) on monthly
synthetic instants in every year from 1800 through 2200, the span endpoints,
J2000 and a seeded timestamp corpus. It compares heliocentric position and
analytic velocity, geocentric vectors with and without aberration, and both
kinds of nonzero vector transformed to the true ecliptic of date. The
geocentric path also compares the Rust time basis with the engine's.

Separate cases visit the Delta T model seam, every leap-second change, the
IERS series boundaries and leap-list expiry, at the boundary and adjacent
milliseconds, on UTC, UT1 and TT, with and without signed and nonzero pins.
They compare backdated vectors and emission clocks as well as geocentric
vectors. Every implemented observer-target pair is compared at synthetic
century dates from 1800 through 2200 in both correction modes. J2000-neighbor
TT inputs, exact origin zeros, repeatability after intervening calls, split
clocks and invalid wrapper inputs are exercised separately. The tests inspect
WASM imports and install a throwing JavaScript Delta T callback to guard
against numerical delegation to the reference dependency.

`tests/moon.parity.ts` compares monthly and seeded synthetic instants from
the start of 1800 through the end of 2200, plus J2000. It covers the lunar
EQJ vector, differenced state, true-ecliptic coordinates, both true nodes
and their longitude speeds. UTC longitudes and speeds use the engine's
exported `bodyLongitude` and `longitudeSpeed` directly. Scale-aware
comparisons reproduce their private orchestration using original reference
functions, with bit-level checks against those exports on UTC cases.

The lunar suite visits the model seam, leap-second changes, IERS table and
prediction boundaries and leap-list expiry, including adjacent milliseconds,
UTC/UT1/TT inputs and signed/zero/nonzero pins. It also checks TT labels
inside represented leap seconds. Split clocks and adjacent binary64 inputs
exercise the distinction between the supplied TT and the TT reconstructed
by the state samples. A throwing JavaScript Delta T callback checks that
the WASM lunar calculations never delegate to the reference.

Node wrap cases are selected by a TypeScript scan with 32-day steps from
1800 through 2200. Station cases use daily samples in the first 90 days of
each decade in that span. Detected brackets are narrowed to adjacent
milliseconds and sampled at offsets through a day on either side. These
are compatibility probes around the reference's noisy boundaries, not a
complete event search or agreement on the exact instant of each crossing.
Separate cases test invalid wrapper inputs and reference span endpoints;
span-edge cases compare acceptance, not numeric parity outside the corpus.
The corpus generation, offsets and tolerances are enforced by that test.

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

The planetary port keeps astronomy-engine's ordered VSOP summation,
per-polynomial-order longitude remainder, spherical-to-Cartesian projection,
fixed J2000 rotation, and analytic derivatives. Generated coefficients use
binary64 bit patterns, so Rust reads the exact doubles parsed from the pinned
JavaScript literal; [planet-data.check.mjs](scripts/planet-data.check.mjs)
enforces that translation and the pinned source identity. Cosine, sine and
the light solver's vector norm can still round differently across runtimes.
The AU, AU/day and angular allowances above apply to the resulting finite
quantities on the stated corpus. They are compatibility thresholds, not
physical accuracy estimates or guarantees outside those samples.

Light time retains the reference's fixed-point loop, its strict convergence
test and its one-light-day distance refusal. With aberration enabled it
backdates both the observer and target; otherwise it keeps the observer at
observation time. As `src/ephemeris.ts` does, each sample freezes its Delta T
for the whole solve. The initial iteration uses the supplied TT, and each
subsequent iteration computes `(observationUT1 - lightDays) + deltaT / 86400`.
It does not simply subtract light time from the previous TT or recompute a
changing UTC time basis. Returning the last evaluated vector, instead of
reevaluating at the newly converged time, also follows the reference.

The emission-time allowance accounts for binary64 day rounding in the norm
and subsequent clock subtraction. It is separate from the solver's own
convergence test. `backdatePosition` returns the vector's evaluated emission
clock. `geoVector` returns vector components alone, with the observation
clock already supplied by its caller. There is no mutable global Delta T
function in the Rust implementation.

The M5 planetary exports are intermediate kernels, not replacements for the
engine's public `positions` signature or astronomy-engine's classes and broad
body API. The wrapper requires finite numeric clocks, literal supported body
names and a boolean correction switch. Unlike the reference's unchecked
mutable AstroTime fields, nonfinite clock fields are explicitly refused;
native light-time calculations also reject nonfinite vectors as soon as they
are evaluated.
Finite inconsistent initial UT1/TT/Delta T clocks are accepted to preserve the
reference's initial-time versus `AddDays` behavior. The native heliocentric
functions are unchecked arithmetic helpers; validate their TT at the caller.
The wrapper returns plain records and RangeError for refused inputs or failed
solves. It does not yet provide public date validation, reference flags,
ephemeris-span checks or all-body position assembly; those are later
milestones. These planetary-series exports accept only their listed bodies;
the Moon uses the separate lunar exports, and Pluto still fails explicitly.
Other observer-target coincidences can make angular
coordinates ill-conditioned; the angular limits here apply to the tested
nonzero heliocentric and Earth-centered corpus only.

The Moon port preserves the pinned dependency's ordered harmonic recurrence,
solar perturbation and latitude summation, fractional-turn reduction and
radius conversion. Its private Horner mean-obliquity polynomial and separate
inverse-precession rotation follow `GeoMoon` exactly in arithmetic order.
The engine's expanded obliquity polynomial and combined frame matrix are
still used when turning that EQJ vector to the engine's ecliptic of date.
Replacing the first rotation with a transpose of the combined matrix would
change rounding before taking the state difference, so the two paths remain
separate. Trigonometric functions can round differently in V8 and Rust/WASM,
motivating the explicit AU and angular allowances above.

`GeoMoonState` is preserved as a difference over plus/minus 1e-5 day,
not replaced with an analytic derivative. Each sample reconstructs TT as
`(ut +/- 1e-5) + deltaT / 86400`. Its position is the sample average.
The node is formed from position crossed with velocity, projected onto
the mean ecliptic, and rotated by nutation in longitude. Subtraction over
the short state interval amplifies vector roundoff, and the shallow orbit
inclination further amplifies errors in the node direction. This is why
the node longitude has its own acceptance limit instead of sharing the
Moon-position limit. These limits were fixed before the first lunar WASM
comparison, with separate longitude-speed limits for errors at both samples.

Moon speed uses plus/minus 0.001 day and node speed plus/minus 0.25 day,
as `src/ephemeris.ts` does. Each outer sample resolves a fresh time basis
and freezes its Delta T for the inner state difference. The elapsed interval
changes to TT when the reference's time-basis piece changes. A South Node
longitude is the normalized North Node plus 180 degrees; its standalone
speed is independently differenced, as `longitudeSpeed` does, so it need
not have identical bits to the North Node speed. Complete position rows
will copy the North Node speed to both rows, matching `computeBodies`.

Near a node station, allowed speed roundoff can change the sign of a
nearly zero speed. The parity tests require identical signs outside the
documented speed allowance and enforce the numeric limit everywhere.
Near a longitude wrap, a small circular difference can put the two values
on opposite sides of zero. This milestone does not claim exact node motion
or sign-boundary decisions in those neighborhoods. It preserves the source
algorithm's jitter rather than smoothing it. Full row/flag parity remains
subject to the later position and corpus milestones.

To report measured maxima and near-boundary disagreements for the current
runtime, run `RUSTCORE_PARITY_REPORT=1 npm run test:parity -- tests/moon.parity.ts`
from this workspace. That optional report does not change acceptance limits.

The lunar exports are intermediate helpers with finite clock validation and
plain result records, not astronomy-engine classes. Raw clock helpers do not
enforce the ephemeris span; the Date-based longitude helpers do, on each
outer sample. The dependency's internal short state samples remain unchecked
against that span, matching the engine. The wrapper rejects invalid Dates,
time-scale names and pins before WASM conversion; malformed object and
getter/proxy behavior is outside this low-level compatibility scope. The
native epoch-millisecond helpers expect caller-validated inputs. The current
tests use Node 22.22.2 and the pinned Rust toolchain; other runtimes have not
been checked for these tolerances.

## Remaining coverage

Pluto and complete position rows remain planned work, alongside house
parity over synthetic dates from 1800 through
2200, polar latitudes, every house system and legacy/configured/minor/custom
aspect sets. Cusps, house membership and aspect matching are not implemented
or compared yet. The civil Julian Day Number helpers do not apply
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
