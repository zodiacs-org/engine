# Event search workbench

An isolated, private TypeScript project for event searches built on the parent
`@zodiacs/engine`. It is excluded from the engine's npm package. Progress and
remaining features are tracked in [PLAN.md](PLAN.md) and [PHASE2.md](PHASE2.md).

The current implementation exposes a bracketed scalar root refiner, shared
search contracts, an evaluation context, a longitude adapter, longitude
crossing searches, tropical sign ingresses, exact aspects, stations and retrograde
intervals, spherical-model solar and lunar eclipses, and sign-based
void-of-course Moon intervals, a typed query parser and DSL execution through
`executeQuery` and a bounded HTTP API through `createEventServer`.
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
Node suites use `.node-test.ts` sources and `.node-test.js` bundles so the
parent Vitest runner ignores both.

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
behavior are enforced in [root.node-test.ts](test/root.node-test.ts) using analytic
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
Published NASA eclipse catalog date tests are documented in
[references/NASA.md](references/NASA.md). Reference fixtures must name their source,
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
[engine.node-test.ts](test/engine.node-test.ts) cover the clock labels and delegation for
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
refusals are distinct. [context.node-test.ts](test/context.node-test.ts) enforces these
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
Reducing the step helps resolve motion but supplies no proof. This is the
original scan, retained when `stationStepMs` is omitted.

For station-aware bracketing, supply `stationStepMs` as a positive integer no
larger than `stepMs`:

```ts
const result = searchSignIngresses(context, 'Mercury', {
  stepMs: 86400000,
  stationStepMs: 21600000
});
```

These step sizes are caller choices, not accuracy guarantees. The scanner
subdivides each longitude step into speed cells no wider than `stationStepMs`.
It requests speed at their endpoints, refines sign-changing speed zeros and
scans longitude on both sides. It retains both integer endpoints of a
fractional speed-zero bracket. Sampled zero-speed knots already split the
cells. Interior boundary touches remain suppressed; a contact at the window
end still uses its incoming direction. No samples are requested outside the
window. All speed requests and both refinements charge the same context.

This policy requires continuous speed with at most one sign-changing zero in
each speed cell, mutually consistent longitude and speed, and short-arc
monotonic longitude between the resulting knots. Hidden pairs of stations
can still alias to equal endpoint speed signs. A finite-difference speed zero
need not locate the true longitude extremum; near such an extremum close
passes can still be missed or have large timing errors. Turning excursions
wholly between adjacent integer milliseconds are unresolved. Zero-speed
plateaus, unobserved discontinuities and arbitrary custom-provider motion are
not certified. `complete` continues to mean the requested scan finished under
its assumptions.

The default adapter supplies finite-difference speeds. A custom
`LongitudeProvider` must honor `sample(body, atMs, true)` and return finite
`speedDegreesPerDay` when this option is enabled. Missing or invalid speeds
throw; there is no silent fallback. Longitude-only custom providers continue
to work with the original scan. Query execution and HTTP accept the same
option for ingresses, aspects, stations, retrograde intervals and
void-of-course searches. Eclipse queries reject it because they use a
different minimum-search policy.

Each detected bracket is refined to integer milliseconds using the shared
refiner. The bracket width is at most one millisecond, enforced by the analytic
fractional-root test in [longitude.node-test.ts](test/longitude.node-test.ts). An estimate
that rounds to a cell's open start instead uses its right bracket endpoint.
The residual belongs to the reported estimate. This is numerical resolution,
not a physical timing tolerance. No close events are merged by a time threshold.

Scanning and refinement charge the same evaluation context. Exhaustion or
cancellation discards all events found so far. Invalid options, ambiguous cells,
invalid provider samples and parent engine refusals propagate as errors.
A custom `LongitudeProvider` must share the context and charge each sample;
it is intended for analytic tests or another explicitly defined longitude
source. Its coordinates and continuity are the caller's responsibility.

