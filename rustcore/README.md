# Rust numeric core

An isolated, experimental port of this checkout's numeric engine. The native
library and WebAssembly module implement angular arithmetic, sign annotations,
resolved-instant date validation, Julian/Gregorian civil-calendar helpers,
the Delta T model, the UTC/UT1/TT time basis, nutation, precession,
frame rotations, obliquity, apparent sidereal time, solar and planetary
series and Pluto integration with light time and aberration, and the Moon and
true lunar nodes with longitude finite differences. It assembles complete
position rows with signs, degrees in signs, speeds and retrograde flags.
The TypeScript wrapper retains the implemented engine helpers' signatures after
explicit initialization and exposes intermediate planetary and lunar kernels.
Houses and aspect matching remain in
[PLAN.md](PLAN.md).

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
suite, including checks of the time, planetary, lunar and Pluto data generators. Native release builds are
a separate `build:native` step. Cargo also needs Node on PATH: its build script
generates time tables from digest-checked local engine sources and planetary
and lunar coefficients and Pluto states from the pinned dependency installed by this directory's `npm ci`.
Generation uses Node's built-in modules with no network requests. This crate
builds within this repository.

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

`deltaT(ut)` and `deltaTAt(ut)` take UT1 days since J2000 and return the
model's seconds or full provenance record. `timeBasis(ms, scale, pin)` takes
epoch milliseconds on `"utc"`, `"ut1"` or `"tt"`, defaults to UTC, and accepts
an optional Delta T override in seconds. It preserves the reference's clock
handoffs and leap-second records. `taiMinusUtcAt`, `ut1MinusUtcAt` and
`elapsedDays` expose the underlying time helpers with the reference signatures.
Table metadata is exported as an immutable build snapshot; its source and
licensing chain is in [PROVENANCE.md](PROVENANCE.md).

`nutation(t, terms)` takes Julian centuries of TT from J2000 and an optional
series prefix length, and returns nutation in arcseconds plus the node argument
in radians. `tilt(tt)` takes TT days since J2000 and returns mean and true
obliquity in degrees, with nutation and the equation of the equinoxes in
arcseconds. `meanObliquity(t)` exposes the obliquity polynomial.
`gastHours(time)` takes an astronomy-engine-compatible time object with `ut`
and `tt` day fields and returns Greenwich apparent sidereal hours. Only those
fields are read; the wrapper does not construct a time or change its Delta T.

`eclipticFrame(tt)`, `meanEcliptic(frame, x, y, z)` and
`eclipticOfDate(x, y, z, tt)` transform J2000 mean-equatorial vectors to the
ecliptic of date. `eclipticRows(tt, kind)` and `equatorRows(tt, kind)` return
row-major matrices for `"mean"` or `"true"` frames. `turn(rows, x, y, z)` acts
on a column vector and preserves its units. All numeric operations run in
Rust. Exported nutation tables and cached frames are immutable snapshots;
mutation and cache identity differences are recorded in [PARITY.md](PARITY.md).

The intermediate planetary API exports `helioVector(body, ttDays)` and
`helioState(body, ttDays)`, for the Sun and Mercury through Pluto, including
Earth. Vectors are in AU on the mean equator and equinox of J2000; state
velocities are in AU per TT day. `geoVector(body, clock, aberration)` and
`backdatePosition(observer, target, clock, aberration)` solve light time, with
aberration enabled by default. `clock` is `{ ut, tt, deltaT }`: days since
J2000 on UT1 and TT, and the fixed Delta T in seconds for that sample.
For a chart clock use `{ ut: basis.ut1Days, tt: basis.ttDays,
deltaT: basis.deltaT.seconds }` from `timeBasis`. `backdatePosition` also
returns the emission `ut` and `tt`. These helpers return plain records,
without astronomy-engine objects or runtime calls into that dependency.
Their tests are in [planets.parity.ts](tests/planets.parity.ts).

