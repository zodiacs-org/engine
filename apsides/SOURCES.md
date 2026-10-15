# Apsides sources and provenance

M1 cites definitions and existing engine contracts. M2 registers reference
queries, acceptance budgets and held-out cases, and freezes independent
development samples before engine/reference comparisons. M3 tests the
scalar solver with analytic synthetic functions. M4 compares the lunar
window search with the frozen development Moon fixture. M5 compares the
heliocentric searches with all frozen development planetary fixtures,
retaining the Pluto distance failures. No astronomical test
expectation comes from this package's prior output or Swiss Ephemeris.

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

## Reference conventions

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

Each fixture records its source URL and query parameters,
retrieval date, response digest, ephemeris solution, target, origin, time
scale, units, sample rows and independent derivation of the reference event.
The generator verifies header conventions, rejects malformed or
non-finite samples, and preserves neighboring samples to audit the
turn and its uncertainty. Frozen inputs are never silently refetched under
the same identity. Live downloads belong in an ignored generated directory;
ordinary library calls and tests use local inputs.

## M2 numerical references and collection

The development corpus is indexed by
[references/manifest.json](references/manifest.json). It binds the exact
registration and compact fixture bytes with SHA-256. Every fixture records
the actual returned target and origin names, their ephemeris solution
labels, API version, geometric conventions and TT epochs. The `sources`
entries retain exact request parameters, URLs, retrieval times and raw
response digests. Source indices on the sample rows identify their request.
No expected apsis date or value was calculated by the engine.

The independent method and selected windows are in
[references/PREREGISTRATION.md](references/PREREGISTRATION.md). The
collector refines signed range-rate brackets and directly queries their
midpoints. Wider distance probes verify each turn. `test/references.vitest.ts`
checks the frozen evidence; `test/horizons-io.vitest.ts` checks rejection of
wrong centers, scales, units, corrections, incomplete tables and corrupt
caches. These are integrity checks, not engine accuracy results.

`test/lunar-reference.vitest.ts`, added in M4, compares `searchLunarApsides`
with `references/fixtures/dev-moon-2000.json`: geocentric Moon, Horizons
DE441, 2000-01-01 to 2000-02-01 TT. It checks all fixture events against
the preregistered timing and distance limits, with no missing or extra
events. Separate same-TT checks use the fixture's before/at/after samples
for distance, signed radial speed and total speed. The source is the
frozen numerical fixture and its recorded requests, not the engine's
event output. This is development coverage; no held-out case is evaluated
in M4 and no broader completeness claim follows from these tests.

`test/planetary-reference.vitest.ts`, added in M5, uses the fixed
development planetary fixtures in the same manifest. It checks every
fixture event, with unique timing matches, matching counts and kinds,
event distance, and separate same-TT distance and radial/total-speed
comparisons at the independent before/at/after samples. The exact windows,
centers, target IDs and solution labels remain in those frozen fixtures;
[VALIDATION.md](VALIDATION.md) lists the tested spans and failing checks.
No held-out fixture or physical-center check was evaluated. Pluto's
distance failure is retained under the original budget, not removed from
the corpus or converted to a passing regression expectation.

Additional primary pages fetched and read on 2026-10-15:

- [JPL SSD API fair-use policy](https://ssd-api.jpl.nasa.gov/), **Fair Use
  Policy**: sequential requests, reuse of cached results, application
  identification and output-version checking. The collector implements
  these conventions and stops after a failed request. It supports the
  text API version actually returned by the development queries; a changed
  version requires review before parsing.
- [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html),
  **Cartesian State Vector Table**, **Specification of Time**, **Statement
  of Ephemeris Limitations**, and **Acknowledgements**: the output
  conventions, distinction between numeric precision and model uncertainty,
  and provider attribution. Reference rate brackets localize a root of the
  named solution, not an independently bounded physical truth.
- [NASA Open Data Horizons catalog](https://data.nasa.gov/dataset/horizons),
  **License**: lists the license as unspecified.
- [JPL SSD FAQ](https://ssd.jpl.nasa.gov/faq.html), **I'd like to publish
  information from your site on my site. Do I need permission?**: describes
  general republication guidance and links JPL's copyright policy. It does
  not distinguish generated numerical calculation results from existing
  website content.

Attribution: Giorgini, JD and JPL Solar System Dynamics Group, NASA/JPL
Horizons On-Line Ephemeris System,
[ssd.jpl.nasa.gov/horizons](https://ssd.jpl.nasa.gov/horizons/). Each source
entry records its retrieval time and the returned target/origin solutions.
Use of these references implies no NASA/JPL endorsement.

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
- M7's `test/event-records.vitest.ts` checks the serialized event motion
  records against replay of their original engine requests, including units,
  TT offsets and unchanged engine bounds. This is an integration check, not
  independent accuracy evidence. Its inputs use only the registered
  development windows. The existing Horizons tests remain the independent
  distance and speed comparisons; no reference fixture or budget changes.
- M5 also read the pinned `astronomy-engine@2.1.19` implementation installed
  with the carried archive dependency: `esm/astronomy.js`, functions
  `CalcVsop`, `CalcVsopPosVel`, `VsopDeriv` and `HelioState`. For Mercury
  through Neptune, including Earth, the state differentiates the same VSOP
  series used by the position. The engine's
  [geometricState](../src/calc-reduce.ts) and
  [sphericalRates](../src/calc-frames.ts) carry those derivatives into the
  geometric `calc` distance rate. This supports bisection of that rate for
  those targets. Pluto uses its separate position/state interpolation and
  retains scalar distance minimization. No dependency source or coefficient
  is copied into apsides.

## Licensing and attribution

Original code and documentation in `apsides/` follow the repository's
[MIT license](../LICENSE). The engine is by Zodiacs.org; its ephemeris
dependency is astronomy-engine by Don Cross, licensed MIT. Preserve the
engine's [NOTICE](../NOTICE) and [LICENSING.md](../LICENSING.md) when
redistributing that dependency. The engine's distribution also carries
CC BY 4.0 delta-T values credited there to Stephenson, Morrison and
Hohenkerk, so its package license is `MIT AND CC-BY-4.0`. This project does
not relicense those materials.

The compact M2 fixtures retain selected factual numerical calculation
results and target/solution identifiers. Their selection, schema and
reference derivation are this project's work. They copy no provider prose,
website table or complete response. Raw responses remain in the ignored
cache. The fetched API documentation supplies no numerical-output license;
the NASA catalog lists the license as unspecified, and the FAQ's general
republication guidance is linked above. We do not relicense JPL material or
assert that all JPL content is public domain. Existing repository licensing
records are context, not a blanket license for external content.

No Swiss Ephemeris material, proprietary atlas data, credentials or personal
birth data is used. `test/solver.vitest.ts` and `test/solver-edge.vitest.ts`
use independently defined polynomials and periodic curves with analytic
extremum locations, plus constant and rounded curves, to test solver
behavior separately from independent astronomical accuracy tests. Repeated
solver runs check determinism and budget accounting only; they do not
supply physical reference values.
