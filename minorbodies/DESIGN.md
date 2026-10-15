# Minor-body ephemeris design

## Status and scope

This is the design adopted in M1. Only the catalogue, acceptance policy and
synthetic engine-contract checks are implemented. No position accuracy,
installed dataset or operational supported range is claimed yet.

The required targets are Chiron, Ceres, Pallas, Juno and Vesta. Pholus and
Eris can follow only after the same checks. The target interval is
1800-01-01T00:00:00 TT inclusive through 2201-01-01T00:00:00 TT exclusive,
including the whole calendar year 2200. `src/acceptance.ts` defines that
requirement; `tests/catalog.test.ts` preserves the preregistration. Actual
availability must come from a validated dataset manifest, never from the
catalogue alone. There is no extrapolation outside installed coverage.

The package provides geocentric ecliptic longitude and latitude in degrees,
distance in au, longitude and latitude speed in degrees per TT day, distance
speed in au per TT day, and `retrograde = longitudeSpeed < 0`. A zero speed
does not imply a reversal. Future results must identify their frame, clock,
corrections and source dataset. Houses, planetary ephemerides and the HTTP
chart API remain the engine's responsibilities.

## Chosen representation

Fit piecewise Chebyshev polynomials to Horizons geocentric Cartesian
positions on fixed ICRF axes. Evaluation uses Clenshaw recurrence and
analytic polynomial derivatives. Cartesian fitting avoids wrapping at a
longitude boundary and avoids fitting nutation into the source table.
Distance is the Cartesian norm. Segment lengths and polynomial degree are
chosen on a pilot and tuning samples, then recorded in the manifest.