These intermediate kernels accept finite clocks and only the implemented
bodies. Pluto's heliocentric helpers additionally require TT inside
`EPHEMERIS_SPAN`. [PARITY.md](PARITY.md) states their bounds and the
deliberate refusal of the dependency's distant extrapolation path.

`positions(date)` has the engine's public signature: a Date, epoch-millisecond
number or resolved ISO input produces ordinary mutable `BodyPosition` rows.
All coordinate calculation, row assembly, speeds, sign selection and degree
arithmetic run in Rust. `computeBodies(date)`, `bodyLongitude(body, date)` and
`longitudeSpeed(body, date)` expose the matching Date-only internal signatures.
`positionsOn(date, scale?, pin?)` is an additional port helper that computes
those rows on an explicit chart clock without assembling houses or aspects.

`REFERENCE_SPAN`, `EPHEMERIS_SPAN` and `outsideReferenceSpan(date)` mirror the
engine's metadata and coverage check. Positions outside reference coverage
still compute; positions beyond the ephemeris TT span refuse. Every outer
speed sample is checked. The rows carry no coverage flag, as in the engine.
The complete-row corpus, boundary decisions and angular/speed allowances are
enforced by [positions.parity.ts](tests/positions.parity.ts) and documented in
[PARITY.md](PARITY.md). Near a sign boundary or station, allowed numeric
roundoff can change discrete sign or retrograde metadata.

The lunar API exports `geoMoon(ttDays)` for a geocentric J2000 vector in AU,
`geoMoonState(clock)` for its position and finite-difference velocity in
AU/day, `moonOfDate(clock)` for true-ecliptic longitude/latitude in degrees,
and `trueNodeLongitude(clock)` for the ascending node in degrees. They use
the same `PlanetClock` record as the planetary helpers and return plain
records. The Moon retains the reference's uncorrected series and its
separate mean-date to J2000 rotation. Its state position is the average of
the two velocity samples, not a second evaluation at the center instant.

`lunarLongitude(body, date, scale?, pin?)` and
`lunarLongitudeSpeed(body, date, scale?, pin?)` accept `"Moon"`,
`"North Node"` or `"South Node"`, a valid Date, an optional input time
scale and optional Delta T seconds. They resolve each sample's time basis
in Rust and enforce the engine's TT span on each evaluation. Longitude is
in degrees and speed is in degrees per elapsed day. Their default UTC
forms match the lunar subset of `bodyLongitude` and `longitudeSpeed` in
the engine's ephemeris module. The separate names keep these lunar-only helpers
available alongside the complete position API.
The tests and quantity-specific rounding allowances are in
[moon.parity.ts](tests/moon.parity.ts) and [PARITY.md](PARITY.md).

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
`angles`, `signs`, `date_input`, `calendar`, `deltat`, `time_scales`,
`nutation`, `frame`, `equator`, `planets`, `pluto`, `moon`, `lunar` and `ephemeris` modules. Fallible angular functions
return `Result<_, LongitudeError>`; the unchecked angular helpers propagate NaN
as the reference does. Date parsers return `Result<f64, DateError>` with epoch
milliseconds. Calendar string parsers and conversions return `Option`, and
`CivilDate` has numeric year, month and day fields.

Native date validation parses ISO syntax and resolves Gregorian calendar fields
and UTC offsets without calling JavaScript. The wrapper handles JavaScript input
types, Date allocation, error labels and string formatting. Native `calendar::format`
accepts finite integer civil fields within its documented range; the TypeScript
`format` also preserves the reference's unchecked JavaScript string formatting.

`deltat::delta_t` and `deltat::delta_t_at` return a `Result` for finite UT1
input. `time_scales::time_basis` takes milliseconds, a `TimeScaleName` and
an optional pin, and returns the same time record using Rust structs and
options. `time_scales::elapsed_days` compares those records across seams.
These low-level time helpers retain the reference's unchecked numeric behavior;
date and public chart input validation remain separate boundaries.

