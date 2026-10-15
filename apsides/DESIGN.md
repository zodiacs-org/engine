# Apsides design

M1 provides the geometric distance sampler and its integration contracts.
M2 adds independent development references and reserves held-out windows.
M3 implements a pure scalar distance solver with synthetic mathematical
tests. M4 adds the lunar window search and compares it with the development
Moon fixture. Planetary searches, syzygy annotations and the CLI remain
planned in [PLAN.md](PLAN.md).

The intended result is a chronological list of local distance extrema in a
requested window. A lunar minimum is a perigee and a lunar maximum an
apogee. A heliocentric minimum is a perihelion and a maximum an aphelion.
These are extrema of the sampled distance function, not the direction of a
mean apogee or an osculating orbital element. No result ranks dates or
predicts effects on people or events.

## Geometry and the current API

`sampleDistance(body, time)` calls the engine's public `calc` API from the
carried archive installed through a relative file dependency. It requests
geometric Cartesian positions and speeds in
`equatorial-j2000`. It returns an `ok` sample or the engine's `CalcRefusal`;
malformed inputs follow the engine's validation contract. It makes no
network request or filesystem write and does not implement an ephemeris.

The Moon uses the Earth's center as origin. Mercury through Pluto,
including Earth, use the Sun's center as origin. The target metadata carries
`referencePoint`: `body-center` for the Moon, Mercury, Venus and Earth, and
`system-barycenter` for Mars through Pluto. This preserves the comparison
convention of the engine's existing evidence, described in
[SOURCES.md](SOURCES.md). The engine does not separately resolve every
planet's displacement about its satellite system's barycenter. Consequently
the latter targets must not be represented as exact physical body-center
extrema. Independent physical-center comparisons and this limitation remain
part of the planetary validation work.

Each sample carries distance in au and kilometres, signed
`radialSpeedKmPerSecond`, nonnegative `orbitalSpeedKmPerSecond`, and the
engine receipt. Distance is the norm of the geometric relative position;
the engine's distance field supplies that value. The radial speed is its
reported distance rate, positive away from the origin. Orbital speed is the
norm of the relative Cartesian velocity. The au conversion is the IAU
definition cited in [SOURCES.md](SOURCES.md), not a fitted constant.

At a distance extremum the derivative of distance vanishes; the body's
total speed generally does not. The names keep these meanings separate.
Engine geometric planetary speeds in an inertial frame come from its state
vectors; the Moon's speeds use central differences. In particular, the
engine's existing Pluto evidence reports a discrepancy between its state
velocity and a numerical derivative of its position. A small reported
radial speed alone therefore cannot certify a distance extremum.

The library is synchronous and deterministic for its input and installed
engine. As documented by the engine, a calculation manages the shared
astronomy-engine delta-T setting. This wrapper adds no independent global
state. Receipts describe the computation and model; they are not signatures
or independent accuracy certificates.

## Scalar solver implemented in M3

`searchDistanceExtremaWith(distanceAt, options)` in `src/solver.ts` accepts
a deterministic callback returning positive distance in kilometres. Its
time coordinate is seconds from a caller-chosen continuous origin,
intended to be TT. It imports no ephemeris and performs no I/O. Required
options are `sampleTimesSeconds`, `toleranceSeconds` and `maxEvaluations`.
The grid must contain strictly increasing finite times and a finite total
span; the tolerance is positive and finite, and the evaluation cap is a
positive safe integer. The grid is copied before invoking the callback.

The solver evaluates the supplied grid, then brackets strict minima and
maxima from neighboring distance comparisons. Equal adjacent grid values
trigger a midpoint probe. A strict midpoint turn supplies a bracket; an
equal midpoint refuses the search as `ambiguous-distance`. It does not
claim that a flat sampled curve has no extrema. Grid endpoints need outer
witnesses to become events, so the caller owns padding and filtering.

