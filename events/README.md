# Event search workbench

An isolated, private TypeScript project for event searches built on the parent
`@zodiacs/engine`. It is excluded from the engine's npm package. Progress and
remaining features are tracked in [PLAN.md](PLAN.md).

The current implementation exposes a bracketed scalar root refiner, shared
search contracts, an evaluation context, a longitude adapter, longitude
crossing searches, tropical sign ingresses, exact aspects, stations and retrograde
intervals. Eclipses, void-of-course periods, the DSL and the HTTP API remain planned.
The adapter consumes the parent source through relative imports. The local
build bundles those imports under `events/build/`.

From the repository root, on Node.js 22:

```sh
npm ci --prefix events
npm run typecheck --prefix events
npm test --prefix events
```

Local compiler output is under `events/build/`; downloads, caches and bulk
experiments belong in the gitignored `.cache/` or `generated/` folders.

## Root refinement

```ts
import { refineRoot } from "./src/index.js";

const result = refineRoot(t => t - 17, 0, 100);
if (result.status === "converged") {
  console.log(result.atMs, result.bracket, result.value);
}
```

Endpoints are integer epoch milliseconds representable by JavaScript `Date`.
The bracket includes both ends and must contain a sampled zero or a sign
change of a continuous function. Bisection returns an evaluated endpoint and
its residual, together with an enclosing bracket. `toleranceMs` controls the
bracket width, not the residual or physical accuracy. Defaults and numerical
behavior are enforced in [root.test.ts](test/root.test.ts) using analytic
linear and polynomial functions, across positive and negative epoch values.

`maxEvaluations` includes endpoint evaluations and refinements. Exhaustion
returns `status: "refused"` with the remaining bracket and no root estimate.
Invalid arguments, nonfinite callback values and brackets without a sign change
throw. Exceptions from a callback propagate to the caller.

This routine refines one supplied bracket. It does not discover roots, detect
all stationary touches, establish continuity or prove a search complete. The
caller must unwrap angular residuals before bracketing; a jump across the far
side of a circle is not a root. A narrow bracket cannot establish physical
accuracy of an ephemeris or reconcile different time scales.

## Search conventions and references

Search contracts declare a clock (`utc`, `ut1` or `tt`) and use windows open at
the start and closed at the end. This window ownership is separate from the
root refiner's inclusive bracket. Completed results may have no events;
budget or cancellation refusals contain no partial event list.

Astronomical date tests use independently acquired JPL Horizons results.
Published NASA eclipse catalog tests remain planned. Reference fixtures must name their source,
frame, clock, retrieval method and redistribution terms. Analytic numerical
tests are not astronomical accuracy evidence. Natal examples and tests use
synthetic data. No Swiss Ephemeris material or expectations are used.

Code and documentation here use the repository's MIT license. The parent
engine has its own data attribution obligations recorded in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).

## Engine adapter and bounded work

```ts
import { EngineAdapter, EvaluationContext } from "./src/index.js";

const context = new EvaluationContext({
  startMs: Date.parse("2000-01-01T00:00:00Z"),
  endMs: Date.parse("2000-01-02T00:00:00Z"),
  clock: "utc"
}, { maxEvaluations: 100 });
const engine = new EngineAdapter(context);
const result = context.search(() => [engine.sample("Mars", context.window.endMs)]);
```

These are synthetic reference instants, not birth data. This example evaluates
one position; it does not search for an event. Tests in
[engine.test.ts](test/engine.test.ts) cover the clock labels and delegation for
all supported bodies at the synthetic reference instant in that file.

Coordinates are apparent geocentric tropical longitude in the true ecliptic
and equinox of date, in degrees. The Moon inherits the parent engine's lunar
series convention. Supported bodies are the Sun, Moon and planets listed by
`EVENT_BODIES`; nodes and other calculated points are excluded for now. Optional
longitude speed is the parent's finite difference in degrees per day. It is
not an analytic instantaneous derivative. The returned `instant` retains the
parent's UTC label, UT1 and TT Julian dates, time basis and Delta T provenance.

The clock is mandatory. Epoch milliseconds are numeric labels on that clock;
a TT or UT1 label is not a UTC timestamp despite using the same epoch origin.
UTC labels go to the parent as a Date; TT and UT1 labels go as Julian dates.
Floating point Julian date conversion can lose submillisecond resolution. A
root's millisecond enclosure describes its input coordinates, not physical
accuracy. The parent may approximate civil time by UT1 outside its observed
time data and refuse samples outside its calculation span. `EngineRefused`
retains the parent's refusal rather than reporting a completed empty search.

