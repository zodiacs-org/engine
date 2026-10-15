# Apsides sources and provenance

M1 cites definitions and existing engine contracts. It contains no
independent apsis fixture and makes no measured accuracy claim. M2 will
register reference queries, acceptance budgets and held-out cases before
engine/reference comparisons. No test expectation may come from this
package's prior output or Swiss Ephemeris.

## Primary sources read for M1

The following online pages were fetched and read on 2026-10-15.

- NASA/JPL Solar System Dynamics, [Horizons System manual](https://ssd.jpl.nasa.gov/horizons/manual.html).
  Locators: **General Definitions**, **Object Selection**, **Coordinate
  Center Selection**, **Specification of Time**, and **Customizing Output**.
  Geometric vectors refer target and origin to the same instant. Numeric
  target IDs distinguish physical centers from planetary system
  barycenters. The time section permits TT, TDB or UT for vector tables.
  Observer-table ranges include light-time effects and are unsuitable as
  the defining geometric distance here. The fixture generator must retain
  the actual solution and conventions named by every response.
- NASA/JPL Solar System Dynamics, [Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html).
  Locators: **Query Parameters**, **TLIST Parameter**, and **VEC_TABLE
  Parameter**. The planned query uses `EPHEM_TYPE=VECTORS`,
  `VEC_CORR=NONE`, `VEC_TABLE=3`, `OUT_UNITS=KM-S`, `REF_SYSTEM=ICRF`,
  `REF_PLANE=FRAME`, `CSV_FORMAT=YES`, `TIME_TYPE=TT`, and explicit Julian
  dates with `TLIST_TYPE=JD`. The API parameter summary omits TT from its
  vector-table description; the manual explicitly allows it. Require the
  returned header to confirm the requested time scale instead of assuming
  it. Table type 3 includes position, velocity, range and range rate.
- International Astronomical Union, **2012 Resolution B2**, recommendations
  1 and 2, transcribed on the IAU Commission A3
  [reference-system resolutions page](https://iau-a3.gitlab.io/res.html#tabs-d1).
  The astronomical unit is exactly 149,597,870,700 metres, used with all
  time scales. Thus `AU_KM = 149_597_870.7`, enforced by the constant test in
  `test/sample.vitest.ts`. The original
  [resolution PDF URL](https://www.iau.org/static/resolutions/IAU2012_English.pdf)
  returned a missing-page response during this session; the readable
  commission transcription is the source actually used.

## Planned reference conventions

| Target | Horizons target ID | Origin | Reference point |
| --- | --- | --- | --- |
| Moon | `301` | `500@399` | Moon center relative to Earth center |
| Mercury | `199` | `500@10` | Planet center relative to Sun center |
| Venus | `299` | `500@10` | Planet center relative to Sun center |
| Earth | `399` | `500@10` | Earth center relative to Sun center |
| Mars through Pluto | `4` through `9` | `500@10` | System barycenter relative to Sun center |

The last row matches the existing engine comparison convention, not a claim
that a system barycenter is the planet's physical center. Additional
physical-center checks use `499`, `599`, `699`, `799`, `899` and `999` and
must be recorded as distinct references. Preserve the target and origin
names in addition to their numeric IDs. These conventions follow the
[Horizons object-selection documentation](https://ssd.jpl.nasa.gov/horizons/manual.html#select).

Use explicit TT instants for both the engine and Horizons. A TDB response
must not be relabelled TT. The manual's
[time-scale description](https://ssd.jpl.nasa.gov/horizons/manual.html#time)
distinguishes them and explains why historical or future UT conversion has
additional limitations. The fixed rotation between the engine's J2000
equatorial axes and Horizons ICRF does not change scalar distance or speed;
component-level comparisons would need the stated frame transformation.

Each future fixture must record its source URL and query parameters,
retrieval date, response digest, ephemeris solution, target, origin, time
scale, units, sample rows and independent derivation of the reference event.
The generator must verify header conventions, reject malformed or
non-finite samples, and preserve enough neighboring samples to audit the
turn and its uncertainty. Frozen inputs are never silently refetched under
the same identity. Live downloads belong in an ignored generated directory;
ordinary library calls and tests use local inputs.

## Local contracts and evidence

- [calc guide](../docs/calc.md) and [calc source](../src/calc.ts): accepted
  instants, geometric distances, Cartesian states, rate units, bounds,
  receipt contents and refusals. The wrapper requests the public API's
  behavior through a relative file dependency on the carried engine archive;
  it adds no alternative ephemeris.
- [calc geometry](../src/calc-reduce.ts): origin selection and geometric
  position/state construction from the pinned astronomy-engine dependency.
- [existing comparison preregistration](../docs/evidence/calc-api/PREREGISTRATION.md),
  **Corpus**: the existing engine's Mars-through-Pluto references are system
  barycenters. This is a source of model conventions, not an apsis fixture.
- [existing calc results](../docs/evidence/calc-api/RESULTS.md), **Speeds**:
  Pluto's reported analytic velocity and the derivative of its position do
  not coincide exactly. The apsides search therefore refines scalar
  distance and treats reported radial velocity as a diagnostic.
- [crossings source](../src/crossings.ts): existing search conventions for
  half-open windows, bounded evaluations and refusal. Its angular solver
  is not an independent distance-extremum reference.

## Licensing and attribution

Original code and documentation in `apsides/` follow the repository's
[MIT license](../LICENSE). The engine is by Zodiacs.org; its ephemeris
dependency is astronomy-engine by Don Cross, licensed MIT. Preserve the
engine's [NOTICE](../NOTICE) and [LICENSING.md](../LICENSING.md) when
redistributing that dependency. The engine's distribution also carries
CC BY 4.0 delta-T values credited there to Stephenson, Morrison and
Hohenkerk, so its package license is `MIT AND CC-BY-4.0`. This project does
not relicense those materials.

JPL and IAU pages are cited for definitions; their prose and tables are not
copied into fixtures by M1. Before future data is committed, M2 must record
the fetched provider terms and attribution for the specific numerical
responses. Credit NASA/JPL Solar System Dynamics and the identified
Horizons solution beside those fixtures. Existing repository licensing
records are context, not permission to assert that every external website
or dataset has the same license.

No Swiss Ephemeris material, proprietary atlas data, credentials or personal
birth data is used. Synthetic mathematical functions will test solver
behavior separately from independent astronomical accuracy tests.