Each bracket keeps a best sampled point between strictly worse endpoint
distances. Golden-section refinement samples inside the longer side and
preserves these inequalities. When a probe ties the best distance, the
midpoint between tied witnesses can reveal a better point and a smaller
strict bracket. If it is worse, the observed shape contradicts unimodality
and the search refuses with `non-unimodal`. If it also ties, the entire
indistinguishable span is retained. A tied span wider than the requested
tolerance refuses as `ambiguous-distance`; a smaller one is never silently
discarded when narrowing the enclosing endpoints. Inability to represent
a required interior time refuses as `time-resolution`.

Each returned `DistanceExtremum` contains the kind, an evaluated best
`sample`, the original `bracket`, and final `lower` and `upper` witnesses.
Their time separation is at most `toleranceSeconds`. The sample is a time
estimate within that interval, not an exact derivative zero or necessarily
its midpoint. An indistinguishable narrow bottom or top can remain inside
the reported interval. The interval bounds numerical localization under
the continuity and unimodality assumptions, not ephemeris error.

Evaluation accounting includes the grid, tie probes and refinement.
Repeated time coordinates reuse cached values. If the grid alone exceeds
the cap, the solver refuses before calling the callback. Otherwise it
refuses before any evaluation beyond the cap. Every refusal returns an
empty extrema list, an interval describing where work stopped, and the
evaluation count. Invalid input or nonpositive/nonfinite distance throws
`RangeError`; callback exceptions propagate unchanged.

`status: "complete"` means this algorithm completed on the supplied grid.
It assumes continuous distance and one unimodal turn per refined bracket.
A finite grid cannot prove those assumptions, detect every hidden turn,
or establish coverage near its outer edges. The scalar solver does not
resolve civil times, choose a planetary sampling policy, deduplicate
overlapping astronomical detections, or apply window boundary ownership.
The lunar wrapper below handles these responsibilities for the Moon.

`test/solver.vitest.ts` and `test/solver-edge.vitest.ts` use analytic
polynomials and periodic curves, plus flat and rounded curves, to check
these contracts. The former enforces the registered one-second interval
target on a synthetic parabola sampled at day-sized intervals. Neither
file measures astronomical accuracy or reads held-out reference values.

## Lunar window search implemented in M4

`searchLunarApsides({ from, to, maxEvaluations? })` resolves each endpoint
through `sampleDistance` and searches geocentric geometric lunar distance.
Its `complete` result has `window`, `events` and `diagnostics`. Each event
has `body: "Moon"`, `kind: "perigee" | "apogee"`, the distance sampler's
instant, units, speeds, bounds and engine receipt, and `refinement` with
the original bracket and final strict outer witnesses. Witness times are
TT Julian dates and their distances are in kilometres. Wider speed probes
and the final shared event schema remain M7 work.

The fixed policy in `LUNAR_SEARCH_POLICY` uses a TT grid anchored at
JD 2451545, spaced by 43,200 seconds. The grid begins two nodes before
the node at or before `from`, and ends two nodes after the node at or
after `to`. These are implementation choices enforced by
`test/lunar.vitest.ts`, not a proven lower bound on separation between
physical extrema. Two outside nodes allow a turn close to either edge
to have the same neighboring witnesses as in a larger window, including
when equal adjacent distances require a midpoint probe. The M3 solver
refines the resulting brackets to an interval no wider than 1 second.
The wrapper also checks the width and strict enclosure after conversion
to the engine's TT Julian dates.

All internal samples use `{ jd, scale: "tt" }`. UTC leap seconds and model
seams in endpoint labels therefore do not become jumps in the independent
search coordinate. The window retains both original endpoint receipts.
An endpoint's optional `deltaT` pin resolves that endpoint to TT; it is
not applied to interior samples or event civil labels. Those labels use
the engine's normal time basis, including its qualified UTC rendering
outside the IERS table. No civil label is a substitute for the event's
reported `instant.jdTt` when deciding boundary ownership.