Window validation rejects invalid clocks, noninteger or unrepresentable
instants, nonpositive durations and unexpected fields. The context snapshots
the window. Sampling includes both endpoints so scanning can establish its
initial residual; `context.owns()` assigns events to the open-start,
closed-end search window. Samples outside the window reject before charging.
Speed samples internal to the parent may extend past that window.

A budget unit is one adapter `calc` request for one body at one instant,
including a request that fails. Requests with speed include the parent's
internal difference samples in that unit. This is an API request budget, not
a count of internal ephemeris operations or a wall-clock deadline. Calls are
not cached. Scanning and refinement must share one context; the root refiner's
own callback budget is a separate limit. Invalid adapter arguments do not
consume budget. Cancellation is checked before and after each request and
when completing a search, but cannot interrupt a synchronous engine call.

`context.search()` converts budget exhaustion or cancellation into a refusal
with an empty event list. Other errors propagate. Completed empty searches and
refusals are distinct. [context.test.ts](test/context.test.ts) enforces these
control-flow and window rules with analytic callbacks. Adapter delegation tests
use the same parent API and establish integration behavior only; they are not
independent astronomical accuracy evidence.

The workbench pins the same ephemeris version as the parent. Installation and
compilation use only local dependencies and output. Source reads from `../src/`
do not add this project to the parent package or change its import graph.

## Longitude crossings and sign ingresses

`searchLongitudeCrossings(context, body, targetDegrees, options)` searches one
longitude in degrees in `[0, 360)`. `searchSignIngresses(context, body, options)`
searches all tropical sign boundaries in one scan. Both use the engine adapter
by default. They return the shared complete/refused result; each event records
the clock, target longitude, body, direction, numerical root bracket and
residual in degrees. Ingresses add `fromSign` and `toSign`, with sign ownership
reversed for retrograde motion. Events sort by time, then longitude.

Options require an integer `stepMs` sampling interval. `direction` accepts
`direct`, `retrograde` or `both` (the default). Samples include the start and
end; events belong to `(start, end]`. Exact zeros at shared sample boundaries
are returned once. A stationary constant longitude emits no events. A sampled
touch followed by a reversal or plateau is suppressed; at the window end an
exact boundary contact uses its incoming direction because no outgoing sample
is available. A stationary touch is not a sign change.

Within each cell the endpoints are unwrapped by the shortest angular arc.
Completeness requires continuous, strictly monotonic longitude within each
cell, with travel less than a half turn. These are caller assumptions, not
facts certified by the scanner. A station inside a cell can hide two passes;
an entire turn can alias to no motion. An exactly half-turn endpoint separation
throws because its direction is ambiguous. Other violations cannot generally
be detected from endpoints. `complete` means the requested scan finished,
conditional on these assumptions; it does not prove astronomical completeness.
Reducing the step helps resolve motion but supplies no proof. Station-aware
search policy is still needed before the long-span public query API is wired.

Each detected bracket is refined to integer milliseconds using the shared
refiner. The bracket width is at most one millisecond, enforced by the analytic
fractional-root test in [longitude.test.ts](test/longitude.test.ts). An estimate
that rounds to a cell's open start instead uses its right bracket endpoint.
The residual belongs to the reported estimate. This is numerical resolution,
not a physical timing tolerance. No close events are merged by a time threshold.

Scanning and refinement charge the same evaluation context. Exhaustion or
cancellation discards all events found so far. Invalid options, ambiguous cells,
invalid provider samples and parent engine refusals propagate as errors.
A custom `LongitudeProvider` must share the context and charge each sample;
it is intended for analytic tests or another explicitly defined longitude
source. Its coordinates and continuity are the caller's responsibility.

[longitude.test.ts](test/longitude.test.ts) checks synthetic linear motion,
wraps, resolved reversals, window ownership, sign transitions, fractional
roots, cancellation and budget exhaustion. It also demonstrates the hidden
paired-root limitation. The default-adapter test checks integration only and
does not pin an astronomical date. Independent date checks and their limited coverage are recorded in
[references/README.md](references/README.md).

## Exact aspects

`searchExactAspects(context, body, target, policy, options)` searches a moving
body against a fixed natal longitude (`{ kind: 'fixed', longitude }`) or
another moving body (`{ kind: 'moving', body }`). Supply a nonempty explicit
policy, for example `{ aspects: [{ id: 'square', angleDegrees: 90 }] }`.
The angle domain and square branches are enforced by
[aspects.test.ts](test/aspects.test.ts) over synthetic linear motion and a
resolved retrograde loop. Identifiers and angles must each be unique.
Custom angles are allowed; there are no implicit major aspects, orbs or
closest-aspect selection. Same-body moving pairs are rejected because their
relative longitude is identically constant.

