# Rust numeric core

An isolated, experimental port of this checkout's numeric engine. The native
library and WebAssembly module implement angular arithmetic, sign annotations,
resolved-instant date validation, Julian/Gregorian civil-calendar helpers,
the Delta T model, the UTC/UT1/TT time basis, nutation, precession,
frame rotations, obliquity, apparent sidereal time, solar and planetary
series and Pluto integration with light time and aberration, and the Moon and
true lunar nodes with longitude finite differences. It assembles complete
position rows with signs, degrees in signs, speeds and retrograde flags.
It also computes chart angles and every supported house system, including
Placidus and Koch polar fallbacks, and house membership from supplied cusps.
Legacy and configured aspect matching run in Rust, including exact binary64
orb decisions, motion classification, custom rules and stable result ordering.
The TypeScript wrapper retains the implemented engine helpers' synchronous
signatures after explicit initialization and exposes intermediate planetary and
lunar kernels. This workspace provides the numeric helpers, with callers
assembling their own results; it does not expose `natalChart`, receipts,
timezone resolution or the engine's other high-level APIs.
[PLAN.md](PLAN.md) records the completed milestones.

## Setup and checks

Use Node from the engine's supported Node 22 line and a rustup installation.
`rust-toolchain.toml` pins the compiler, components and WASM target. Both Cargo
manifests disable publication, and the local npm package is private.

From this directory:

```sh
npm ci
npm run setup:wasm
npm run setup:browser
npm run build
npm test
npm run lint:rust
npm run check:isolation
```

`setup:wasm` installs the pinned toolchain locally and the exact wasm-bindgen
CLI version from `Cargo.toml` under `.tools/wasm-bindgen/`. The CLI and crate must agree.
Build and test scripts use locked dependencies. `npm test` runs Cargo unit
tests, builds WASM, checks TypeScript signatures and runs the Vitest parity
suite and a Chromium loading smoke test, including checks of the time,
planetary, lunar and Pluto data generators and the WASM build identity.
`setup:browser` downloads the pinned Playwright Chromium into `.cache/`.
Alternatively, set `RUSTCORE_BROWSER_EXECUTABLE` to an installed Chrome or
Chromium executable. `npm run test:browser` runs the browser check separately
after a WASM build. Native release builds are
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
initialized with bytes in Node or a browser. It appends a build identity to the
WASM and writes the expected identity to `generated/wasm-build.ts`; keep that
generated metadata, glue and binary together. The local reference dependency is
the engine's exact astronomy-engine version; Vitest resolves relative engine
sources to it without a root install. Tests use the `.parity.ts` suffix and this
directory's explicit Vitest configuration, so the root suite does not discover
tests requiring an unbuilt WASM module.

The browser smoke test bundles the wrapper and checks that its runtime graph
contains only this workspace's implementation and generated files. Relative
imports from the engine are types only; neither the TypeScript ephemeris nor
astronomy-engine enters that browser bundle.

To rebuild WASM, check types and run the complete numerical corpus with an
auditable local summary, use `npm run test:parity:report` on Node 22.
It writes `generated/parity-report.json` with test coverage, numerical maxima,
boundary deviations, runtime details and SHA-256 identities for the reference,
port, tests and built module. It refuses a filtered, skipped, failed or empty
run, missing measurement records, or sources changed during the test run.
The summary and Vitest's raw report remain ignored. Acceptance limits live in
the tests and [PARITY.md](PARITY.md); observed maxima do not set those limits.

## Benchmarks

From this directory, run:

```sh
npm run bench
npm run bench:check
```

`bench` runs the native Criterion suite and the Node WASM-versus-TypeScript
suite sequentially, then writes a local summary. `bench:native` and
`bench:node` run the suites separately. Raw measurements and local build
outputs stay ignored. Criterion is a development dependency of the native
crate; it is not part of its library runtime or the WASM build.

[BENCHMARKS.md](BENCHMARKS.md) describes the workloads, timing boundaries,
reproduction commands and limits. The committed
[baseline](docs/evidence/benchmark-baseline.json) records the measured
numbers and machine/toolchain description. Those results describe synthetic
workloads on that machine and build. They do not establish astronomical
accuracy or performance on another runtime, processor or workload.

## TypeScript use

After `npm run build:wasm`, save this example as `generated/example.ts`.
The instant and location are invented. It uses the UTC time basis consistently
for positions and house geometry:

```ts
import { readFileSync } from "node:fs";
import {
  initRustCore, dateFrom, positions, timeBasis, gastHours, tilt,
  computeAngles, computeHouses, houseOf,
  createAspectPolicy, findConfiguredAspects
} from "../ts/index.js";

initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
const date = dateFrom("2001-02-03T04:05:06.789Z", "date");
const bodies = positions(date);
const basis = timeBasis(date.getTime());
// The retained AstroTime signature reads only UT1 and TT day fields.
const clock = { ut: basis.ut1Days, tt: basis.ttDays } as Parameters<typeof gastHours>[0];
const geometry = {
  gastHours: gastHours(clock),
  latitude: 25,
  longitude: -35,
  obliquity: tilt(basis.ttDays).tobl
};
const angles = computeAngles(geometry);
const houses = computeHouses("placidus", geometry, angles);
const membership = bodies.map(row => ({
  body: row.body,
  house: houseOf(row.lon, houses.houses.cusps)
}));
const policy = createAspectPolicy({
  aspects: [
    { type: "conjunction", orb: 8 },
    { type: "square", orb: 7 },
    { type: "quincunx", orb: 2 }
  ]
});
const analysis = findConfiguredAspects(bodies, policy);

console.log({ bodies, basis, angles, houses, membership, aspects: analysis.aspects });
```

