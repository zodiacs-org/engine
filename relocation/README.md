# Relocation workbench

This isolated project uses the carried engine archive through a relative file
dependency. It does not rebuild the engine. Install dependencies from this
directory with `npm ci --ignore-scripts`, then run `npm run typecheck` and
`npm test`. Use Node from the package's declared runtime range.

`src/index.ts` exports `relocateChart(source, destination)` and the
`RelocationSource` type. Supply an engine `BirthInput` with an already resolved
instant, a full engine `Chart`, or a `NatalEnvelope` from the engine's receipt
API. Parse JSON text with the engine's `parseNatalEnvelope` first; this function
accepts the decoded envelope object. Supply a destination containing `latitude`
and `longitude` in geographic degrees. Longitude is east-positive.
The returned `natal` and `relocated` fields are full envelopes created by the
engine's receipt API. Each contains its result, conventions, time basis,
engine identity, requested house system, actual house system and flags.

Relocation preserves the instant, time scale, pinned delta-T and time-known
setting. It changes the geographic coordinates and asks the engine to
recompute the chart. Planetary positions remain geocentric. Local wall times
must be resolved before calling this API. Unknown-time charts keep absent
angles and houses. Polar fallback is the engine's own result; exact geographic
poles are rejected because a rising direction is undefined there.

Existing charts are captured with `createNatalEnvelope`. Existing envelopes
are validated and copied through the engine codec, including its data and
size limits. Incomplete or inconsistent chart and envelope records throw the
engine's `NatalEnvelopeError`; invalid births or destinations throw
`RangeError`. Result snapshots belong to the caller and do not share mutable
data with the source.

The engine's `natalReplayInput` supplies the destination request. It preserves
the requested house system, even when the source used polar whole-sign fallback,
and carries only input flags rather than derived result flags. Source results,
engine labels, provenance, original reference convention and extensions stay
in `natal`. They are structurally checked claims, not authenticated facts. The
destination always uses the installed engine and gets a fresh receipt. That
receipt retains captured source-instant spelling but does not copy birthplace
time-resolution context, source artifact claims or extensions. An unknown-time
destination records the supplied instant without asserting destination noon.

The synthetic cases in `test/chart.vitest.ts` check equality with direct engine
calls, replay, polar fallback, antimeridian endpoints and input ownership.
`test/source.vitest.ts` also checks source replay, ownership, polar Placidus and
Koch requests, malformed records and the engine codec's import limits.
They are regression checks, not independent accuracy evidence. Receipt
labels describe the calculation and do not authenticate its physical accuracy.
The remaining angular-line and CLI work is listed in `PLAN.md`.

## Bounds, geometry and chart grids

`geographicBounds({ south, north, west, east })` validates inclusive geographic
degrees. Latitude runs south to north. Longitude follows the eastward arc from
west to east; a west value greater than east crosses the antimeridian.
The result adds `longitudeSpan` and `eastUnwrapped` so traversal order can
remain continuous across the seam. Equal longitudes describe a single meridian.
Use west `-180` and east `180` for the full world; west `180` and east `-180`
describe the same single meridian. `containsPoint(bounds, point)` tests inclusive
membership and treats both seam spellings as the same location.

`wrapLongitude(degrees)` wraps finite numbers into `[-180, 180)` and keeps
already in-range coordinates at their supplied precision. Bounds and chart
destinations require in-range coordinates and reject invalid values rather than
silently wrapping them. Pure geographic bounds allow exact poles; chart grids
exclude them for the same reason as `relocateChart`.

`planGrid({ bounds, latitudeStep, longitudeStep, maxSamples })` returns latitude,
wrapped longitude and unwrapped longitude axes, row/column counts and the total
sample count. Steps are positive geographic degrees. Both boundaries are
included; a final interval can be shorter than the requested step. A zero-width
axis has a single sample. A full-world longitude axis retains both submitted
seam endpoints for adjacent-cell traversal, even though they are the same place.
Plans reject steps that cannot produce distinct ordered coordinates at
floating-point precision.

