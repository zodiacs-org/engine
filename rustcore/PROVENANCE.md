# Numeric core provenance

This port reads the checked-out engine and its pinned astronomy-engine
dependency, without fetching or consulting an external ephemeris. Its native
kernels translate planetary positions, angles and house cusps, aspects, and
the time and coordinate helpers described below, under the repository's
[MIT License](../LICENSE) and the dependency's retained MIT notice.
[NOTICE](NOTICE) retains the code and data attribution.
The local Cargo and npm manifests use `MIT AND CC-BY-4.0` because the built
libraries contain the Delta T values. The root package remains unchanged.

## Reproducible translation

[generate-time-data.mjs](scripts/generate-time-data.mjs) pins the SHA-256 of
`src/deltat.ts` and `src/time-scale-data.ts`. Their time calculations translate
[deltat.ts](../src/deltat.ts) and [time-scale.ts](../src/time-scale.ts).
The generator rejects a changed input before
parsing. It extracts literal tables without evaluating TypeScript, checks
the Delta T and UT1 tables' own digests, and decodes packed UT1 differences with exact
integer arithmetic. It does not regenerate or edit the parent engine's inputs.

Cargo's [build.rs](crates/core/build.rs) invokes the generator with Node and
writes `time_data.rs` to Cargo's ignored `OUT_DIR` under `target/`.
`build:wasm` also writes metadata exports to ignored `generated/time-data.ts`.
Neither output is committed. Both outputs carry attribution pointers.
The TypeScript wrapper imports only generated metadata and type declarations
from the reference; it does not call the reference time calculations.

The generator's source hashes, extraction determinism and data shapes are
checked in [time-data.check.mjs](scripts/time-data.check.mjs). Full table exports
are compared with the reference in [time.parity.ts](tests/time.parity.ts).
Native tests check decoded data and model knots. A source refresh requires
reviewing the source, its terms, its digests and the parity tests before
updating the generator's pins.

## Source chain and terms

The provenance is inherited from the read local [LICENSING.md](../LICENSING.md),
[NOTICE](../NOTICE), [src/deltat.ts](../src/deltat.ts) and the header and metadata
of [src/time-scale-data.ts](../src/time-scale-data.ts). The following links
identify those recorded sources; this port makes no new external-source
verification claim.