Compile and run it from this directory using the installed bundler:

```sh
node_modules/.bin/esbuild generated/example.ts --bundle --platform=node --format=esm --outfile=generated/example.mjs
node generated/example.mjs
```

This assembles a caller-owned result, not the engine's `Chart` type. For a
different input scale or pinned Delta T, use `positionsOn(date, scale, pin)`
and `timeBasis(date.getTime(), scale, pin)` together. Low-level geometry does
not validate a location as a public birth input does. Resolve local wall
times before using these helpers; [PARITY.md](PARITY.md) records their
boundary behavior and compatibility limits.

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

`computeAngles(input)` takes `AngleInput`: apparent `gastHours`, geodetic
`latitude` in degrees north, east-positive `longitude` in degrees, and true
`obliquity` in degrees. It returns `{ asc, mc, dsc, ic }` in degrees and
retains the engine's eastern-horizon selection at polar latitudes.
`ramcOf(input)` exposes the local apparent sidereal angle.
Use `gastHours` and `tilt(basis.ttDays).tobl` on the same time basis to supply
the input; these low-level geometry functions do not resolve a Date themselves.

`wholeSignCusps(ascendant)`, `equalCusps(angles)`, `equalMcCusps(angles)`,
`vehlowCusps(angles)`, `porphyryCusps(angles)`, `meridianCusps(input)` and
`morinusCusps(input)` return ordinary mutable cusp arrays. The remaining
helpers take `(input, angles)`: `placidusCusps`, `kochCusps`,
`regiomontanusCusps`, `campanusCusps`, `topocentricCusps` and `alcabitiusCusps`.
Placidus and Koch return `null` where their semi-arcs are undefined.
`computeHouses(system, input, angles)` supports every name in the frozen
`HOUSE_SYSTEMS` list, with the reference signature and result shape. For
Placidus or Koch at the polar limit or beyond, it returns whole-sign houses
with `fellBack: true` and `fallbackSystem: "whole"`. The other systems retain
their requested names. `POLAR_UNDEFINED_HOUSE_SYSTEMS`, `POLAR_FALLBACK`, its
deprecated alias `PLACIDUS_POLAR_FALLBACK`, and
`isPolarUndefinedHouseSystem` expose the reference metadata.
Placidus preserves the bounded iteration and bisection fallback. Circle-based
systems preserve their polar orientation, including when the lower meridian
becomes the tenth cusp. Numerical conditioning and the limits of cross-runtime
parity are documented in [PARITY.md](PARITY.md).
`houseOf(longitude, cusps)` preserves the engine's inclusive cusp start,
exclusive end, first-match order, zero-width interval and missing-slot behavior.
Numeric acceptance, singular configurations and boundary decisions are
specified and tested in [PARITY.md](PARITY.md),
[houses.parity.ts](tests/houses.parity.ts) and
[quadrant-houses.parity.ts](tests/quadrant-houses.parity.ts).

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
asset loader, a byte view, or a compiled `WebAssembly.Module`:

```ts
import { initRustCore, positions } from "./ts/index.js";

const response = await fetch(new URL("./pkg/zodiacs_rustcore_bg.wasm", import.meta.url));
if (!response.ok) throw new Error("Could not load Rust core WASM.");
initRustCore(await response.arrayBuffer());
const bodies = positions("2001-03-21T06:00:00Z");
```

The asset request belongs to the caller. The wrapper makes no network requests
and does not initialize WASM at import time. Initialization is synchronous;
after success, later initialization calls keep the same instance. Calculations
before initialization throw. Invalid syntax raises `WebAssembly.CompileError`;
a missing or mismatched build identity raises `TypeError` before the generated
glue receives the module. Both failures allow retry with the matching artifact.
Build identity detects accidental artifact mixing; it does not authenticate
untrusted executable code. Each worker or separately loaded wrapper instance
needs its own initialization.

[browser.smoke.ts](tests/browser.smoke.ts) exercises both byte and compiled
module loading in a real browser, then runs synchronous positions, time,
coordinate, house and aspect calls. [signatures.ts](tests/signatures.ts) checks
the mirrored function parameters, result types and metadata declarations
against relative engine imports during `npm run typecheck`.

`aspectMotion`, `matchAspect`, `findAspects` and `findInterAspects` expose the
legacy engine signatures and floating-point behavior. `matchAspect` returns
the matching frozen object from `ASPECTS`; the result arrays remain mutable.
`ASPECT_TYPES`, `ASPECT_BODIES` and `STATIONARY_RELATIVE_SPEED` expose the
reference metadata. Editing the public body set does not change matching.