`maxSamples` is required and counts destination chart evaluations. It is capped
by `MAX_GRID_SAMPLES`, currently 4,096. A birth input may require one additional
source chart calculation; an existing chart or envelope requires no source
calculation. An over-budget plan throws `GridBudgetError` before reading the
natal source, allocating coordinate arrays or calculating charts. Its
`requiredSamples` and `maxSamples` fields describe the refusal. Extremely small
steps can make the required count unrepresentable, including `Infinity`; this
is an error diagnostic and is not a JSON result. Invalid options throw
`RangeError`. Limits, inclusive endpoints, polar rejection and evaluation counts
are enforced in `test/grid.vitest.ts` over its synthetic cases.

`sampleGrid(source, options)` returns a `zodiacs.relocation-grid.v1` object with
the captured `natal`, the `plan` and row-major `samples`. Each sample contains
`row`, `column`, `point`, `unwrappedLongitude` and its engine natal `envelope`.
The source is captured once; every destination is calculated by the engine
with replayed settings. Result envelopes are independent snapshots. Unknown
birth time retains absent angles and houses at every destination.

```ts
const options = {
  bounds: { south: -10, north: 10, west: 170, east: -170 },
  latitudeStep: 10,
  longitudeStep: 10,
  maxSamples: 9
};
const plan = planGrid(options);
const grid = sampleGrid(syntheticNatalSource, options);
```

This plan and sample order are enforced by `test/grid.vitest.ts`. They are
resolution choices, not estimates of angular-line completeness or accuracy.

`splitAntimeridian(points)` returns arrays of `PolylineVertex` for normalized
lat/lon samples. Consecutive samples connect by the shortest longitude link;
an exactly half-world link follows its submitted sign. Each vertex contains
`point` and `source`. A `sample` source keeps the original sample `index`, which
callers can associate with receipts or other metadata. At an interior seam
crossing, the two seam spellings receive matching vertices with a `seam` source
containing `fromIndex`, `toIndex` and the interpolation `fraction`. Those
latitudes interpolate in lat/lon space and have no engine receipt. This helper
does not calculate an angular crossing or a great-circle path. Exact seam
samples may change spelling to keep their displayed segment continuous.
An optional second argument, `"east"` or `"west"`, selects the longitude arc
for exactly half-world links; shorter links keep their shortest arc. Direction
selection and seam provenance are enforced in `test/geography.vitest.ts`.

Polyline input is capped by `MAX_POLYLINE_POINTS`, currently 16,384; larger,
sparse or invalid arrays throw `RangeError`. Seam interpolation, limits, polar
endpoints, exact seam samples and floating-point seam cases are enforced in
`test/geography.vitest.ts` over its synthetic geometry corpus. No generated
grids are committed. Write large outputs under ignored `generated/`.

## Planetary directions and angular-line conventions

`sampleAngles(source, points, { bodies?, maxEvaluations })` samples a resolved
source at a bounded array of geographic points. It accepts the same source
forms as `relocateChart`. `bodies` defaults to `ANGULAR_BODIES`, the Sun, Moon
and planets; an explicit selection must be nonempty and unique. Earth, nodes
and other points are excluded. Names are case-sensitive. Invalid inputs throw
`RangeError`, including sparse arrays, accessor entries and coordinates outside
the geographic ranges. Frozen ordinary data is accepted.

The result's `natal` keeps the validated source claims. Fresh positions come
from `@zodiacs/engine/calc`, once per selected body, in the true equator and
equinox of date, geocentric and apparent under the engine's conventions. The
Moon retains the engine's series-at-instant convention. Full ecliptic latitude
is retained by the engine's frame rotation. Imported source positions are not
used for this calculation. Each entry in `positions` includes the full engine
result and its unmodified receipt, with bounds, request, time basis and engine
identity. `rightAscension` and `declination` are degrees.

Every nonpolar observer gets an engine `houses()` result and receipt, including
ARMC, true obliquity, angles, cusps and requested/actual house systems. The source
house request is replayed even when the source fell back to whole-sign houses.
Each observer body row's `positionIndex` identifies its shared position and
receipt in `positions`; the observer's own receipt supplies its ARMC. Positions
are shared because the chosen geocentric direction is independent of location.
No destination chart or house cusp is constructed by the relocation library.

