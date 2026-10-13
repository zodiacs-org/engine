# Numeric core provenance

This port reads the checked-out engine, without fetching or consulting an
external ephemeris. Its code translates [deltat.ts](../src/deltat.ts) and
[time-scale.ts](../src/time-scale.ts), under the repository's
[MIT License](../LICENSE). [NOTICE](NOTICE) retains the time data attribution.
The local Cargo and npm manifests use `MIT AND CC-BY-4.0` because the built
libraries contain the Delta T values. The root package remains unchanged.

## Reproducible translation

[generate-time-data.mjs](scripts/generate-time-data.mjs) pins the SHA-256 of
`src/deltat.ts` and `src/time-scale-data.ts`. It rejects a changed input before
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
identify those recorded sources; this milestone makes no new external-source
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
refresh needs review before those pins change. Only `meanObliquity` from
the houses file and `gastHours` from the ephemeris file are translated here.

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
copy the source's Moon or Pluto tables. Generated data are not committed.

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