Grid coordinates and refinement arithmetic are independent of the caller's
window edges. Events are kept exactly when `from.jdTt < instant.jdTt <=
to.jdTt`, using the resolved endpoints and reported event coordinate,
without an epsilon or rounding to civil seconds. This owns a numerical
estimate, not the unknown physical event time. Partitioning at an event's
reported TT coordinate assigns it only to the left window. Tests compare
the complete event records for adjacent windows and their union, including
cuts at the closest representable JDs on either side of an event. Equal
resolved endpoints form an empty window and need no padded grid. Reversed
resolved endpoints throw `RangeError`.

The wrapper caches internal samples by the exact TT JD passed to the
engine. Repeated canonical bracket identities are retained once. Distinct
detections with overlapping final intervals refuse as `overlapping-extrema`;
there is no proximity threshold that could merge distinct physical events.
Events are chronological. The input instants and returned receipts are
kept separate from the internal cache, because finite-difference speeds
and receipt labels can depend on the input scale.

`maxEvaluations` caps actual `sampleDistance` calls, including endpoint
resolution, padded samples and refinement. Its default is 100,000;
`test/lunar.vitest.ts` enforces the policy and exact-budget behavior.
The grid is checked against the remaining budget before allocating or
evaluating it. Cached event samples and witnesses add no calls. This is
a count of engine API calls, not of the ephemeris evaluations inside one
engine call. Exhaustion refuses as `evaluation-budget` with `events: []`.
Endpoint engine refusals are preserved under `engine-refusal`, unavailable
padded samples under `edge-coverage`, with the original refusal attached.
Numerical solver refusals also discard all events. Even a problematic
candidate in the padding can refuse the entire search; the code does not
silently truncate those calculations. Unexpected engine exceptions propagate.
Option shape and budget validation precede sampling; time validation is
delegated to the engine as each endpoint is evaluated, so an earlier
refusal can prevent validation of a later endpoint.

`diagnostics.completeness: "sampled-not-proven"` applies to every result.
Completion states that the selected grid and all detected candidates were
processed. A smooth distance curve with one unimodal turn per bracket is
still an assumption, and hidden sub-grid extrema remain possible.
The independent M4 test compares all events with the frozen
`dev-moon-2000` Horizons DE441 fixture, 2000-01-01 to 2000-02-01 TT,
and passes the preregistered Moon limits below, including no missing or
extra fixture events. It also compares distance, radial speed and total
speed at the reference's before/at/after TT samples. This is development
evidence only; it does not prove completeness or validate other lunar
windows. `test/lunar-reference.vitest.ts` enforces these comparisons.
Held-out windows remain reserved for M10.

## Shared astronomical search method

Search on a continuous TT coordinate after resolving the input instants
through the engine. Interpolate TT, not civil dates: changes in UTC offsets
or the engine's civil-time model must not create spurious distance turns.
Preserve TT and the engine's time-basis receipt in each result; civil labels
retain the limitations of that conversion.

1. Sample scalar distance on a body-specific grid, with extra samples on
   both sides of the requested window where the engine permits them.
   Bracket a strict local minimum or maximum when successive distance
   slopes change sign. The sampling policy must account for perturbations
   and multiple nearby extrema, rather than presume an event count from an
   orbital period.
2. Refine each bracket with bounded golden-section minimization of distance
   for a minimum, or of negative distance for a maximum. Check that the
   refined point still has the expected distance turn on both sides.
   Resolve flat or ambiguous brackets explicitly; do not fabricate an
   event from an exhausted iteration or a tie caused by roundoff.
3. Keep a canonical bracket and deterministic refinement rule, deduplicate
   overlapping detections, and filter against the requested TT window
   `(from, to]`. An extremum at `from` belongs to the preceding window; one
   at `to` belongs to this window. A truncated window edge is not itself
   an extremum. Partition tests must compare adjacent-window results with
   the result for their union, including extrema near either edge.
4. Attach the distance, orbital speed, signed radial speeds before, at and
   after the event, probe offsets, refinement interval and engine receipts.
   The distance turn defines the event; the reported rates are diagnostics.