`ANGULAR_CONVENTIONS` names the library geometry separately from engine receipt
conventions. With H equal to ARMC minus right ascension, MC means the upper
meridian at H = zero, and IC means the opposite meridian. These definitions
do not require the planet to be above or below the horizon. ASC and DSC mean
the body's center on the unrefracted horizon, on the eastern rising or western
setting branch respectively. Rising and setting hold the geocentric body
direction fixed and describe the effect of Earth's rotation. Actual planetary
motion is not evaluated by this classification. These lines use the full
planetary direction, rather than a conjunction of ecliptic longitude with a
chart cusp. The library does not apply refraction, parallax, limb radius,
observer height or terrain.

Observer rows report local east, north and up unit-vector projections, altitude,
azimuth from north through east, west-positive `hourAngle`, `horizonMotion` and
signed `residuals`. Hour angles and meridian residuals use `[-180, 180)` degrees.
MC and IC residuals are wrapped hour-angle offsets. ASC and DSC residuals are
both altitude; `horizonMotion` distinguishes their branches. A stationary
horizon direction needs separate tangency handling. A residual is a sampled
quantity, not a crossing verdict, polyline or completeness guarantee.

The east/north/up rotation is library geometry derived from engine direction
and observer-axis receipts. The engine receipts do not include or authenticate
that derived geometry. Projection checks in `test/angles.vitest.ts` use
artificial directions with known geometry and a separate Cartesian dot product
over its synthetic engine samples. Direct engine comparisons and receipt replay
in that file are regression checks, not independent astronomical accuracy
evidence. Engine bounds are retained on the underlying results; they are not
propagated into an error bound on the library's residuals or line locations.

Exact geographic poles produce `status: "undefined"` observer samples with
`reason: "geographic-pole"`, no engine houses result and no body rows. Other
points can still be sampled. At a numerical celestial pole, right ascension,
hour angle and meridian residuals become null, with `raUndefined` explaining
why. Altitude can remain defined. At zenith/nadir azimuth is null with
`azimuthUndefined`. At ecliptic/horizon coincidence `eclipticAngles.asc` and
`.dsc` are null and `ascendantUndefined` names the singularity; the raw engine
houses result is retained as computation provenance. The planetary horizon
projection is still meaningful there. `ANGULAR_DIRECTION_TOLERANCE` follows
the engine's `RA_POLE_TOLERANCE` on unit-vector projections, also treating a
numerically negligible east projection as stationary. This is a singularity
convention, not an accuracy allowance. The singular cases and nearby defined
cases are checked in `test/angles.vitest.ts` on artificial geometry and
synthetic engine directions.

Time scale and any delta-T pin come from source replay. UTC inputs keep an ISO
request. UT1 and TT inputs are converted from the source's recorded
millisecond instant to a Julian date on that same scale, because `/calc` accepts
non-UTC clocks in that form. Julian-date representation introduces floating-point
rounding, so angular results are a fresh sampling calculation, not a claim of
bit-for-bit natal-chart parity on those clocks. The result's `time` is the actual
request; each engine receipt records the UT1 and TT used. Replay checks cover
all supported clocks, pinned and unpinned, in `test/angles.vitest.ts`.

Unknown birth time returns `status: "refused", reason: "unknown-time"` without
evaluating positions or houses; no angular map is inferred from a reference
instant. The engine's `/calc` coverage limits apply independently of the chart
API's wider range. A typed engine refusal is retained as `engineRefusal`, with
`reason: "engine-refusal"` and empty positions/samples. No partial geometry is
returned. Malformed sources still use the engine receipt validation errors.

`maxEvaluations` is required and counts position calls plus a houses call for
each nonpolar point. It is capped by `MAX_ANGLE_EVALUATIONS`; the point-array
length has that same independent cap, including undefined poles. Budget
preflight and coordinate validation happen before reading the source or calling
the engine. Excess work throws `AngularBudgetError` with `requiredEvaluations`
and `maxEvaluations`. A raw birth may additionally require a source chart
calculation; existing charts and envelopes require none. `evaluations` records
actual position and houses calls, including the call that returned a refusal.
Work limits, exact call counts and refusal behavior are enforced in
`test/angles.vitest.ts` over its synthetic cases. The sampler itself writes no
generated files.