The alternative, propagating osculating elements with perturbations, would
require a force model, perturbing ephemeris, integrator error control and
validation of long-term dynamics. JPL describes elements as a state at an
epoch and its small-body ephemerides as integrated trajectory solutions
([orbit determination](https://ssd.jpl.nasa.gov/orbits_doc.html)). Interpolating
that solution makes the local numerical error and dataset identity easier
to audit. This is a design judgment, not a measured size or speed comparison.

Use these explicit Horizons settings, with a numbered asteroid selector
from `src/catalog.ts` and discrete Julian dates:

```text
EPHEM_TYPE=VECTORS
CENTER=500@399
REF_SYSTEM=ICRF
REF_PLANE=FRAME
VEC_CORR=LT+S
VEC_TABLE=2
OUT_UNITS=AU-D
TIME_TYPE=TT
TLIST_TYPE=JD
CSV_FORMAT=YES
OBJ_DATA=YES
MAKE_EPHEM=YES
```

The [Horizons manual's time specification](https://ssd.jpl.nasa.gov/horizons/manual.html#time)
allows TT for vectors, while the API parameter table omits that option.
Require a returned `JDTT` table and matching TT metadata; do not silently
fall back to TDB or relabel a time column. The generator must also verify
the resolved body, center, axes, units and corrections in the response.
Capture the actual API signature and reject unreviewed format changes.

`LT+S` supplies receive light-time and stellar aberration, without adding
solar gravitational deflection locally. The final convention must say
this explicitly. Do not treat the returned velocity columns as the
derivative of every corrected observable without verifying their meaning;
differentiate the fitted positions and validate with independent positions
around each held-out epoch.

## Time, frames and engine reuse

Reuse `src/date-input.ts` and `src/time-scale.ts` through a companion
`engine-bridge.ts` when implemented. ISO/Date inputs follow the engine's
time basis; explicit TT Julian dates avoid uncertain civil-time conversion.
Historical and future UTC uncertainty remains separate from interpolation
agreement. Coverage checks apply after conversion to TT, including all
derivative probes. Default engine calc coverage ends earlier than this
project's target: dispatching ordinary bodies must preserve its refusals.

The engine's frame functions consume mean equator/equinox J2000 vectors,
called EQJ. Convert JPL ICRF to EQJ using the transpose of
`frameMatrix("equatorial-icrs", at)`, then apply
`frameMatrix("ecliptic-true-of-date", at)` from `src/calc-frames.ts`.
This reuses the engine's frame bias, IAU 2006 precession and IAU 2000B
nutation. Do not pass ICRF vectors directly to `eclipticOfDate`.

A rotating frame's velocity includes its matrix derivative. Rotating only
the fitted Cartesian velocity is insufficient. Include that term, or
difference the complete reduced position on a documented TT interval and
test convergence independently. At seams, check both position and speed
from both segments. Reject discontinuities that could create false stations.

These helpers are source-level dependencies, not public engine exports.
Record the engine source identity and isolate imports in the bridge.
Dependency and output preparation must write only under this directory.

## Accuracy acceptance

The following are proposed pass limits, not measurements or physical
uncertainty bounds. Their executable definition is `ACCEPTANCE_POLICY` in
`src/acceptance.ts`; its configuration test does not establish accuracy.

| Quantity | Maximum allowed absolute error | Comparison |
| --- | ---: | --- |
| Fitted direction | 0.05 arcsec | Held-out Horizons ICRF vectors |
| Ecliptic longitude | 1 arcsec | Held-out Horizons with independent frame reduction |
| Ecliptic latitude | 1 arcsec | Same independent reduction |
| Distance | 1e-7 au | Held-out Horizons vector norm |
| Longitude speed | 0.1 arcsec per TT day | Differences of held-out reference positions |
| Latitude speed | 0.1 arcsec per TT day | Same reference differences |
| Distance speed | 1e-8 au per TT day | Differences of held-out reference distances |

The direction fit receives a tighter limit to leave room for reduction,
time conversion and differentiation. End-to-end longitude and latitude
assertions remain mandatory; passing the fit limit cannot substitute for
them. Distance and derivative gates guard errors an angular fit alone
can hide, especially around stations. No allowance covers source orbit
uncertainty: matching a JPL solution does not measure its distance from
the physical sky. Near a station, a speed's sign can be uncertain even
when its numerical error passes the gate.

Separate training epochs, tuning epochs and final validation epochs before
fitting. The final corpus must not influence degree or segmentation. If
it reveals a failure, retain that result and preregister a new independent
corpus before changing the fit. Include endpoints, both sides of seams,
irregular interior epochs throughout the target interval and independent
station/ingress neighborhoods for each body. Assert disjoint epoch sets.

Compare vectors first, then ecliptic coordinates reduced by a separate
ERFA-based reference script. That script must not import this package's
fitter, evaluator or engine frame implementation. Use circular longitude
error, latitude error, vector separation and radial error separately.
Reference speed differences need a convergence study; reference stencil
epochs must also be absent from the training set. Horizons observer
ecliptic output can be a secondary check, with its frame and deflection
differences reported rather than silently folded into the tolerance.

Vitest must eventually assert these maxima on independent source fixtures.
Reports must state the tested epochs and solution identities. Finite sample
maxima are not proofs for all times. Missing full datasets cannot result in
a passing full-span suite through skipped tests. Ordinary offline unit
tests and the explicit full-data validation command must have distinct scope.

## Adapter and searches

Engine `calc()` and `events()` use closed body lists and have no provider
hook. A companion `calcWithMinorBodies` will delegate ordinary requests to
engine calc and handle minor bodies locally. Its result and receipt types
must remain distinct. Unsupported centers, zodiac choices, frames or
corrections must be refused explicitly. No cast can make an engine
`CalcPosition` genuinely support a new body.

The existing `BodyLongitudeAt<MinorBody>` callback plugs directly into
`searchLongitudeCrossingsWith` in `src/crossings.ts`. The synthetic test
`tests/engine-contract.test.ts` verifies that interface and its budget
refusal. Aspects use `findConfiguredAspects` with `{ body, lon, speed }`
rows and an explicit `policy.bodies` selection. Mixed rows must share a
frame, correction convention and speed clock; preserve each input receipt.

Stations will use that same crossing solver on the monotone mapping
`180 + atan(speed / speedScale) * 180 / PI`, targeting 180 degrees with a
positive speed scale. Classify a reversal from one-sided speed signs;
the solver's direction flag on this mapping describes speed increasing or
decreasing, not longitude retrograde state. Partition retrograde windows
from stations and endpoint signs. Sign ingresses search ordinary longitude
at sign boundaries. These wrappers must not copy the engine's event solver.

Preserve the solver's boundary, budget and deduplication conventions, and
document its smoothness assumption. Combined searches need a shared budget
and whole-result refusal. Event results record clipping at query boundaries,
search settings and the dataset receipt. Establish event timing by independent
reference brackets, not by reusing this package's previous event output.

## Data lifecycle and receipts

Downloads go to `.cache/`; fitted shards and full reports go to `generated/`.
Keep them gitignored. Keep source code, request manifests, original compact
reference samples and reviewed evidence notes in this folder. Every committed
file and generated data shard must stay below the file-size limit in
`ACCEPTANCE_POLICY`. Split data and requests before reaching that limit.

The generator is explicit, serial and cached, with bounded retries and
backoff. No runtime network call or import-time fetch is permitted. Reject
mixed orbit solutions across batches. Capture complete request parameters,
response hashes, target and perturber solution identifiers, retrieval time,
API signature, generator identity, segment layout and output hashes.
Rebuilding frozen inputs must be deterministic. A new live JPL fetch can
produce a new solution and therefore a new dataset identity; a manifest
does not make the remote service immutable. Preserve original responses
locally for an offline rebuild and fail on digest mismatch.

Every calculation, event and structured refusal must carry its applicable
request/convention receipt, with dataset identity when one was loaded.
Numerical results also identify the engine bridge, source solution, shard
digest, coverage and validation evidence status. Receipts describe
provenance; they do not authenticate it or turn sample errors into bounds.