Relative longitude is the moving longitude minus the target longitude,
normalized onto the circle. A fixed target must already use the adapter's
coordinate conventions; this function does not calculate a natal chart or
accept birth data. Every unsigned aspect searches both orientations, except
conjunction and opposition, whose orientations coincide. Events retain the
policy rule, target, relative-longitude branch, clock, bracket and residual.
They sort by time, branch and rule identifier. All detected passes survive;
there is no time-threshold deduplication across different contacts.

The scan options and ownership rules are those of longitude crossings.
`direction` describes increasing or decreasing relative longitude, rather
than either body's individual direct or retrograde motion. Completeness
requires monotonic, continuous relative motion within every cell and travel
shorter than a half turn. Individually monotonic bodies can still have a
relative station. Hidden paired roots and unsampled stationary touches remain
possible; sampled touches are suppressed as in the crossing scanner. These
are crossing searches, not a general detector of tangential exact contacts.

Each branch scans separately, without caching. Fixed-target samples charge
one provider request; moving pairs charge a request for each body, including
refinement requests. All branches share the context and budget; any refusal
discards every contact from earlier branches. Input policy and target values
are snapshotted before scanning. Invalid provider coordinates and computation
errors propagate. Tests check analytic aspects and default-adapter integration;
the independent date checks and their limited coverage are recorded in
[references/README.md](references/README.md).


## Stations and retrograde intervals

`searchStations(context, body, { stepMs })` finds sign-changing zeros of
apparent geocentric tropical longitude speed. A station's `direction` is its
outgoing motion, `retrograde` or `direct`. It carries its longitude, clock,
numerical bracket and speed residual in degrees per day. With the default
adapter this is a root of the parent's finite-difference speed, not an analytic
instantaneous derivative. A custom `MotionProvider` must charge the same
context, provide finite speed and longitude, and define mutually consistent
motion on the declared clock.

Sampled zeros are confirmed by nonzero speed on both sides. Same-sign touches
are suppressed; consecutive zero-speed samples reject as an unresolved plateau.
A zero at the window start is excluded from station results, and a zero at the
end is unconfirmed because no outgoing sample is available. Nonzero sign-change
brackets are refined with the shared root refiner. The fractional analytic root
in [stations.test.ts](test/stations.test.ts) enforces the millisecond enclosure
and checks that the speed residual belongs to the returned estimate.

`searchRetrogradeIntervals(context, body, { stepMs, sign? })` returns spans of
negative speed intersecting the window, including intervals already underway
at its start or still underway at its end. `clippedStart` and `clippedEnd`
mean the corresponding station was not confirmed inside the window; a zero
at the window end remains clipped. At a start-window zero, the next nonzero
sample establishes the initial motion under the cell assumptions below.
The intervals have positive duration. Their numeric endpoints delimit motion
segments; isolated zero-speed instants do not have duration and are not treated
as separate retrograde intervals.

Each interval retains its full window-clipped extent and a chronological
`signSpans` partition from tropical ingresses. The optional sign filter selects
an interval if any positive-duration span overlaps that sign. It does not
require the retrograde station to occur in the sign or trim the interval to the
sign. Thus a future query for Venus retrogrades in Leo means intervals
intersecting Leo. A boundary touch alone does not match. At an exact sign
boundary, the following retrograde segment owns the lower sign, including the
wrap from Aries to Pisces. Analytic overlap and wrap tests in
[stations.test.ts](test/stations.test.ts) enforce this convention.

Station scanning requires continuous speed with at most one sign-changing
zero in each cell, and isolated sampled zeros whose neighboring samples resolve
their motion. Sign partitioning separately inherits the longitude scanner's
continuous, monotonic, short-arc cell assumptions. A station cell can violate
that longitude assumption, so sign spans can miss paired ingresses near a
station. No completeness proof or automatic adaptive subdivision is supplied.
The paired-station test demonstrates a coarse scan missing both stations and
a finer scan recovering them. `complete` remains conditional on these sampling
assumptions. Reducing `stepMs` helps resolve motion but does not certify it.

Stations, ingresses and partition samples share the request budget. Any budget
or cancellation refusal discards all interval results; invalid samples and
engine refusals propagate. The default adapter tests establish integration only.
Independent Venus station date checks and their declared thresholds are in
[references/README.md](references/README.md).

## Independent date checks

The committed Horizons references, acquisition command, interpolation methods,
TT labels, frame differences, attribution and comparison scope are documented
in [references/README.md](references/README.md). Normal tests reproduce the
reference reduction offline before comparing searches with those dates. Python
is required for these checks. Live acquisition uses only the independent JPL
service and writes into the ignored `generated/` folder.
