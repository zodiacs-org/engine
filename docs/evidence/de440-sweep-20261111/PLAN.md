# Plan: the dense DE440 sweep of `@zodiacs/engine/calc`

Written and committed before the sweep's first run. Linear ZOD-65.

## Why

The limits a calc receipt quotes (`src/calc-bounds.ts`) are the largest
differences found at 32 instants against JPL Horizons
(`docs/evidence/calc-api/PREREGISTRATION.md`, rerun in
`docs/evidence/calc-api/rc16/`). ZOD-65 quotes an accuracy review of
1.1.0-rc.2 against DE440 on 146,097 daily dates whose largest differences are
above several of those limits. That review's data is not in this repository,
so its figures cannot back a number here. This sweep measures the same thing
with committed tools, on the kernel itself, so that the limits can be
regenerated from evidence the repository holds.

This plan measures and reports. It changes no packed file: `src/calc-bounds.ts`
stays as it is, and regenerating it is a later candidate's step.

## Where it runs

In this repository's GitHub Actions, workflow `.github/workflows/de440-sweep.yml`,
because the kernel has to come from NAIF and a runner can fetch it. The
workflow reuses the tier-B job's kernel URL
(`https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp`),
its pinned SHA-256 (`a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5`)
and its cache key, so one fetched copy serves both. The kernel is checked by
its digest in every job that reads it and is never uploaded or committed. No
mirror, cache or third-party copy of the kernel is used.

## Corpus

- **Instants**: the TT Julian dates 2378497.0 + i for i = 0 to 146096: noon TT
  of every day from 1800-01-01 to 2199-12-31, 146,097 instants. Noon, not
  midnight, because midnight TT on 1800-01-01 is some 19 seconds of UT1 before
  the start of the engine's span, and the engine refuses it. The instants are
  given to the engine as TT, as the preregistered comparison gives them, so
  that ΔT moves nothing.
- **Bodies**: the Sun, the Moon, Mercury, Venus, and Mars to Pluto as the
  planets' system barycentres (kernel targets 4 to 9), as the preregistered
  comparison and the conformance suite's L1 vectors take them; and the true
  node and its opposite point.
- **Center**: geocentric only. **Corrections**: geometric, astrometric and
  apparent for the bodies; the nodes have none.
- **Frames**: all eight of `CALC_FRAMES`.
- **Engine**: `calc({ body, time: { jd, scale: "tt" }, frame, center:
  "geocentric", flags: { correction } })` from `dist/calc.js`, built by `npm
  run build` from the commit the workflow checks out
  (`tools/engine_sweep.mjs`).
- Eight eras of fifty years run as eight jobs, and `tools/sweep.py merge`
  joins them; it refuses to if they do not join into the 146,097 instants on
  one build and one kernel.

## Arbiter

`tools/sweep.py` is the reduction of `docs/evidence/calc-api/tools/compare.py`
with one substitution. Where that comparison reads Horizons's ICRF vectors
(DE441) from committed responses, this one forms the same three vectors from
`de440.bsp` through jplephem 2.24, with pyerfa 2.0.1.5 (ERFA 2.0.1) and numpy
2.4.6 on Python 3.11, the versions `conformance/arbiters/l1/validation.json`
records:

- TDB from TT at the geocentre by `erfa.dtdb`;
- **geometric** (Horizons's `NONE`): target minus geocentre at the instant,
  with its velocity;
- **astrometric** (`LT`): the target where its light left, by iteration until
  the light time changes by less than 1e-14 day;
- **apparent** (`LT+S`): the astrometric direction with the stellar aberration
  of the geocentre's barycentric velocity (`erfa.ab`), its length the light
  path. No light deflection, as the engine's apparent place has none.

Each vector is turned into each frame with ERFA's IAU 2006/2000A models
exactly as `compare.py`'s `frame_matrix` does. The engine's apparent Moon is
its series at the instant; as in the preregistered comparison it is compared
with `LT+S`, which gives its bound, and with `NONE`, which is reported.

**The true node.** DE440 has no node. The reference is the preregistered
one: the ascending node of the osculating geocentric orbit, from the kernel's
geometric Moon position and velocity in the ICRF, in the IAU 2006/2000A true
ecliptic of date (`compare.py`'s `node_of_state`), turned into each frame. It
is the definition `docs/de440.md` gives for the DE440 entry's own node. The
South Node's reference is 180° from it.

## What is measured

As `compare.py` measures it, for every correction, body and frame over every
instant: the angle between the engine's and the arbiter's directions; the
longitude difference, as it is and times the cosine of the latitude; the
latitude difference; the relative distance difference; and the angular-rate
difference, the arbiter's rates being central differences of its own
coordinates over 0.0001 day either side. The nodes' rates are not compared,
as they were not before.

One figure is added that is not part of the bounds rule: for the apparent
places in the true ecliptic of date, the same differences against a
reference that also has the Sun's light deflection (`erfa.ld`, as
`conformance/arbiters/l1/validate.py` applies it), so that a public sentence
about apparent longitudes can be checked against the place a reader would
expect as well as against the engine's own convention.

Reported: for each case and frame, the count, the largest difference and the
date it falls on; for each era, the median, the 95th percentile
(`numpy.percentile`, linear) and the largest. Nothing is excluded.

## Self-checks, fixed now

The arbiter is new code, so before any era runs it is checked against what the
repository already holds. Both gates must pass or the sweep does not run.

- **S1.** The full apparent place (with deflection) in the true ecliptic of
  date, and the osculating node, formed by this code from the kernel, against
  the ERFA chain's oracles at their 200 instants
  (`docs/evidence/de440-20261110/oracles/`, checked by digest): every angle
  within 0.01″. The chain and this code may differ by the nutation model and
  by the form of the deflection, a few milliarcseconds at most.
- **S2.** The three geocentric vectors formed by this code against Horizons's
  committed vectors (`docs/evidence/calc-api/horizons/`) at the 32
  preregistered instants: every angle within 0.05″. This is DE440 against
  DE441 and one aberration formula against another, which should differ by far
  less.

## Sanity limits

From the preregistration: an angular difference above 60″ for any body, or
above 10″ for the geocentric Sun, is investigated and explained before
anything is published. Every case is reported; none is dropped.

## Bounds rule

The preregistered one, unchanged: for each correction and body, the largest
angular difference over all instants and all eight frames, the largest
relative distance difference and the largest angular-rate difference, each
rounded up to two significant figures. `summary.json` holds them under
`bounds`, with the keys `bounds.py` reads, for the geocentric rows only.

`tools/dry_run.py` then shows what `src/calc-bounds.ts` would become, row by
row and as a diff, and runs the unmodified `bounds.py --check` on the sweep's
summary. It writes nothing outside the results directory.

## What this plan does not do

- It does not change `src/calc-bounds.ts`, any other packed file, or any
  receipt wording.
- It does not sweep the heliocentric, barycentric or topocentric rows, or the
  mean node and Black Moon Lilith, whose references are definitions and not
  an ephemeris.
- It measures the build of the commit it runs on. A figure from it is not
  carried to another build.

## Pass conditions

- P1. A job of the workflow gets `de440.bsp` from NAIF's URL or from the
  shared cache, verifies the pinned SHA-256, and is green.
- P2. The workflow runs the sweep over the 146,097 instants for the Sun, the
  Moon, Mercury to Pluto and the true node in all eight frames, writes a
  `summary.json` that `bounds.py` reads and a readable report, and is green.
- P3. The results are committed here with the run id and the kernel's
  SHA-256, and the dry run shows which limits would change and to what, beside
  the figures ZOD-65 quotes.
- P4. Every existing check stays green and no packed file changes.

## Reporting

The tools, this plan, the results (`results/`: `summary.json`, `tables.md`,
`report.md`, `calc-bounds.dry-run.diff`, `selfcheck.json`, and each era's
results in `results/eras/`) and a README are committed in this directory. Any
deviation from this plan is listed in the README under "Deviations", with its
reason.