## MC and IC polylines

`planMeridianLines({ bounds, latitudeStep, bodies?, lines?, maxEvaluations })`
plans upper and lower planetary meridians. Bounds use the same inclusive,
eastward longitude convention as `geographicBounds`, including wrapped bounds
and seam aliases. `latitudeStep` is a positive step in degrees; both latitude
boundaries are included, with a shorter final interval when needed. Equal
latitude boundaries produce a single sample. `bodies` follows `sampleAngles`;
`lines` defaults to MC then IC and accepts a unique, nonempty selection of
those names. Body and line order determine output order.

The planner reserves a position call per body, an engine reference observer
at the equator and Greenwich, and an observer call per possible nonpolar
line vertex. `requiredEvaluations` is this conservative total before longitude
clipping. Exceeding `maxEvaluations` throws `AngularBudgetError` before reading
the source or allocating latitude arrays, even when clipping might reduce the
actual work. Budgets and `maximumObserverSamples` are independently capped by
`MAX_ANGLE_EVALUATIONS`; the latter includes reference and undefined pole
samples. Invalid plans throw `RangeError`. Inclusive endpoints, limits,
subnormal spans and floating-point step refusals are enforced in
`test/meridian-lines.vitest.ts` over its synthetic planning cases.

`meridianLines(source, options)` returns `zodiacs.relocation-meridians.v1` with
the plan, `sampling` provenance and structured `lines`. It freshly computes
each selected body through the engine once. MC longitude is right ascension
minus the reference engine ARMC, wrapped to geographic degrees. IC is its
opposite meridian. Each admitted nonpolar latitude is then evaluated through
engine `houses()` with the source's replayed house request, time scale and
delta-T setting. It reports the actual measured meridian residual, including
floating-point roundoff. No refinement or physical line-location error bound
is claimed. These are upper/lower meridians regardless of altitude.

Every line contains its `body`, `kind`, `longitude`, `positionIndex`, `samples`
and `polylines`. `positionIndex` addresses `sampling.positions`, retaining the
full engine equatorial result and receipt. Each line sample's `observerIndex`
addresses `sampling.samples`, retaining its engine observer result and receipt.
Polyline vertices use the same global observer index in `source.index`; they
are not line-local indices. `referenceObserverIndex` identifies the Greenwich
observer used to construct the longitude, which remains provenance even when
it lies outside the requested bounds. Each constant-longitude meridian uses
one canonical seam spelling without seam interpolation or duplicate lines.

Longitude clipping sets `status: "outside-bounds"` with empty samples and
polylines, while preserving the derived longitude and position reference.
Undefined celestial-pole RA sets `status: "undefined"`,
`reason: "celestial-pole"` and a null longitude. Exact geographic pole rows
retain undefined sample metadata, null residuals and no observer engine receipt;
they are omitted from polylines. A plan sampling only poles can therefore have
`status: "sampled"` lines with empty polylines. A single defined point is a
singleton polyline. Unknown birth time or any typed engine refusal returns
`status: "refused"`, empty lines and no partial positions or observer samples;
the reason and underlying engine refusal remain in `sampling`.

`test/meridian-lines.vitest.ts` checks receipt replay, sampled residuals,
Cartesian meridian projections, both branches, inclusive clipping, antimeridian
aliases, polar fallback, pole exclusions, source ownership, clocks and refusals
using synthetic births. Engine comparisons are regression checks. Artificial
direction injections exercise singular and seam branches and are not physical
reference data. The engine receipts cover engine calculations; the library's
derived longitudes and polylines keep the separate `ANGULAR_CONVENTIONS` in
`sampling.conventions`. The function performs no file or network operations.

## ASC and DSC horizon polylines

`planHorizonLines({ bounds, latitudeStep, bodies?, lines?, maxEvaluations })`
uses the same bounds, body selection and inclusive latitude stepping as the
meridian planner. `lines` defaults to ASC then DSC and accepts a nonempty,
unique selection of those names. It reserves the reference observer, fresh
positions and all possible row observers, including both tangent endpoints
per branch even when no tangent lies inside the bounds. Pole rows are also
reserved conservatively. `requiredEvaluations` includes these reservations;
actual work may be lower. Limits, extra tangent reservations, invalid inputs
and precision refusals are enforced by `test/horizon-lines.vitest.ts` over
its synthetic planning cases. Planning happens before source capture.