`nutation::nutation(t, terms)` accepts an integer prefix length; the separate
`nutation_with_terms` preserves the TypeScript helper's floating-count edge
behavior for the WASM boundary. `nutation::gast_hours(ut, tt)` keeps rotation
on UT1 and precession/nutation on TT. `frame::ecliptic_of_date` returns
`Result<EclipticAngles, LongitudeError>`, matching longitude normalization's
rejection; a zero vector retains a NaN latitude. Native frame operations have
no shared mutable cache. `equator::FrameKind` selects the mean or true frame.

`planets::Planet` selects the Sun, a series body or Pluto. `helio_vector` returns
Cartesian coordinates; `helio_state` returns `HelioState { pos, vel }`.
Those native functions take unchecked TT days, so validate time at the caller's
boundary. `backdate_position` returns `BackdatedPosition { vector, ut, tt }`;
`geo_vector` returns only the vector. Both take explicit UT1 and TT day values,
a fixed Delta T in seconds, and a boolean aberration switch. They return
`Result` for invalid clocks or a failed light-time solution. These functions
have no global time model or callback into JavaScript. Pluto reuses integrated
segments in a thread-local cache; query order does not affect their values.

`pluto::helio_state(tt)` is the checked Pluto-only entry. It rejects TT outside
the source table, while the light-time path allows a bounded adjacent step for
an observation at the table's edge. The generic unchecked `planets` heliocentric
helpers return NaN for Pluto beyond that internal allowance. The WASM boundary
checks the public table span. The native tests and [pluto.parity.ts](tests/pluto.parity.ts)
exercise those distinctions. Pluto's returned state velocity follows the
reference interpolation; it is not the derivative of its mixed position.

`ephemeris::positions(ms)` and `positions_on(ms, scale, pin)` return
`Vec<BodyPosition>` on UTC or an explicit clock. `body_longitude` and
`longitude_speed` have explicit-clock variants `longitude_at` and
`longitude_speed_on`. Select bodies with `ephemeris::Body`, separate from
the intermediate `planets::Planet` enum. Native input milliseconds and pins
are caller-validated; the wrapper handles the public DateInput boundary.
`check_ephemeris_span` checks TT and `outside_reference_span` checks coverage.

`moon::calc_moon` returns mean-ecliptic spherical coordinates in radians
and distance in AU; `moon::geo_moon` returns its J2000 Cartesian vector.
Both take unchecked TT days. `moon::geo_moon_state` takes finite UT1, TT
and fixed Delta T seconds, returning the same position/velocity struct as
the planetary state helper, here relative to Earth. `lunar` exposes
`moon_of_date`, `true_node_longitude`, `lunar_longitude` and
`lunar_longitude_speed`. The last two select a `LunarBody` and take epoch
milliseconds, a `TimeScaleName` and optional Delta T seconds. Their native
input boundary expects validated milliseconds and a finite pin; Date type
checks are the wrapper's responsibility. Neither lunar module has a shared
mutable cache or a JavaScript callback.

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
calculates the index and degree and provides native sign metadata. The time
tables are generated from pinned local sources, with the separate Delta T
attribution in [NOTICE](NOTICE) and [PROVENANCE.md](PROVENANCE.md). Planetary
coefficients are generated from the digest-checked astronomy-engine source;
the translated solar and planetary kernels retain its MIT notice.
The nutation coefficients and frame algorithms retain the parent's NOVAS and
astronomy-engine attribution in those
same files. Future translations must retain their sources'
notices and data terms. Nothing here enters the root npm package;
`check:isolation` checks npm's actual file listing without running prepack.

The root `npm run package:contents` gate was also attempted during the initial
and subsequent numeric milestones. It stops at the missing `dist/calc.d.ts`
because this checkout has no root build output. This workspace's isolation check passes independently;
the root package gate still needs a built engine checkout in the normal CI.
