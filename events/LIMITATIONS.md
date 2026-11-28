# Evidence and operating limits

The workbench searches the parent engine's apparent geocentric tropical
true-of-date coordinates. A mathematically narrow root bracket describes a
root of that model. It cannot establish a physically exact event time.
Choose the clock, search horizon, step, budget and any event policy explicitly.
Station-aware bracketing is available through the opt-in `stationStepMs`
policy. It improves discovery under additional speed-sampling assumptions;
it does not certify a complete inventory or repair the parent model's timing.
Omitting it preserves the original scan. [README.md](README.md) describes the
search APIs and [QUERY.md](QUERY.md) describes query and HTTP options.

| Feature | Independent evidence | Limits |
| --- | --- | --- |
| Ingresses and aspects | JPL Horizons selected dates in `references/cases.json`, enforced by `test/horizons.node-test.ts` and `test/reference-api.node-test.ts`; broader ingress sample in `references/horizons-sample.json` and `test/horizons-sample.node-test.ts` | Horizons and the parent differ in frame and corrections. Sparse date agreement does not establish a full search inventory. The broader sample retains a Saturn ingress timing failure under its unchanged threshold. Natal targets are invented fixed longitudes. |
| Repeated passes near stations | Independent hourly Horizons Venus rows reduced in `references/loop-cases.json`, checked by `test/turning-reference.node-test.ts`; discovery and timing evidence in `evidence/station-loops.json` | The opt-in scanner recovers the paired directions in the declared source windows. Default-engine timing fails the unchanged reference threshold for these slow passes. Numerical interpolation checks do not repair physical-model timing differences. |
| Stations and retrogrades | Independently reduced JPL Venus station dates in the original fixture, also checked inside the long-span search; broader body-year station sample in `references/horizons-sample.json` and `test/horizons-sample.node-test.ts` | Horizons stations are interpolated extrema of sampled longitude, not instantaneous derivative catalog entries. The sparse body-year sample does not establish whole-interval or full-span completeness. |
| Eclipses | Selected NASA TT greatest-eclipse dates and coarse classes in `references/nasa-cases.json`, enforced by `test/nasa.node-test.ts` and `test/reference-api.node-test.ts`; broader fixed-year sample in `references/nasa-sample.json` and `test/nasa-sample.node-test.ts` | Spherical shadow geometry omits oblateness and atmospheric enlargement. The broader sample retains a noncentral solar class disagreement. Solar types are central or partial; paths, local visibility, contact times, magnitudes and total/annular/hybrid distinctions are unavailable. |
| Void-of-course Moon | Analytic boundary and policy tests in `test/void.node-test.ts` | No independent astronomical void-period date evidence. The chosen sign-based last-exact-contact convention is explicit, rather than a claim to cover every historical definition. |
| Long-span Venus search | Partition, step and filter consistency in `test/long-span.node-test.ts`, plus the existing selected JPL dates | Agreement between computations from the same engine is not independent evidence of completeness or accuracy over the entire span. |

The JPL acquisition, conventions, attribution, unchanged thresholds and measured
reference windows are documented in [references/README.md](references/README.md).
The broader sample's daily selection, hourly reductions, rounded-zero secants
and retained timing discrepancy are in
[references/HORIZONS-SAMPLE.md](references/HORIZONS-SAMPLE.md). Its source excerpts
reproduce offline; the full-response digests recorded during acquisition
cannot be recomputed from those excerpts.
NASA attribution, selected catalog rows, radii, clock interpretation and
unchanged thresholds are documented in [references/NASA.md](references/NASA.md).
The broader catalog-date sample and its retained class disagreement are in
[references/NASA-SAMPLE.md](references/NASA-SAMPLE.md). Offline checks reproduce
numerical row hashes, date arithmetic and selection without a live network;
stored full-page digests cannot authenticate the original downloaded bytes.
The whole-year tests in
[reference-api.node-test.ts](test/reference-api.node-test.ts) widen discovery
windows but compare only the original selected dates. Those tests establish
neither an exhaustive NASA inventory nor a new physical error bound. No
reference fixture was derived from engine output.

The fixed-query report in [COMPLETENESS.md](COMPLETENESS.md) now compares whole
selected-year eclipse inventories with NASA, and whole-year station, ingress
and aspect searches with the sparse Horizons references. It retains unmatched
results, misses, timing failures and class disagreements separately. Its
selected years span the requested period without covering every intervening
year. Horizons outputs outside the independently covered windows remain
unreferenced. Retrograde interval and void-of-course inventories are outside
that report's independent coverage.

The report and its tests deliberately retain failed comparisons. A green test
run means that the evidence reproduces, including these discrepancies:

- Original single-cell searches miss the paired Venus passes in the declared
  source windows. Station-aware searches recover their directions, while the
  default-engine dates still fail the unchanged timing threshold. See
  [station-loops.json](evidence/station-loops.json) and
  [turning-reference.node-test.ts](test/turning-reference.node-test.ts).
- The selected Saturn ingress in 2050 is discovered under both policies but
  fails the original timing threshold. See
  [horizons-sample-timing.json](evidence/horizons-sample-timing.json) and
  [horizons-sample.node-test.ts](test/horizons-sample.node-test.ts).
- NASA's noncentral solar eclipse on 1950-03-18 is returned as central by the
  spherical model. Discovery and timing pass for this reference; the class
  disagreement remains. See
  [nasa-sample-timing.json](evidence/nasa-sample-timing.json) and
  [nasa-sample.node-test.ts](test/nasa-sample.node-test.ts).