`horizonLines(source, options)` returns `zodiacs.relocation-horizons.v1` with
the plan, angular `sampling` provenance, `referenceObserverIndex` and structured
`lines`. It calls the engine for each selected body's geocentric true-of-date
equatorial direction and for Greenwich ARMC. With latitude phi, declination
delta and west-positive hour angle H, a fixed direction meets the horizon when
`cos(H) = -tan(phi) * tan(delta)`. The negative hour-angle branch is ASC;
the positive branch is DSC. Longitude is right ascension minus reference ARMC
plus H. This uses the full planetary direction and the unrefracted body-center
horizon defined in `ANGULAR_CONVENTIONS`, rather than a chart cusp conjunction.

The latitude boundary of a circumpolar region is `90 - abs(declination)`
degrees. Both signed limits are inserted when inside the requested latitude
bounds, even between coarse rows. Existing rows at a limit are retained once
with `origin: "tangent-limit"`. At an admitted limit ASC and DSC meet at a
stationary tangent, recorded as `status: "tangent"`; it is not labelled as
a rising or setting event. Latitude rows farther into a circumpolar region
carry `status: "gap"` and `reason: "always-above"` or `"always-below"` for the
fixed direction. Exact geographic poles carry `status: "undefined"` and
`reason: "geographic-pole"`. They have no unique rising direction, including
for an equatorial body. Numerical celestial-pole RA makes the entire line
undefined with `reason: "celestial-pole"` and empty geometry. Synthetic
direction injections exercise these cases in `test/horizon-lines.vitest.ts`;
they are not authentic engine receipts or physical reference data.

Each line retains `body`, `kind`, `positionIndex`, `samples` and `polylines`.
A row contains its latitude, origin, status, reason, derived `point`,
`observerIndex` and measured altitude `residual` in degrees. Every admitted
nonpolar point, including a tangent, receives a fresh engine observer result
and receipt through `houses()`. `positionIndex` addresses `sampling.positions`;
`observerIndex` addresses `sampling.samples`. Gaps, undefined poles and clipped
rows have null observer indices and residuals. A clipped row retains its
derived point with `status: "outside-bounds"`; gaps and poles have null points.
The reference observer remains provenance even outside the bounds.

Polyline sample references use global observer indices. Gaps, poles and
clipped rows break a run. A longitude link crossing an excluded arc also breaks
the run, even when both endpoints are admitted. Antimeridian seam vertices
have global `fromIndex` and `toIndex` references and an interpolation fraction;
they interpolate in lat/lon space and have no additional engine receipt.
At an exactly half-world link the known branch direction selects the longitude
arc. A single admitted sample forms a singleton polyline. A line with only
gaps or poles can be `sampled` with empty geometry. If all available horizon
locations are clipped, the line is `outside-bounds`.

These are sampled curves: straight links and interpolated seams need not lie
exactly on the horizon, and clipping does not refine a longitude boundary.
Coarse latitude steps can omit the shape between samples. Near tangencies,
roundoff can collapse a numerically indistinguishable branch to its tangent;
roundoff is clamped only within the analytic latitude range. Residuals report
the engine-backed altitude at emitted vertices. They are not propagated
physical error bounds or a completeness guarantee. Engine receipt replay,
Cartesian horizon projections and branch selection are checked over the
synthetic cases in `test/horizon-lines.vitest.ts`. Engine parity is regression
evidence, not independent astronomical accuracy evidence.

Source forms, time scales, pins and house requests follow `sampleAngles`.
Polar fallback is computed by the engine at each admitted observer.
Unknown time and typed engine refusals return empty lines and no partial
positions or observer samples. Invalid options and over-budget plans throw
before source capture. The function performs no file or network operations.

## Grid crossings and cell geometry

