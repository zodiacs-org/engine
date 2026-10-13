# Evidence and operating limits

The workbench searches the parent engine's apparent geocentric tropical
true-of-date coordinates. A mathematically narrow root bracket describes a
root of that model. It cannot establish a physically exact event time.
Choose the clock, search horizon, step, budget and any event policy explicitly.

| Feature | Independent evidence | Limits |
| --- | --- | --- |
| Ingresses and aspects | JPL Horizons selected dates in `references/cases.json`, enforced by `test/horizons.node-test.ts` and `test/reference-api.node-test.ts` | Horizons and the parent differ in frame and corrections. Sparse date agreement does not establish a full search inventory. Natal targets are invented fixed longitudes. |
| Stations and retrogrades | Independently reduced JPL Venus station dates in the same fixture, also checked inside the long-span search | Horizons stations are interpolated extrema of sampled longitude, not instantaneous derivative catalog entries. Other interval dates have no independent comparison here. |
| Eclipses | Selected NASA TT greatest-eclipse dates and coarse classes in `references/nasa-cases.json`, enforced by `test/nasa.node-test.ts` and `test/reference-api.node-test.ts` | Spherical shadow geometry omits oblateness and atmospheric enlargement. Solar types are central or partial; paths, local visibility, contact times, magnitudes and total/annular/hybrid distinctions are unavailable. |
| Void-of-course Moon | Analytic boundary and policy tests in `test/void.node-test.ts` | No independent astronomical void-period date evidence. The chosen sign-based last-exact-contact convention is explicit, rather than a claim to cover every historical definition. |
| Long-span Venus search | Partition, step and filter consistency in `test/long-span.node-test.ts`, plus the existing selected JPL dates | Agreement between computations from the same engine is not independent evidence of completeness or accuracy over the entire span. |

The JPL acquisition, conventions, attribution, unchanged thresholds and measured
reference windows are documented in [references/README.md](references/README.md).
NASA attribution, selected catalog rows, radii, clock interpretation and
unchanged thresholds are documented in [references/NASA.md](references/NASA.md).
Offline provenance checks reproduce those fixtures without a live network.
The whole-year API tests widen discovery windows but compare only the selected
reference dates. No exhaustive NASA inventory or new physical error bound is
claimed. No reference fixture was derived from engine output.

# Sampling and boundaries

Bisection refines discovered sign-changing brackets. A fixed scan step can miss
paired crossings around a station, isolated tangencies, or several extrema in
one cell. The scans require the continuity, isolated-zero and short-arc
assumptions detailed in [README.md](README.md). Finer-step agreement can reveal
some misses, but cannot prove none remain. The API's `complete` status means
that the prescribed scan finished under these assumptions, not that every
physical event was found. There is no automatic certified step selection.

Searches own instants after the start through the end. Retrograde intervals
intersecting a boundary can be clipped. Joining partitioned intervals requires
merging adjoining clipped fragments and sign spans before applying a whole-
interval sign filter. Eclipse derivative guards omit events near window edges;
pad and filter a lower-level search if those edges need coverage. DSL execution
retains these guards. Void-of-course Moon tails without a sign exit remain in
`unresolved`; extend the horizon rather than treating such a tail as empty.

Integer root ordering can misassign nearly simultaneous aspects and sign
boundaries whose brackets overlap. UTC and UT1 time-model transitions can break
continuity; TT is used for independent date comparisons and the long-span
exercise. A TT millisecond coordinate is not a UTC timestamp despite the shared
epoch encoding. This project supplies no conversion or wall-time resolution.
The adapter can refuse outside the parent calculation API's reference coverage;
calendar parsing alone does not establish ephemeris support.

# Work, transport and isolation

Budgets count adapter requests, including requests for finite-difference speeds,
rather than internal ephemeris operations. Budget exhaustion, cancellation and
parent calculation refusals discard all events. An empty completed list is
separate from refusal. Unexpected computation failures throw. Both `next` and
`all` scan the entire explicit horizon, so a far-future next query costs the
full scan. There is no automatic horizon expansion or caching across queries.

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
