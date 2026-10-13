# Time data provenance

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