`planGridCrossings({ bounds, latitudeStep, longitudeStep, bodies?, lines?,
maxEvaluations, maxRefinements, coordinateTolerance, residualTolerance })`
plans angular sampling over the same inclusive, south-to-north and eastward
axes as `planGrid`. Both steps and both tolerances are geographic or angular
degrees as named. Exact geographic poles are excluded; nearby polar observers
retain the engine's house fallback. Equal bounds can describe an edge-only
grid or a single observer. `bodies` follows `sampleAngles`; `lines` defaults
to ASC, DSC, MC and IC, in that order. Explicit selections are nonempty,
unique and case-sensitive.

`maxEvaluations` bounds all position and observer calls, including refinement,
under `MAX_ANGLE_EVALUATIONS`. `requiredEvaluations` reserves the coarse grid
and fresh positions before reading the source. Excess coarse work throws
`AngularBudgetError`. The nested `grid.maxSamples` is the independent grid
allocation cap. A raw birth may additionally require a source natal chart
calculation. `maxRefinements` bounds bisection calls per candidate edge under
`MAX_GRID_REFINEMENTS` and can be zero. Invalid options throw `RangeError`.
Limits, endpoint inclusion, source preflight and malformed plans are enforced
by `test/grid-crossings.vitest.ts` and the grid planner's existing tests.

`gridCrossings(source, options)` returns `zodiacs.relocation-grid-crossings.v1`
with its plan, engine-backed `sampling`, unique grid `edges`, `edgeResults`,
`crossings`, `cells` and `unresolvedCells`. Coarse observers come first in
row-major order; refinement observers follow in evaluation order. Every
observer and every selected planetary direction keeps its engine result and
receipt. Source replay, clocks, delta-T pins, house requests and receipt scope
follow `sampleAngles`. No chart, cusp or planetary position is invented.

Each edge connects adjacent coarse observers and records its axis, observer
indices and increasing coordinates. Longitude coordinates stay unwrapped
across the antimeridian. An edge result identifies its body, kind and position
index, its initial endpoint pair, its final `bracket`, the refinement count
and an optional crossing index. Bracket endpoints include observer indices,
coordinates and residuals. A pair on a `no-crossing` or unresolved edge is
diagnostic endpoint metadata and need not enclose a root.

A sign change in a meridian residual is refined only when it crosses the
requested meridian, rather than the residual's wrap on the opposite meridian.
Horizon edges use altitude and classify the final observer as rising, setting
or stationary. Each midpoint is evaluated through engine `houses()`; it has
its own observer receipt. A crossing is admitted only when both the bracket
width and the chosen sampled residual meet their requested tolerances.
An exact endpoint root needs no refinement and has a collapsed bracket.
Crossings shared by adjacent cells use the same edge result. Exact roots on
several edges are deduplicated by body, kind and coarse observer index.
Equivalent full-world seam observers retain their separate grid indices.

Crossings keep `observerIndex`, `positionIndex`, the sampled point, residual
and horizon motion. A stationary horizon root is labelled `tangent` for both
requested horizon branches. It is retained as metadata without a cell
connection. Tangencies with no endpoint sign change are not inferred as
receipt-bearing crossings. Constant-latitude edges are screened for hidden
horizon pairs around an interior upper or lower culmination using captured
engine directions and derived spherical geometry. An unresolved screen
creates no additional observer, sample or receipt.

Cells record their south, east, north and west edge-result indices and unique
crossing indices. An unambiguous pair forms a `sampled` cell with polylines.
Each cell has its own segment; segments are not stitched into a global path.
Vertices reference global observer indices. Antimeridian splitting retains
global endpoint references and an interpolation fraction on seam vertices;
those vertices have no additional engine receipt. A straight connection or
interpolated seam need not lie exactly on an angular line between its samples.
Edge-only and point grids have no cells, while still retaining any edge
crossings and sampled observers.

Cells are unresolved when an edge is unresolved, a stationary crossing or
ambiguous number of boundary crossings prevents a connection, or no bracket
and insufficient corner margins leave the interior unsettled. An empty cell
requires corner residual magnitudes larger than a conservative displacement
reach: longitude width for meridians, latitude height plus longitude width
for the horizon. This exclusion uses fixed-direction spherical geometry and
does not bound ephemeris error. Hidden edge pairs, undefined celestial
meridians, coincident endpoint pairs, edges spanning a half-turn or more,
evaluation exhaustion, refinement limits and floating-point coordinate
stagnation have explicit reasons. Unresolved cells contain no polylines;
their successful boundary crossings and all sampled provenance remain
available. `unresolvedCells` is the corresponding subset of `cells`.