The engine's crossing helpers provide precedents for half-open boundaries,
evaluation budgets and explicit refusal. Their longitude wrapping and
angle crossings do not directly solve a scalar distance extremum. Reuse
compatible helpers where their contracts fit; keep distance refinement in
`apsides/` and leave the engine untouched.

Count coarse samples, edge probes, refinements and event diagnostics against
the search budget. A search that cannot complete its requested work returns
an explicit refusal, including budget exhaustion or unavailable edge
coverage, rather than a successful partial event list. Result diagnostics
must distinguish completion of the algorithm from completeness in the real
trajectory. A finite sampling grid does not prove that every extremum was
found. Completeness is currently unproven and must be tested against an
independent finer search over the stated validation windows.

## Accuracy budget and independent validation

The per-body budgets in seconds and kilometres are registered in
[references/PREREGISTRATION.md](references/PREREGISTRATION.md), with their
machine-readable values in [references/plan.json](references/plan.json).
They are acceptance targets, not measured agreement. The registration gives
the target reference point, TT windows, distance and speed limits, and a
separate numerical interval target. Its digest is carried by every fixture.
`test/references.vitest.ts` enforces the registration and source integrity.
Failed budgets remain failures; a revision needs a reason and new held-out
validation. The engine's existing position bounds do not establish apsis
timing accuracy.

The event-time and distance acceptance budgets against the registered
Horizons corpus are:

| Body | Seconds | Kilometres |
| --- | ---: | ---: |
| Moon | 120 | 30 |
| Mercury | 1200 | 5000 |
| Venus | 21600 | 5000 |
| Earth | 3600 | 5000 |
| Mars | 7200 | 10000 |
| Jupiter | 86400 | 100000 |
| Saturn | 172800 | 200000 |
| Uranus | 604800 | 300000 |
| Neptune | 2592000 | 500000 |
| Pluto | 604800 | 100000 |

The numerical refinement interval target is 1 second. The registration
also specifies signed radial-speed and total-speed limits in km/s. All
these values are enforced as configuration in `test/references.vitest.ts`;
M4 additionally enforces engine agreement for the Moon's development case
in `test/lunar-reference.vitest.ts`; planetary and held-out agreement
remain unmeasured. The budgets apply to the exact TT
windows and centers in the registration, without a physical-uncertainty
claim for the reference ephemeris.

Use frozen JPL Horizons geometric samples as the independent reference.
The reference collector subdivides signed range-rate brackets using only
Horizons samples and queries the final midpoint directly, preserving
endpoint signs and the residual time bracket. Its method and limitations
are in the registration. No physical uncertainty is inferred from the
printed precision. Compare distance at the reference extremum and at
the returned event separately from the event-time difference. Shallow
distance curvature can magnify timing error even when distances agree.
Report missing and extra extrema as well as paired-event differences.

Include both lunar kinds, every planetary target and both planetary kinds,
windows with no event, boundary cases, and long windows that exercise slow
outer-planet motion. Cover system-barycenter and physical-center semantics
explicitly. Any future accuracy statement must name the fixture corpus,
span and engine/runtime used, and must not extend a sample maximum into a
guarantee outside the checked cases. Keep raw generated downloads in an
ignored local directory and commit only small cited fixtures and evidence.

## Planned lunar annotation and command line

Syzygy annotation is optional and requires a caller-supplied angular orb in
degrees. The annotation will state the longitude-phase convention for New
or Full Moon, the measured Moon-Sun elongation at the extremum, the orb and
the underlying receipts. Angular longitude separation and spatial angular
separation must be named separately if both are returned. A matching
perigee may be labelled a supermoon candidate and a matching apogee a
micromoon candidate. These are explicit angular associations, with no
default orb, distance ranking or claim of a universal naming definition.

The planned CLI commands are `apsides lunar`, `apsides planetary` and
`apsides window`. They will call the pure library, validate arguments,
serialize results and refusals as JSON, and distinguish failure through
exit status. They will not fetch reference data during ordinary use.