`createAspectPolicy(input?)`, `DEFAULT_ASPECT_POLICY` and
`findConfiguredAspects(positions, policy)` mirror the configured API, with
`CONFIGURED_ASPECT_ANGLES` for the named angles. Policies are immutable
snapshots with a local factory registry; a deserialized policy must be
recreated from its input fields. The factory and metadata work before WASM
initialization. Matching requires initialization and returns deeply frozen
results carrying the original policy object by identity.

JavaScript validates ordinary data slots and allocates snapshots; Rust computes
separation, exact orb eligibility, motion, rule selection and ordering. Body
labels are transported through reversible indices so lone UTF-16 surrogates
remain distinct. On identical numeric inputs, aspect fields have no rounding
allowance: [aspects.parity.ts](tests/aspects.parity.ts) and
[configured-aspects.parity.ts](tests/configured-aspects.parity.ts) enforce bit
equality against the local engine across the synthetic corpus described in
[PARITY.md](PARITY.md). This is compatibility evidence only.

## Native use

Within a Rust workspace member that depends on `zodiacs-rustcore` by path,
the same synthetic instant can be evaluated directly:

```rust
use zodiacs_rustcore::{date_input::date_from_iso, ephemeris};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let ms = date_from_iso("2001-02-03T04:05:06.789Z")?;
    for row in ephemeris::positions(ms)? {
        println!("{}: {} degrees, {} degrees/day", row.body.name(), row.lon, row.speed);
    }
    Ok(())
}
```

The workspace member `crates/core` exposes `normalize_longitude(f64)` and the
`angles`, `signs`, `date_input`, `calendar`, `deltat`, `time_scales`,
`nutation`, `frame`, `equator`, `houses`, `planets`, `pluto`, `moon`, `lunar`, `ephemeris`,
`aspects` and `exact` modules. Fallible angular functions
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

`houses::AngleInput` and `houses::Angles` carry the geometry fields described
above, using `gast_hours` for the Rust field name. The angle and cusp functions
return `Result` with `LongitudeError` when their evaluated arithmetic reaches
a nonfinite longitude. They do not eagerly reject unused fields.
`houses::compute_houses` dispatches the complete `HouseSystem` enum and
returns a `ComputedHouses` record with the computed system and fallback fields.
`placidus_cusps` and `koch_cusps` return `Ok(None)` in their polar region;
the other cusp helpers return a cusp array or an error. `house_of` accepts a
numeric slice;
`house_of_optional` accepts optional cusp values for JavaScript's missing slots.
Both return the house number or `HouseError`, preserving length checking and
early-return evaluation order. All house geometry runs in safe Rust.

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

`aspects::aspect_motion`, `match_aspect`, `find_aspects` and
`find_inter_aspects` provide the legacy operations. Configured matching takes
`AspectPosition` rows and an `AspectPolicy` made by `create_aspect_policy`.
Use `AspectPolicyInput` with optional selections, `AspectRuleInput` for named
or custom rules, and `AspectOrbInput::Uniform` or `ByMotion` for allowances.
The factory validates ranges and identifiers and returns a policy with private
fields and immutable getters. Native labels use Rust strings; JavaScript's
lone-surrogate labels are represented only at the WASM boundary.

The `exact` module carries nonoverlapping binary64 expansions and rounds a
reported value once, with ties to even. Its `exact_sign` handles finite inputs
of any magnitude using integer limbs when a floating sum could overflow.
Expansion-building operations require finite terms with no overflowing partial
sum, as documented on those functions. The aspect matcher enforces these
preconditions through policy and position validation. The native core has no
runtime dependency and forbids unsafe code. Criterion is used only by its
development benchmark target.

## Parity and provenance

[PARITY.md](PARITY.md) records current coverage and acceptance rules, enforced
by [the parity tests](tests/) and the native unit tests in
[the core crate](crates/core/src/). Dates are compared from 1800 through 2200,
with additional parser boundary cases; the exact corpus is in
[date-input.parity.ts](tests/date-input.parity.ts) and
[civil-calendar.parity.ts](tests/civil-calendar.parity.ts). These compare
implementations and do not establish astronomical accuracy. All inputs are
synthetic. [BENCHMARKS.md](BENCHMARKS.md) separately records performance
measurement scope and the committed baseline.
The complete pipeline tests evaluate positions independently in each runtime
before house membership and aspect matching. They retain exact shared-input
checks and explicitly bound upstream rounding near discrete boundaries; they
do not promise identical event times. All supported cusp systems, named aspect
angles and representative custom policies are covered, with finite near-singular
house geometry checked separately from ordinary cases. The limits and excluded
singularities are recorded in [PARITY.md](PARITY.md).

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
House geometry translates [src/houses.ts](../src/houses.ts) under the
repository's MIT licence, with its source identity recorded in
[PROVENANCE.md](PROVENANCE.md).

The root `npm run package:contents` gate was also attempted during the initial
and subsequent numeric milestones. It stops at the missing `dist/calc.d.ts`
because this checkout has no root build output. This workspace's isolation check passes independently;
the root package gate still needs a built engine checkout in the normal CI.