| Data | Source and treatment | Terms recorded by the parent repository |
| --- | --- | --- |
| Early Delta T knots and long-term constants | Stephenson, Morrison and Hohenkerk, *Measurement of the Earth's rotation: 720 BC to AD 2015*, Table S15 and equations (4.1), (5.1), [article](https://doi.org/10.1098/rspa.2016.0404). Engine-rounded knots are translated unchanged. | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), attribution in NOTICE |
| Later Delta T knots | USNO historic_deltat.data and tai-utc.dat, IERS EOP 20 C04 and Bulletin A, as embedded in src/deltat.ts | USNO works are US Government works; IERS terms as below |
| Leap-second changes | [IERS leap-seconds.list](https://hpiers.obspm.fr/iers/bul/bulc/ntp/leap-seconds.list), pinned source identity in LEAP_SECOND_LIST | Source header states public domain |
| Early UT1 samples | [IERS EOP 20 C04](https://hpiers.obspm.fr/iers/eop/eopc04/), pinned earlySource and earlySha256 in UT1_DATA | No statement of terms found in the parent's audit; redistribution terms remain unresolved |
| Later UT1 samples and predictions | [IERS Rapid Service/Prediction Centre at USNO](https://maia.usno.navy.mil/), finals2000A.all, pinned source and sha256 in UT1_DATA | Parent audit records "Distribution Statement A. Approved for public release: distribution unlimited." |

The generator preserves the leap list's source, update, expiry and digest,
and the UT1 source names, original source digests, table digest, bands and
prediction metadata in the wrapper exports. Those records are source identity,
not claims about new data or new precision. Its decoded Rust knots retain the
engine's sampling and rounding; its uncertainty values are the engine's own.
The inherited C04 licensing question is not resolved by translating the data.

## Frame and nutation translation

The frame milestone directly translates the checked-out files below. Their
hashes are enforced by [frame.parity.ts](tests/frame.parity.ts); a source
refresh needs review before those pins change. The frame milestone translated
only `meanObliquity` from the houses file and `gastHours` from the ephemeris
file; later translations are described below.

| Local source | SHA-256 |
| --- | --- |
| `src/nutation.ts` | `c11af594d4e8ad64e0a7ff1097505063c70812d2da84e14a6c0280d4841e62b0` |
| `src/frame.ts` | `98d0bee44839b23d3ec64dac470e31ab8e366c6907d325a4259f8f37285a7c50` |
| `src/equator.ts` | `1789e14344ef83839aea20624d16bb3def70d41e574f412faec87b89e6a79ef7` |
| `src/houses.ts` | `e97ea80f5f225fadf0bfcb051f0afcce820678f31ff1013cc0ebce3035cc8ceb` |
| `src/ephemeris.ts` | `b530dbd0463b886fe1b8e99a095dc9cf9ef0cf614b6854e78ad206a27913cc7e` |

Rust's `nutation.rs` carries the reference's coefficients, arguments,
multiplier encoding and fixed offsets as literal constants. The parity test
compares every value with the local TypeScript source, including the metadata
copies in `ts/nutation-data.ts`. These are source data, not generated output.
No coefficient was fitted to another ephemeris or adjusted for the Rust port.

The provenance chain is the parent's `LICENSING.md` and `NOTICE`: the
nutation data were transcribed from USNO NOVAS C, a US Government work;
the precession is astronomy-engine's MIT-licensed implementation, reproduced
in the parent frame module. [NOTICE](NOTICE) retains the NOVAS citation and
Don Cross's copyright with the full MIT permission and warranty text.
This translation reads those local records and performs no new external-source
audit, download or independent accuracy comparison.

## Solar and planetary series

The planetary milestone reads the installed MIT-licensed
`astronomy-engine@2.1.19` dependency in this workspace. Its source is
`rustcore/node_modules/astronomy-engine/esm/astronomy.js`, SHA-256
`068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7`.
[generate-planet-data.mjs](scripts/generate-planet-data.mjs) checks that
digest before extracting the `vsop` literal. It also checks the installed
package name, exact version and MIT declaration, the parent and local
manifest version pins, and both lockfiles' version and npm integrity fields.
The dependency has not been upgraded or replaced.

The generator quotes the literal's known body keys and parses it as JSON;
it never imports or evaluates the JavaScript source. It verifies the body
order, each coordinate's polynomial orders and term counts, and each term's
finite amplitude, phase and frequency. It preserves the source's empty
Earth latitude order. Decimal coefficients become JavaScript binary64 values
and then explicit Rust `f64::from_bits` constants, so the conversion loses
no bits and retains the term order. There is no coefficient fitting or
additional rounding.

Cargo writes `planet_data.rs` to its ignored `OUT_DIR` under `target/`.
The generated table contains Mercury, Venus, Earth, Mars, Jupiter, Saturn,
Uranus and Neptune in source order. The Sun's heliocentric vector is zero;
its geocentric calculation uses the Earth series. This milestone does not
include the source's Moon or Pluto tables. Lunar coefficients and Pluto
states are generated separately as described below. Generated data are not committed.

The native formulas translate the same installed source's VSOP evaluation,
spherical-to-rectangular conversion, fixed equatorial rotation, light-time
iteration and observer-motion aberration path. Coefficients and formulas
inherit Don Cross's MIT licence; [NOTICE](NOTICE) retains the full copyright,
permission and warranty text from the installed source header. The build
contains native coefficients and Rust calculations, with no JavaScript
callbacks in the planetary calculation path.

[planet-data.check.mjs](scripts/planet-data.check.mjs) checks source and
package-identity rejection, malformed-literal rejection, every table shape,
deterministic output, every generated coefficient's binary64 value and the
complete MIT permission and warranty text. These checks and the TS/WASM
parity tests measure faithful translation of this local dependency. They
make no new astronomical accuracy or external-source audit claim.

## Moon series and nodes

[moon.rs](crates/core/src/moon.rs) translates `CalcMoon`, `GeoMoon` and
`GeoMoonState` from the same digest-pinned installed astronomy-engine source
named above. [generate-moon-data.mjs](scripts/generate-moon-data.mjs)
extracts the ordered solar perturbation and latitude terms into Cargo's
ignored `OUT_DIR`. Its source and dependency identity checks share the
planetary generator's pinned input verification. Coefficients retain their
JavaScript binary64 values as Rust bit patterns; integer harmonic indices
keep their signs and order. [moon-data.check.mjs](scripts/moon-data.check.mjs)
checks extraction and generated representation. No generated table is
committed, and the parent engine's sources are untouched.

The lunar position preserves the dependency's mean-obliquity Horner
polynomial, separate ecliptic-to-equator rotation, and inverse precession
into J2000. It deliberately retains these operations rather than transposing
the engine's combined frame matrix, which changes floating-point rounding.
The state retains the dependency's short position difference and midpoint.
There is no analytic velocity substitution or coefficient adjustment.

[lunar.rs](crates/core/src/lunar.rs) translates the Moon, true-node and
longitude-difference branches of `src/ephemeris.ts`, with its source digest
pinned in [moon.parity.ts](tests/moon.parity.ts). Its time basis and frame
come from the earlier Rust ports. The node uses the state angular momentum
on the mean ecliptic and adds the engine's nutation in longitude.

[NOTICE](NOTICE) extends the retained Don Cross MIT notice to the lunar
algorithms and tables and records the historical algorithm attribution
stated by the local dependency. This is a translation of those local
sources, not an external-source audit or an independent accuracy comparison.

## Pluto and complete positions

[generate-pluto-data.mjs](scripts/generate-pluto-data.mjs) reads the same
installed astronomy-engine source and uses the planetary generator's complete
source digest, dependency version, licence and lockfile checks. It parses only
the literal `PlutoStateTable`, integration dimensions and gravitational
constants for the Sun and giant planets. The output retains every source
binary64 value and writes to Cargo's ignored `OUT_DIR` as `pluto_data.rs`.
[pluto-data.check.mjs](scripts/pluto-data.check.mjs) verifies all values, table
spacing, dimensions, malformed-input rejection and deterministic output.

[pluto.rs](crates/core/src/pluto.rs) translates the dependency's major-body
barycentric conversion, gravity update, forward/reverse segment integration,
fade mixing and interpolation. The adjacent light-time extension uses the
source's one-way integration step and is bounded; it does not implement the
unbounded distant extrapolation. Coefficients and source states are not
modified or fitted. [NOTICE](NOTICE) extends the retained MIT attribution to
these algorithms and tables. No additional ephemeris source is consulted.

[ephemeris.rs](crates/core/src/ephemeris.rs) translates complete position
assembly, sample clocks, longitude differences and annotations from the local
`src/ephemeris.ts`, with span metadata from `src/reference-span.ts`. Their
digests are already enforced by [moon.parity.ts](tests/moon.parity.ts).
Public DateInput validation mirrors `src/api.ts`'s `positions` using the
existing date parser port. The wrapper imports reference types only; all
numeric evaluation and complete row assembly run in Rust. The comparison
tests import the local engine as the compatibility reference.

## House geometry

[houses.rs](crates/core/src/houses.rs) translates angles, whole sign, equal,
equal-MC, Vehlow, Porphyry, Meridian, Morinus, Placidus, Koch, Regiomontanus,
Campanus, Topocentric and Alcabitius cusps and `houseOf` from
the checked-out [src/houses.ts](../src/houses.ts), under the repository's
[MIT License](../LICENSE). Its source digest is recorded in the frame table
above and enforced again by [houses.parity.ts](tests/houses.parity.ts).
The port retains scalar operation order, the eastern-horizon selection,
Placidus iteration and bisection, polar fallback and circle orientation,
and the house-membership scan's short-circuit rules. It adds no coefficient table
or externally sourced fixture. Tests compare the local TypeScript code on
synthetic inputs only. No external ephemeris was consulted for this milestone.

## Aspects and exact binary64 arithmetic

[aspects.rs](crates/core/src/aspects.rs), [exact.rs](crates/core/src/exact.rs)
and the JavaScript policy boundary translate the local MIT-licensed sources
below. Their digests are enforced in [aspects.parity.ts](tests/aspects.parity.ts).
Only `findInterAspects` is translated from `src/synastry.ts`; balance and pair
summary helpers are outside this milestone.

| Local source | SHA-256 |
| --- | --- |
| `src/aspects.ts` | `5cfbf1ffe3889f1c038b798d5bd74674de17bd9f0571adb4be08141cdd49f740` |
| `src/configured-aspects.ts` | `c56349ba454e7cb3005f25eb3b740dd063cfeb3b9115e0d11512d8989ff19be4` |
| `src/exact.ts` | `f89a335657aa1139370511d315abcf8d6080ab857e0a37d249faf9de6a5eb25e` |
| `src/body-label.ts` | `bce12273949cd9810f4ab00c0f05c1aba14cf4ee46533ca3aba0588525006b1e` |
| `src/synastry.ts` | `5671b43c9647a7164d171d9113ae4ab375b7f2a18cba53fac481e4c7a0522d29` |

The exact-sum implementation retains the engine's nonoverlapping expansions
and final half-even rounding. The parent [LICENSING.md](../LICENSING.md)
attributes these published algorithms to J. R. Shewchuk, *Adaptive Precision
Floating-Point Arithmetic and Fast Robust Geometric Predicates* (1997), in the
partial-sums form described for Python's `math.fsum`. This port reads the
engine implementation, not third-party source code. Its overflow-safe sign
fallback replaces JavaScript BigInt with safe unsigned integer limbs and is
checked against a separate integer-bit oracle in the native tests.
This translation introduces no additional ephemeris, coefficient data or
accuracy reference. All comparison inputs are synthetic.

## Build and measurement dependencies

[Cargo.lock](Cargo.lock) and [package-lock.json](package-lock.json) record the
local build and development dependencies. The native core has no runtime
dependency; its source forbids unsafe code. The WASM adapter uses the pinned
wasm-bindgen and js-sys dependencies. The TypeScript runtime imports this
workspace's implementation, generated metadata and WASM glue; relative engine
imports are types only. Its browser bundle is checked by
[browser.mjs](scripts/browser.mjs) to exclude the engine's runtime and
astronomy-engine. The separately installed astronomy-engine dependency supplies
digest-checked build inputs and the parity/benchmark reference.

Criterion is a development dependency used by the native benchmark target.
It does not enter the core library or WASM runtime. Node benchmarking executes
the same synthetic workload definitions through the port's public wrapper and
the checked-out TypeScript functions. The workload definitions, timing scope,
cache treatment and reproduction commands are recorded in
[BENCHMARKS.md](BENCHMARKS.md). The committed
[benchmark baseline](docs/evidence/benchmark-baseline.json) records its machine,
toolchain and source/build identities alongside the measured summaries.
Raw measurements and generated data stay in ignored folders.

Parity establishes compatibility on the tested inputs; benchmarks measure
performance for their stated build, machine and workload. Neither is an
independent astronomical accuracy check. This project performs no Swiss
Ephemeris or JPL comparison, imports no output from those instruments, and
uses no personal birth records.