`status: "ok"` means sampling returned successfully, not that the grid is
complete. The verification label is
`bounded-edge-brackets;sampled-cell-connections`. Tolerances control numerical
refinement against the installed engine and are not physical accuracy bounds.
A finite grid does not establish that all angular topology has been found.
Use finer steps or more remaining evaluations to investigate unresolved
regions. Budget exhaustion keeps successful samples and structured brackets;
unknown time or any typed engine refusal instead returns `status: "refused"`
and empty geometry, including after a refinement refusal.

`test/grid-crossings.vitest.ts` checks synthetic real-engine receipt replay,
Cartesian meridian and horizon projections, residual and bracket acceptance,
shared edges, antimeridian provenance, polar fallback, clocks, resource limits
and refusal behavior. Artificial direction and observer injections exercise
endpoint roots, hidden horizon pairs, stationary directions and ambiguous
cells. They are not authentic receipts or independent astronomical references.
The function performs no file or network operations; save large outputs only
in ignored generated directories.

## Great-circle paths and angular crossings

`planGreatCircle({ from, to, stepDegrees, maxSamples })` constructs a shortest
arc on a unit sphere using geographic latitude and east-positive longitude.
It is spherical geometry, not an ellipsoidal route or a time progression.
Both endpoints are copied and retained. Samples traverse from `from` to `to`
in increasing `distanceDegrees`, the angular distance from the start, with
`fraction` giving the share of the whole arc. The final interval may be shorter
than `stepDegrees`. Coincident places, including seam aliases and different
longitude labels at the same pole, have one start sample and no direction.

Antipodal endpoints have no unique shortest arc and throw `RangeError`;
split the request into separate legs through an explicit waypoint. Directions
within `GREAT_CIRCLE_DIRECTION_TOLERANCE` of that numerical ambiguity also
reject. An interior pole on a meridional arc is inserted even between coarse
rows. Its longitude is a conventional label, not a physical direction.
Poles break display polylines and remain explicit path samples. Endpoint poles
retain their submitted labels. Nearby polar points are otherwise supported.

`maxSamples` is required and capped by `MAX_PATH_SAMPLES`. The planner reserves
inclusive endpoints and any inserted pole before allocating samples. Excess
work throws `GreatCircleBudgetError` with `requiredSamples` and `maxSamples`;
an extremely small step can produce an infinite required count in that error
diagnostic. Invalid coordinates, steps, limits and unresolved numerical
directions throw `RangeError`. `test/great-circle.vitest.ts` enforces these
limits and checks distance against a separate haversine calculation and arc
membership against Cartesian plane projections over its synthetic geographic
cases. These tests establish geometry and regressions, not planetary accuracy.

Path polylines split at the antimeridian using the existing lat/lon
interpolation convention. Sample vertices reference path sample indices;
seam vertices identify both samples and the interpolation fraction. Straight
links and interpolated seam latitudes approximate the sampled spherical arc.
They have no engine receipt and need not lie exactly on that arc. The planner
performs no engine, file or network operations. Its conventions are recorded
in `GREAT_CIRCLE_CONVENTIONS`.

`planPathCrossings({ from, to, stepDegrees, bodies?, lines?, maxEvaluations,
maxRefinements, coordinateTolerance, residualTolerance })` plans the same arc
and reserves coarse observer samples plus fresh body calculations before
reading the natal source. It reserves pole rows conservatively, although
undefined poles make no houses call. The separate path sample cap includes
refinement observers. A birth input may additionally require a source chart
calculation. Body and line selections follow `sampleAngles` and
`gridCrossings`; lines default to ASC, DSC, MC and IC.

