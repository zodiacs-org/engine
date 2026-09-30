# Preregistration: `@zodiacs/engine/calc` frames and outputs

Written and committed before any comparison of the calc entry point with an
arbiter. The code under test is commit `29679e8` (branch `feature-api`), whose
bounds table is empty; nothing the comparison measures feeds back into the
positions, only into the bounds table and the documents afterwards. Programme
units: P3.2 (uniform calculation API) and P2.D (frames and outputs) of the
engine and platform brief, version 2.

## Arbiters

- **NASA JPL Horizons** (DE441), through its public API
  (`https://ssd.jpl.nasa.gov/api/horizons.api`), `EPHEM_TYPE=VECTORS`,
  `REF_SYSTEM=ICRF`, `REF_PLANE=FRAME`, `OUT_UNITS=AU-D`, `CSV_FORMAT=YES`,
  `TIME_TYPE=TT`, `TLIST_TYPE=JD`. `VEC_CORR` is `NONE` (geometric), `LT`
  (light time: astrometric) or `LT+S` (light time and stellar aberration:
  apparent without deflection, which is this engine's apparent). Each
  response is kept verbatim with its exact URL and SHA-256; a response is
  never refetched or edited.
- **ERFA** through pyerfa 2.0.1.5 (ERFA 2.0.1), numpy 2.4.6, Python 3.11.15:
  every frame of the arbiter is built from Horizons's ICRF vectors with the
  IAU 2006/2000A models, as below. No Swiss Ephemeris code, data or output is
  used, and none is committed.

## Corpus

- **Instants**: 32 TT Julian dates, k = 0 … 31:
  `jd_tt(k) = round(2378496.5 + 146097 × frac(0.5 + k × 0.6180339887498949), 6 decimals)`,
  from 1802-08-19 to 2188-11-08, the first being J2000.0. For speeds, each
  instant is also requested at `jd_tt ± 0.0001`.
- **Targets** (Horizons `COMMAND`): Sun 10, Moon 301, Mercury 199, Venus 299,
  Earth 399, and Mars to Pluto as system barycentres 4 to 9, as the
  conformance suite's L1 vectors are.
- **Centers**: geocentric `500@399` (all but the Earth); heliocentric `500@10`
  (all but the Sun); barycentric `500@0` (all); topocentric `coord@399`,
  `COORD_TYPE=GEODETIC`, at two synthetic sites, S1 45° N 10° E 0 m and S2
  35° S 60° W 1500 m, for the Sun, the Moon and Mars.
- **Corrections requested**: geocentric NONE, LT, LT+S; heliocentric NONE, LT,
  LT+S; barycentric NONE, LT; topocentric NONE, LT+S. `NONE` requests are made
  at the 32 instants with `VEC_TABLE=2` (position and velocity); the others at
  the 96 instants with `VEC_TABLE=1`.
- **ΔT**: one `OBSERVER` request, `QUANTITIES=30` (TDB − UT), geocentric, at
  the 32 instants. The topocentric comparisons pin the engine's ΔT to it, so
  that both sides turn the Earth by the same UT1; every other comparison uses
  the engine's own model, which moves no geocentric position at a given TT.
- The engine is run as `calc({ body, time: { jd: jd_tt, scale: "TT" }, frame,
  center, flags })` from the built `dist/calc.js`, in all eight frames.

## Frames of the arbiter

With `u` Horizons's ICRF vector at TT `t`: `equatorial-icrs` = u;
`equatorial-j2000` = B u with B the frame bias of `erfa.bp06`;
`equatorial-mean-of-date` = `erfa.pmat06(t)` u; `equatorial-true-of-date` =
`erfa.pnm06a(t)` u; `ecliptic-icrs` = R1(ε₀) u and `ecliptic-j2000` =
R1(ε₀) B u with ε₀ = `erfa.obl06` at J2000.0 (84381.406″);
`ecliptic-mean-of-date` = R1(`obl06(t)`) `pmat06(t)` u;
`ecliptic-true-of-date` = R1(`obl06(t)` + Δε) `pnm06a(t)` u, with Δε from
`erfa.nut06a(t)`. The arbiter's rates are central differences of its own
coordinates over `t ± 0.0001` day, frames evaluated at each instant; for
`NONE` requests, Horizons's velocity turned by the frame matrix, plus the
matrix's own rate from a central difference over `t ± 0.0001` day.

## (a) Frame-transform consistency: rules, fixed now

Each check turns the engine's own output with ERFA and compares it with the
engine's output in another frame, as the angle between the two directions.
Run over the 32 instants for the ten geocentric apparent bodies (Sun, Moon,
planets) and, where marked, the true node. A check PASSES when every case is
within its tolerance, and FAILS otherwise; nothing is excluded.

| check | engine output compared | ERFA transform applied | tolerance |
| --- | --- | --- | --- |
| C1 spherical ↔ cartesian | x, y, z | from lon, lat, dist | 1 µas (1e-6″), and relative distance 1e-12 |
| C2 ICRS ↔ J2000.0 | equatorial-icrs | B⁻¹ of `bp06` on equatorial-j2000 | 10 µas |
| C3 J2000.0 → mean of date | equatorial-mean-of-date | the precession matrix `rp` of `bp06(t)` on equatorial-j2000 | 0.1 mas |
| C4 mean → true of date | equatorial-true-of-date | `erfa.numat(obl06, Δψ, Δε)` of `nut06a(t)` on equatorial-mean-of-date | 5 mas |
| C5a ecliptic → equator of date, ERFA's obliquity | equatorial-true-of-date | R1(obl06 + Δε)ᵀ on ecliptic-true-of-date | 5 mas |
| C5b the same, the engine's own true obliquity | equatorial-true-of-date | R1(ε, astronomy-engine's `e_tilt`)ᵀ | 1 µas |
| C6 mean ecliptic ↔ mean equator of date | equatorial-mean-of-date | R1(obl06)ᵀ on ecliptic-mean-of-date | 1 µas |
| C7 J2000.0 ecliptic ↔ equator | equatorial-j2000 | R1(84381.406″)ᵀ on ecliptic-j2000 | 1 µas |
| C8 ICRS ecliptic ↔ equator | equatorial-icrs | R1(84381.406″)ᵀ on ecliptic-icrs | 1 µas |
| C9 J2000.0 → true of date, whole chain | equatorial-true-of-date | `pnm06a(t)` Bᵀ on equatorial-j2000 | 5 mas |
| C10 the true node's frames | North Node in equatorial-true-of-date | R1(obl06 + Δε)ᵀ on its ecliptic-true-of-date direction | 5 mas |