[longitude.node-test.ts](test/longitude.node-test.ts) checks synthetic linear motion,
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
[aspects.node-test.ts](test/aspects.node-test.ts) over synthetic linear motion and a
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

With `stationStepMs`, the aspect scanner requests each moving body's speed
and uses moving-minus-target speed to locate relative turning points. A fixed
target has zero speed. The same station-cell assumptions apply to relative
speed even when both bodies individually move direct. Options are snapshotted
before any provider callback or aspect branch. Analytic coverage is in
[turning.node-test.ts](test/turning.node-test.ts); the independent paired-pass
checks and their timing discrepancies are described in
[references/README.md](references/README.md#paired-passes-near-stations).

Each branch scans separately, without caching. Fixed-target samples charge
one provider request; moving pairs charge a request for each body, including
refinement requests. All branches share the context and budget; any refusal
discards every contact from earlier branches. Input policy and target values
are snapshotted before scanning. Invalid provider coordinates and computation
errors propagate. Tests check analytic aspects and default-adapter integration;
the independent date checks and their limited coverage are recorded in
[references/README.md](references/README.md).


## Stations and retrograde intervals

`searchStations(context, body, { stepMs, stationStepMs? })` finds sign-changing
zeros of apparent geocentric tropical longitude speed. A station's `direction` is its
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
in [stations.node-test.ts](test/stations.node-test.ts) enforces the millisecond enclosure
and checks that the speed residual belongs to the returned estimate.

`searchRetrogradeIntervals(context, body, { stepMs, stationStepMs?, sign? })`
returns spans of negative speed intersecting the window, including intervals already underway
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
sign. Thus a query for Venus retrogrades in Leo means intervals
intersecting Leo. A boundary touch alone does not match. At an exact sign
boundary, the following retrograde segment owns the lower sign, including the
wrap from Aries to Pisces. Analytic overlap and wrap tests in
[stations.node-test.ts](test/stations.node-test.ts) enforce this convention.

Station scanning requires continuous speed with at most one sign-changing
zero in each cell, and isolated sampled zeros whose neighboring samples resolve
their motion. With `stationStepMs`, station discovery and the initial-motion
probe use that finer interval, and sign partitioning uses the station-aware
longitude scanner. Options are snapshotted before provider callbacks. Omission
retains the original station and ingress grids. Sign partitioning inherits
the chosen longitude policy's continuity, monotonicity and short-arc
assumptions. With the original grid a station cell can hide paired ingresses.
With the station-aware grid hidden multiple speed zeros can still hide them.
No completeness proof or automatic choice of step is supplied.
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

The separate [broader Horizons sample](references/HORIZONS-SAMPLE.md) selects
station and ingress windows from independent daily body-year surveys, then
reduces hourly source rows. Its source excerpts, requests, digests and selection
reproduce offline. Search comparisons retain a Saturn ingress timing failure
under the unchanged threshold, separately from successful event discovery.

## Eclipse searches

`searchEclipses(context, kind, model, options)` accepts `solar` or `lunar`,
explicit spherical radii (`sunRadiusAu`, `moonRadiusAu`, `earthRadiusAu`) in
astronomical units, and integer `stepMs` and `derivativeStepMs`. The Sun must
have the largest radius. No physical radii or atmospheric correction are
silently selected. A custom `EclipseProvider` supplies Sun and Moon Cartesian
vectors in the same geocentric frame and units, charging the shared context.
`EclipseEngineAdapter` uses the parent calculation API's apparent geocentric
true-of-date ecliptic vectors. The Moon inherits the parent's geometric lunar
series convention. Each vector request charges a budget unit; a Sun/Moon pair
charges both requests. The declared clock is forwarded as in `EngineAdapter`.

The event definition follows the closest-shadow-axis concept described by
Fred Espenak in NASA's [eclipse glossary](https://eclipse.gsfc.nasa.gov/help/SEglossary.html):
solar events minimize the distance of Earth's center from the Sun-Moon shadow
axis; lunar events minimize the distance of the Moon's center from the axis
opposite the geocentric Sun. The implementation models spherical bodies and
straight shadow cones by similar triangles. It evaluates penumbral and umbral
radii at the target center's projection onto the axis. Shadows pointing away
from the target are discarded. An event requires strict overlap between the
penumbra and the target disk; a grazing equality is excluded.

Solar classifications are `central` when the axis crosses the spherical Earth
and `partial` otherwise. They do not distinguish total, annular or hybrid
solar eclipses. Lunar classifications are `total` when the whole Moon disk
fits inside the positive umbra, `partial` when that umbra overlaps the disk,
and `penumbral` otherwise. These are classifications at the returned minimum,
not classifications over all instants of the eclipse. Solar surface visibility,
contact times, paths, magnitudes, Earth's oblateness and atmospheric lunar
shadow enlargement are not calculated. Near grazing boundaries this simplified
model can disagree with published eclipse catalogs.

The search brackets negative-to-nonnegative changes of a finite-difference
slope of squared axis distance, then refines the slope zero with `refineRoot`.
`derivativeStepMs` is the central-difference half-width. The residual has units
of squared astronomical units per millisecond. The numerical enclosure is at
most one millisecond, enforced by the analytic fractional-minimum test in
[eclipses.node-test.ts](test/eclipses.node-test.ts). It encloses the finite-difference
zero, not necessarily the true derivative zero or a physically exact time.
Increasing the derivative step changes this definition; very small steps can
expose floating-point noise. UTC time-basis discontinuities can invalidate
continuity, so TT is preferable for catalog comparison.

A minimum needs samples on both sides. Searches return events only in
`(startMs + derivativeStepMs, endMs - derivativeStepMs]`; the boundary guards
remain unconfirmed and are omitted. To search a desired `(start, end]`, pad
both window endpoints by the derivative step and filter returned events to
the desired window. Padding samples must remain inside parent coverage.
Endpoint derivatives used for scanning are one-sided. Exact interior sampled
zeros are returned once when approached from a negative slope. Flat plateaus
produce no event.

Completion assumes continuous geometry and a finite-difference slope with at
most one isolated sign-changing zero per scan cell. A large step can hide
multiple minima, as demonstrated by the coarse/fine analytic test. No automatic
scan policy or proof of astronomical completeness is supplied. Finished scans
are `complete` only under these assumptions and the boundary-guard definition.
Cancellation or budget exhaustion discards all events; malformed vectors,
nonfinite arithmetic and parent refusals propagate as computation errors.
The model and step values are snapshotted before scanning.

The tests use independently calculated analytic geometry and synthetic motion
for the numerical method, and same-parent comparisons for adapter delegation.
Independent NASA catalog date and coarse-class comparisons are now enforced
by [nasa.node-test.ts](test/nasa.node-test.ts), with acquisition, attribution, clocks and
comparison limits documented in [references/NASA.md](references/NASA.md).
The [broader NASA sample](references/NASA-SAMPLE.md) adds full catalog-date
checks in fixed years across the requested reference span. Its independent
noncentral solar class disagreement remains explicit in the evidence.
The analytic and adapter tests themselves establish no astronomical accuracy.


## Void-of-course Moon

`searchVoidOfCourseMoon(context, policy, { stepMs, stationStepMs? }, provider?)`
searches under an explicit `{ bodies, aspects }` policy. Bodies must be unique supported
non-Moon bodies; aspect rules have the same validation as exact aspects.
There is no default classical or modern body selection, orb, or sign filter.
Coordinates and clocks are those of the engine adapter.

For this API, the Moon is void of course after its last exact moving-to-moving
contact strictly inside a tropical sign and before its next direct sign
ingress. If there is no contact in a complete sign residence, the entire
residence is returned. This is an explicit computational convention, with no
claim that every historical definition uses it. Tangential contacts suppressed
by the exact-crossing scanner do not count. Relative direction is unrestricted;
no separate applying-orb test is made.

Intervals carry `startMs`, `endMs`, `sign`, `clock`, `clippedStart` and
`lastContact`. Contact and ingress root estimates delimit the duration; the
contact instant and ingress instant are its boundaries. A contact exactly at
sign entry or exit does not count as a contact inside either sign. Ties use the
reported integer estimates, with no physical uncertainty allowance. Contacts
whose enclosures overlap an ingress can therefore be assigned incorrectly at
that numerical resolution. Simultaneous last contacts choose a deterministic
representative by target body, aspect id and relative branch.

A leading segment with a known exit can be returned from the window start if
no later contact occurs before that exit. `clippedStart` then means the actual
start may precede the window, and `lastContact` is null. A full sign residence
without contacts has a null last contact and is not clipped. A contact exactly
at the window start is excluded by the shared window convention and leaves a
leading interval clipped. Returned spans always have positive duration.

A trailing sign segment without an observed ingress is listed in `unresolved`
with reason `next-ingress-outside-window`, rather than guessed from the last
contact found so far. Search completion means the requested scan finished;
inspect `unresolved` before treating an empty event list as an absence of void
periods. Extend the context window through the next ingress to resolve it.
There is no sampling outside the context window or hidden lookahead. An ingress
at the window end resolves that sign and leaves no trailing unresolved span.

All ingress scans, selected-body aspect scans, refinements and initial-sign
samples share the evaluation budget and cancellation context. Refusals discard
both interval and unresolved output. Invalid inputs and provider failures
propagate. The policy and scan options are snapshotted before sampling.
`stationStepMs` applies to both the Moon ingress scan and every selected
moving-body aspect scan, including relative turning points when both bodies
individually move direct. Omitting it retains longitude-only custom providers
and the original scan. The analytic composite checks in
[turning-composite.node-test.ts](test/turning-composite.node-test.ts) cover
repeated contacts, retrograde sign partitions, clipping and shared refusals.

The search assumes continuous direct Moon motion and inherits the ingress
scanner's monotonic short-arc cell assumptions and the aspect scanner's
relative-motion assumptions. Observed retrograde Moon ingresses reject the
search; hidden reversals and contacts can remain unresolved under either
policy when its sampling assumptions fail.
A `complete` result does not certify physical or astronomical completeness.
[void.node-test.ts](test/void.node-test.ts) checks analytic last-contact selection,
multiple bodies, signed aspect branches, wrap, clipping, entry/exit ownership,
fractional contact enclosures, unresolved tails, validation and refusals.
Its default-adapter check establishes integration only. No independent
void-of-course date accuracy measurement is claimed here; the existing JPL
and NASA fixtures cover only the events documented in their reference guides.

The local query parser is available as `parseQuery`, with typed
`QuerySyntaxError` failures. [QUERY.md](QUERY.md) documents its grammar,
explicit ranges and filters. It returns syntax only; `executeQuery` performs
the search as described in [QUERY.md](QUERY.md).


## HTTP API

Build the local project before starting a server. The worker entry must remain
beside the bundled index; copying only the index is insufficient.

```sh
npm run build --prefix events
node --input-type=module -e 'import { createEventServer } from "./events/build/src/index.js"; createEventServer().listen(8080, "127.0.0.1")'
```

`createEventServer()` returns a Node HTTP server without listening at import or
construction time. The example explicitly binds to loopback. There is no
storage, authentication, CORS policy or request logging in this workbench.

Send `POST /search` with `Content-Type: application/json` (optionally UTF-8
charset), an uncompressed UTF-8 JSON body, and exactly `query` and `options`:

```json
{
  "query": "next Mars square natal Sun from 2000-01-01 to 2000-02-01 clock tt",
  "options": {
    "stepMs": 3600000,
    "maxEvaluations": 10000,
    "natalLongitudes": { "Sun": 0 }
  }
}
```

The natal longitude is invented. The step and budget are caller choices, not
accuracy guarantees. Options follow `executeQuery`, including `stationStepMs`,
explicit clocks, next horizons and eclipse models; HTTP accepts DSL strings only and rejects
signals, providers and unknown options. Horizon coordinates are integer epoch
milliseconds on their declared clock. Search results retain the programmatic
window, evaluations, refusal reasons, interval clipping and unresolved tails.

Completed searches and search refusals both return HTTP 200 with the existing
`status` envelope. Transport and validation errors return `{ "error": {
"code": "..." } }`: invalid JSON, request shapes and DSL use 400; unknown routes
404; other methods 405; unsupported media types or compression 415; excessive
request or response size 413; busy admission 503; deadline expiry 408; unexpected
worker failure 500. DSL errors additionally carry `offset` and `syntaxCode`.
Errors do not echo submitted text or internal exception messages. Responses
are JSON with no-store caching and close the connection.

Service caps are declared in `HTTP_LIMITS` in [http.ts](src/http.ts).
[http.node-test.ts](test/http.node-test.ts) enforces request size, evaluation cap,
admission and deadlines, using loopback integration tests. The same tests check
the independently reduced JPL synthetic natal aspect fixture described in
[references/README.md](references/README.md), over that fixture's own window
and preregistered tolerance. No broader astronomical claim follows from HTTP.

Admission includes reading the body. An admitted request runs its synchronous
search in a dedicated worker, leaving the server thread responsive. A deadline
covers body upload, worker startup and calculation. `deadlineMs` may lower the
service deadline. Client disconnects and deadlines terminate workers and discard
output; the admission slot remains occupied until termination settles. Busy
requests are refused without a queue. The response size is checked before
sending the complete result; it never returns a truncated list. Worker memory
is limited through Node's old-generation resource limit, which is not a total
process-memory bound. `workerUrl` is trusted local server configuration for
bundled deployments and tests, never an HTTP option. Server owners can use
Node's connection-close methods when shutting down active clients.


## Worked queries and long searches

After a local build, run `node events/examples.mjs` from the repository root.
[examples.mjs](examples.mjs) executes synthetic natal aspects, Leo retrogrades,
ingresses, stations, eclipses and an explicit void-of-course policy. Its output
keeps the declared clock; TT coordinates must not be displayed as UTC instants
without a separate time-scale conversion. The executable examples are checked
by [isolation.node-test.ts](test/isolation.node-test.ts).

For the requested multi-century search, use the local programmatic API:

```js
import { executeQuery } from './events/build/src/index.js';

const result = executeQuery('all Venus retrogrades in Leo 1900-2100 clock tt', {
  stepMs: 86400000,
  maxEvaluations: 1000000
});
if (result.status === 'refused') throw new Error(result.reason);
console.log(result.events);
```

The year shorthand ends at the start of the year after the final named year.
Leo means positive-duration overlap with tropical Leo during retrograde motion;
the returned interval includes its portions in other signs. This is neither a
filter on the station sign alone nor a restriction to intervals entirely in Leo.
The range clips already active intervals, with clipping flags preserved.

[long-span.node-test.ts](test/long-span.node-test.ts) exercises this span on TT, compares
whole-window and partitioned scans, and compares daily unfiltered intervals
with half-day Leo-filtered intervals. It checks sign-span continuity, ordering,
all-or-nothing budget refusal and the selected JPL Venus station dates with
their original acceptance thresholds. Step agreement is a consistency check,
not an independent proof of exhaustive event discovery or physical accuracy.
The daily step and evaluation budget above are tested work settings, not
universal defaults. Local searches can exceed the HTTP service's work caps;
use a local process for this span. Splitting HTTP requests requires joining
clipped retrograde fragments before sign filtering, since a sign overlap can
occur only in the other fragment.

See [LIMITATIONS.md](LIMITATIONS.md) for the evidence boundaries and operating
limits. Full-year DSL comparisons against selected independent dates are in
[reference-api.node-test.ts](test/reference-api.node-test.ts); they reuse the unchanged
JPL and NASA references rather than generating expectations from this engine.