Thresholds are acceptance criteria fixed for those references, rather than
physical error bounds. Near slow motion, a small coordinate difference can
produce a large timing difference. The comparisons do not isolate a single
cause or justify widening the thresholds.

## Sampling and boundaries

Bisection refines discovered sign-changing brackets. A fixed scan step can miss
paired crossings around a station, isolated tangencies, or several extrema in
one cell. The scans require the continuity, isolated-zero and short-arc
assumptions detailed in [README.md](README.md). Finer-step agreement can reveal
some misses, but cannot prove none remain. The API's `complete` status means
that the prescribed scan finished under these assumptions, not that every
physical event was found. There is no automatic certified step selection.

Longitude, ingress and aspect searches can opt in through `stationStepMs`,
including query execution and HTTP. Speed sign changes split cells at refined
speed zeros, with relative speed used for moving aspects. This requires at most one
sign-changing speed zero per speed cell and consistent continuous motion;
multiple hidden stations can still be missed. Finite-difference speed zeros
do not certify longitude extrema. Excursions wholly within an integer
millisecond remain unresolved. No tangential-contact detector is added.
Missing custom-provider speeds reject this policy explicitly. Omitting it
retains the phase 1 scan. Retrograde searches use the finer grid for station
discovery and the station-aware policy for sign partitions. Void-of-course
searches use it for Moon ingresses and relative contacts. All subsearches
share the context budget, with no provider requests beyond the window. Eclipse
queries reject this option; their minimum-search policy remains separate.

Searches own instants after the start through the end. Retrograde intervals
intersecting a boundary can be clipped. Joining partitioned intervals requires
merging adjoining clipped fragments and sign spans before applying a whole-
interval sign filter. Eclipse derivative guards omit events near window edges;
pad and filter a lower-level search if those edges need coverage. DSL execution
retains these guards. Void-of-course Moon tails without a sign exit remain in
`unresolved`; extend the horizon rather than treating such a tail as empty.

Boundary rules also depend on the event definition. A longitude contact exactly
at the window end uses incoming motion because there is no outgoing sample;
it can be returned even though an interior stationary touch is suppressed.
A sampled zero-speed station at the window end is unconfirmed and omitted,
leaving a retrograde interval clipped. Station and retrograde scans reject
consecutive sampled speed zeros as an unresolved plateau; station-aware
longitude and aspect scans instead retain zero-speed knots. These behaviors are checked by
[longitude.node-test.ts](test/longitude.node-test.ts),
[turning.node-test.ts](test/turning.node-test.ts) and
[stations.node-test.ts](test/stations.node-test.ts). They supply no event
evidence outside the requested window.

Integer root ordering can misassign nearly simultaneous aspects and sign
boundaries whose brackets overlap. UTC and UT1 time-model transitions can break
continuity; TT is used for independent date comparisons and the long-span
exercise. A TT millisecond coordinate is not a UTC timestamp despite the shared
epoch encoding. This project supplies no conversion or wall-time resolution.
The adapter can refuse outside the parent calculation API's reference coverage;
calendar parsing alone does not establish ephemeris support.

The numerical enclosure belongs to a sampled longitude, speed or geometry-slope
root, rather than a confidence interval for a physical event. The parent's
finite-difference speed samples can extend beyond the context window even
though adapter requests cannot. The central calculation checks both UT1 and TT
against the parent's reference coverage, so clock conversion can cause refusal
near an edge. The guarded long-range benchmark and its separate coverage-edge
refusal are recorded in
[PERFORMANCE.md](PERFORMANCE.md), with the query windows fixed in
[performance-plan.json](scripts/performance-plan.json).

## Work, transport and isolation

Budgets count adapter requests, including requests for finite-difference speeds,
rather than internal ephemeris operations. Budget exhaustion and cancellation
discard all events. Lower-level searches propagate `EngineRefused`; query
execution and HTTP convert it to `reason: 'engine-refused'` with no partial
events. Other unexpected computation failures throw at the programmatic API;
HTTP returns a structured error. An empty completed list is separate from
refusal, and void-of-course results also require inspecting `unresolved`.
These distinctions are checked in [context.node-test.ts](test/context.node-test.ts),
[search.node-test.ts](test/search.node-test.ts) and
[http.node-test.ts](test/http.node-test.ts). Both `next` and
`all` scan the entire explicit horizon, so a long-horizon next query costs the
full scan. There is no automatic horizon expansion or caching across queries.

The engine adapter computes only longitude in its finite-difference speed
subcalculations, omitting unused distance and Cartesian work. Scan grids, root
definitions, sampling assumptions and evaluation counts remain unchanged.
[PERFORMANCE.md](PERFORMANCE.md) records the measured scope and before/after
result checks. Local timings do not establish service deadlines or portable
performance guarantees.

Local execution is synchronous and cancellation is cooperative between samples.
The HTTP server isolates searches in workers, caps admission, upload/output
sizes and evaluation work, and terminates a worker on deadline or disconnect.
Large searches may need a local process. HTTP is a small transport adapter,
without authentication, persistent storage, CORS policy or production hosting.
Binding, access control and deployment remain the caller's responsibility.

Install and build only with the `events/` project commands. The workbench's
relative-source imports are bundled locally, so its results depend on the
parent source revision and pinned ephemeris dependency. Preserve those facts
when saving output. Local build output, downloaded bulk data and test logs
stay ignored. The parent npm dry-run assertion in `test/isolation.node-test.ts`
checks that this entire folder is excluded. The repository's engine CI does
not invoke this project's tests; run the commands in [CHECKS.md](CHECKS.md)
when reviewing changes here. Full engine and archive gates are separate.
