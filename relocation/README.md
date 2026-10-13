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

Code and documentation here use the repository's MIT license. The engine is
distributed under MIT AND CC-BY-4.0; retain its LICENSE, LICENSING.md and
NOTICE when redistributing it or its attributed data. Generated grids and
temporary files belong in the ignored `generated/` and `.cache/` directories.