`maxEvaluations` bounds actual position and observer calls under
`MAX_ANGLE_EVALUATIONS`; excess coarse work throws `AngularBudgetError`.
`maxRefinements` bounds probes per body, line and coarse interval under
`MAX_PATH_REFINEMENTS`. Cached probes count toward that interval's refinement
limit but consume no new engine work. The coordinate tolerance is the final
bracket width in angular degrees along the arc. The residual tolerance is the
sampled altitude or requested meridian residual in degrees. Both tolerances
must be finite and positive. Bounds, validation and budgets are enforced by
`test/path-crossings.vitest.ts` over its synthetic planning and refinement
cases. They control numerical work, not physical location accuracy.

`pathCrossings(source, options)` returns `zodiacs.relocation-path-crossings.v1`
with the plan, angular `sampling`, `observerDistances`, `intervalResults`,
`unresolvedIntervals`, `crossings` and path `polylines`. Coarse observers appear
first in arc order; refinement observers follow in evaluation order.
`observerDistances` uses those same global indices. Captured planetary
directions are held fixed at the natal instant. Every nonpolar observer has
a fresh engine houses result and receipt; every selected planetary direction
has its full engine calc result and receipt. Source forms, clocks, delta-T
pins, house requests and receipt scope follow `sampleAngles`.

Each interval result identifies its coarse interval, body, kind and position
index. Its `initialBracket` and final `bracket` retain observer indices, arc
distances, angular residuals and continuous plane projections. Horizon
projection is the local up component of the planetary direction. Meridian
projection is cosine(latitude) times sine(hour angle); it stays continuous
across the opposite meridian where a wrapped angular residual jumps.
These projections are derived geometry, not extra engine outputs.

The scalar projection of a fixed plane along a shortest great circle is a
sinusoid. A noncoincident arc shorter than a half turn cannot hide a pair of
interior plane crossings. Sign-changing intervals are bisected on that
projection, evaluating every new nonpolar midpoint through engine houses.
The final sampled observer selects MC versus IC, or rising ASC versus setting
DSC. A stationary horizon observer is retained as `tangent` for both selected
horizon branches; that label describes Earth rotation with the direction
fixed, not movement along the path. A numerically coincident path has no
isolated root and stays unresolved rather than emitting an arbitrary crossing.

An admitted crossing meets both requested tolerances and references a sampled
observer, its arc distance and fraction, the body's position index, measured
residual and horizon motion. Exact sampled angular roots have collapsed
brackets. Shared coarse endpoint roots are deduplicated by body, kind and
observer index. Both endpoints are included. Results follow selected body,
line and interval order; they are not globally sorted by arc distance.
Midpoint observers are reused across branches and bodies when their arc
distance matches. A zero-length path has no intervals or isolated crossings.

Undefined celestial meridians, pole-adjacent intervals, numerical coincidence,
uncertain endpoint signs, depleted evaluation budgets, refinement limits and
coordinate stagnation retain explicit unresolved metadata. Pole samples have
no unique observer meridian and no engine houses receipt; adjoining intervals
are left unresolved even if an unsampled horizon root could lie there. No
crossing at a pole is invented. Refinement also stops when the interpolated
geographic point repeats a bracket endpoint at floating-point precision.
Successful earlier roots and all sampled receipts survive a work-limit stop.
Unknown time or any typed engine refusal instead discards all partial output,
including a refusal during refinement, and returns `status: "refused"`.

The returned polylines describe the path through coarse and refinement
observers, in arc order, with global observer provenance and breaks at poles.
They are not planetary angular-line segments. Interpolated seam vertices have
no additional receipt. `status: "ok"` means bounded sampling succeeded; the
verification label is `bounded-great-circle-brackets;sampled-engine-residuals`.
Residuals are measured against the installed engine and do not propagate its
astronomical uncertainty. Engine parity, receipt replay, separate Cartesian
projections, branch selection, reversal, seams, polar fallback, exact endpoints,
clock replay and failure behavior are tested in `test/path-crossings.vitest.ts`
over synthetic births. Artificial direction injections exercise singular
topology and are not authentic receipts or astronomical references.
The library writes no generated files and makes no network requests.

Code and documentation here use the repository's MIT license. The engine is
distributed under MIT AND CC-BY-4.0; retain its LICENSE, LICENSING.md and
NOTICE when redistributing it or its attributed data. Generated grids and
temporary files belong in the ignored `generated/` and `.cache/` directories.