The tolerances follow from the models: 1 µas where both sides do the same
arithmetic; 10 µas for the frame bias, whose IAU 2006 parameterization in
ERFA rounds its angles to 1 µas; 0.1 mas for precession, where the engine's
P03 angles and ERFA's Fukushima–Williams angles are two expansions of the same
IAU 2006 model; 5 mas where the engine's IAU 2000B nutation meets ERFA's IAU
2006/2000A, which McCarthy and Luzum (2003) put within 1 mas of each other
from 1995 to 2050.

## (b) Absolute agreement with Horizons: procedure, fixed now

No pass or fail: the statistics are reported as measured. For every center,
correction, body and frame over the corpus instants:

- **position**: the angle between the engine's and the arbiter's directions;
  the longitude difference times the cosine of the latitude, and the latitude
  difference (right ascension and declination in the equatorial frames);
- **distance**: the relative difference of `dist` from the arbiter vector's
  length (the light path for LT and LT+S);
- **speed**: the angular-rate difference, the norm of the differences of the
  longitude rate times the cosine of the latitude and of the latitude rate;
  and the relative difference of the distance rate;
- each reported as median, 95th percentile (`numpy.percentile`, linear) and
  maximum, with the count.

The engine's apparent geocentric Moon is its series at the instant, without
light time or aberration (its convention); it is compared with Horizons's
LT+S and with NONE, and both are reported. Separately, and without Horizons,
the engine's own light-time term for the Moon is measured as the angle
between the series at t and at t − τ.

Sanity limits, to find defects and not to exclude data: an angular
difference above 60″ for any body and center, or above 10″ for the geocentric
Sun, is investigated and explained in the results before anything is
published. Every case is reported; none is dropped.

**The true node** is compared with the ascending node of the osculating
geocentric orbit computed from Horizons's geometric Moon state (`NONE`,
position and velocity) in the IAU 2006/2000A true ecliptic of date. **The
mean node and Lilith** are compared with the same definitions evaluated in
Python on ERFA's fundamental arguments (`faom03`, `faf03`, `fal03`) with
ERFA's Δψ (`nut06a`) and the engine's published mean inclination; this checks
the implementation of a definition, not an ephemeris.

## Bounds rule, fixed now

The bounds table in `src/calc-bounds.ts` takes, for each center, correction
and body, the largest angular difference over all instants and all eight
frames, the largest relative distance difference, and the largest
angular-rate difference, each rounded up to two significant figures, labelled
`measured`, with the corpus named in its basis. The nodes and Lilith take the
largest difference from their comparisons above. Combinations not compared
get no measured value. A test checks that the table and the committed summary
agree.

## Speed method, engine-internal

Without an arbiter, the central difference's own error is estimated for each
body by Richardson's rule, |D(2h) − D(h)| / 3, from the engine's positions at
ISO instants, and reported as an estimate beside the Horizons comparison.

## Reporting

Raw responses, their requests and digests, the scripts, the summary JSON and
`RESULTS.md` are committed in this directory. Any deviation from this plan is
listed in `RESULTS.md` under "Deviations", with its reason.
