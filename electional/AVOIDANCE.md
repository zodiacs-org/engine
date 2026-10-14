# Eclipse and station avoidance

`evaluateAvoidanceRule(rule, window, engine, eventsCapability, options)` evaluates
`avoid-eclipses` and `avoid-stations`. It calls the existing events package's
`searchEclipses` or `searchStations`, then composes intervals. It implements no
event discovery, geometry or root refinement. Rules express traditional
selection conventions, not predictions about an activity's outcome.

Station rules select planetary longitude stations in either direction. They
do not require a body to be direct; use the separate direct-motion rule for
that. Eclipse rules select global solar or lunar events, including partial and
penumbral events under the declared model. Location does not filter global
avoidance. The API does not calculate local visibility, contacts or eclipse
duration.

## Declared clocks and margins

Pass an explicit `ClockWindow` and positive `stepMs` and `maxEvaluations`.
`withinDays` is the validated rule option. A day means fixed elapsed labels
on the window's clock, with `marginMs = floor(withinDays * 86400000)`.
This floors the binary64 product once. It uses neither local calendar days nor
daylight-saving adjustments. Submillisecond fractions are discarded at this
step. UTC, UT1 and TT labels remain distinct; there is no clock conversion.

Both margin endpoints are excluded: for an exact integer event label `e` and
integer margin `m`, the excluded half-open set is `[e-m, e+m+1)`. A zero-day
margin excludes the event label itself. The inclusive right endpoint and
half-open result ownership are enforced by
[avoidance-windows.json](test/fixtures/avoidance-windows.json) and
[avoidance-rules.electional-check.ts](test/avoidance-rules.electional-check.ts).
Those tests use hand-derived integer sets, including a singleton, overlapping
margins and roots outside either requested edge.

Discovery extends beyond both requested edges by the day margin and an
additional guard of `stepMs + derivativeStepMs + 1` labels, taking the
derivative step as zero for stations. `EventsAdapter` adds its existing left
ownership guard. This provides incoming/outgoing station evidence and keeps
eclipse roots clear of one-sided derivative edges. Event labels and source
brackets are retained without shifting them. Events outside the requested
range can still exclude times inside it. Unrepresentable padding refuses
before sampling. Native refusals at padded instants retain their original
coverage detail rather than reducing the day margin.

## Eclipse model and engine receipts

For eclipse rules, `options.eclipse` must explicitly contain
`derivativeStepMs` and `model: { sunRadiusAu, moonRadiusAu, earthRadiusAu }`.
Radii must be positive and finite with the Sun largest. Station rules reject
eclipse settings. The optional events runtime must export `searchEclipses`;
an older build lacking that export refuses eclipse evaluation as a missing
capability while remaining usable for stations.

The provider calls `EngineAdapter.vector` for the Sun and Moon through the
existing `calc` API. It requests native Cartesian au with explicit
geocentric, tropical, apparent, true ecliptic of date conventions and no speed.
It never derives Cartesian vectors from a separate ephemeris. Native receipts
describe the actual requests, resolved instants, correction conventions,
time basis, engine and ephemeris. The Moon keeps the engine's documented
correction behavior. The events package owns the spherical shadow model,
minimum-axis-distance objective and coarse classification. Flattening,
atmospheric shadow enlargement and solar total/annular/hybrid distinctions
are outside that API's model.

Both vector requests count separately against the same budget across all
selected kinds. Station requests likewise share the budget across bodies.
Native evaluations, refinements and failed requests count; raw internal
ephemeris work and elapsed time are not bounded by this request count.
Cancellation is checked around synchronous requests and between searches.
It cannot interrupt a synchronous engine call midway. Refusals expose empty
usable interval sets while keeping receipts and search audits from work
already performed. An absent capability has no fabricated receipt.

## Certain failures and unresolved boundaries

For an inclusive source root bracket `[lo, hi]`, every allowed root excludes
the certain core `[hi-m, lo+m+1)`, which can be empty. Any allowed root can
exclude the possible envelope `[lo-m, hi+m+1)`. The envelope outside the core
is unresolved rather than rounded into a passing or failing result. This
places uncertainty at the margin edges, where it matters for selection.
The numerical bracket is not a physical error bound.

Union the certain cores for `failed`. Missing source coverage is expanded
by the margin, including coverage gaps outside the requested domain. The
remaining possible exclusions and expanded gaps are unresolved, except where
another selected event already establishes certain failure. `covered` is the
domain outside unresolved spans; `satisfied` is covered outside failures.
These three classifications partition the requested integer labels. Native
source coverage and numerical uncertainty are never silently treated as a
passing empty event search.

Every result includes the frozen validated rule, explanation, clock, margin
convention, work count, native receipts and delegated searches. `avoidances`
records each event, its search index and its clipped possible/certain sets.
Padding-only events can have empty clipped sets and remain auditable. Source
URLs and module digests identify the loaded entry, not authenticated releases
or all dependencies. `completeness: source-scan-assumptions` retains the
source's scan limitations: coarse steps, derivative sampling and marginal
classification can miss events. No exhaustive completeness claim is made.

## Independent references and reproduction

[avoidance-nasa.json](references/avoidance-nasa.json) contains selected
published numerical rows from NASA GSFC's
[solar catalog](https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html) and
[lunar catalog](https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html), identified
by catalog number and date in [avoidance-cases.json](references/avoidance-cases.json).
The [solar key](https://eclipse.gsfc.nasa.gov/SEcat5/SEcatkey.html) and
[lunar key](https://eclipse.gsfc.nasa.gov/LEcat5/LEcatkey.html), columns headed
TD of Greatest Eclipse and Eclipse Type, define the selected fields. Their
Acknowledgments permit reproducing data with this credit:
**Eclipse Predictions by Fred Espenak and Jean Meeus (NASA's GSFC)**.
Retain it and the provenance when redistributing these rows. The fixture is
published data with that permission; it is not relabeled as MIT code.
The source publications are Espenak and Meeus, *Five Millennium Canon of
Solar Eclipses*, NASA TP-2006-214141, and *Five Millennium Catalog of Lunar
Eclipses*, NASA TP-2009-214173.

NASA's [time page](https://eclipse.gsfc.nasa.gov/LEcat5/time.html), Terrestrial
Dynamical Time section, identifies its TD naming with TT. The fixture retains
a TD label without a UTC suffix and computes numeric TT coordinates from its
calendar fields. Catalog Delta T is retained as provenance and is not used to
convert labels. The keys define greatest eclipse using shadow-axis distance,
matching the source objective. Catalog theories and corrections differ from
the engine and declared spherical model.

[avoidance-nasa.mjs](scripts/avoidance-nasa.mjs) fetches bounded pages and keys
into gitignored `generated/`, selects normalized rows and records page/row
digests. The keys, time page and catalog rows were fetched and read for this
milestone. Offline verification reproduces dates and types and checks
selection, URLs, clocks and digests. Digests alone cannot authenticate pages.
Supplying the acquisition directory additionally reproduces rows against the
downloaded bytes. Acquisition never overwrites committed references or runs
the engine.

From `electional/`, on the declared Node runtime:

```sh
node scripts/avoidance-nasa.mjs --verify
node scripts/horizons.mjs --verify
npm test -- --reporter=default --reporter=json --outputFile=generated/m8-vitest.json
node scripts/record-m8-tests.mjs
npm run build
node scripts/check-avoidance-esm.mjs
npm run check:isolation
# Optional reacquisition writes a candidate and HTML only under generated/.
node scripts/avoidance-nasa.mjs --acquire
node scripts/avoidance-nasa.mjs --verify references/avoidance-nasa.json /absolute/path/to/electional/generated/avoidance-nasa
```

[avoidance-references.electional-check.ts](test/avoidance-references.electional-check.ts)
enforces an eclipse-label and window-edge acceptance threshold of 180000 ms,
over exactly the selected dates from 2022-11-08 through 2025-03-29 TT. It uses
the explicit radii and scan/derivative steps in `avoidance-cases.json`, selected
before engine comparisons. It checks central/partial solar and
total/partial/penumbral lunar classes for those selected cases only. It does
not establish marginal classification, visibility or broad-range accuracy.

Station avoidance reuses the independent NASA/JPL Horizons DE441 series in
[horizons.json](references/horizons.json). Their clocks, frame, acquisition
terms and independent secant-speed reduction are recorded in
[references/README.md](references/README.md). The acceptance threshold is
1200000 ms for event labels and assembled margin edges, enforced in
`avoidance-cases.json` and the reference test. The checked station series span
2023-04-20 to 2023-04-23 and 2023-09-14 to 2023-09-17 for Mercury, and
2023-07-22 to 2023-07-25 and 2023-09-03 to 2023-09-06 for Venus, all TT.
Both direction changes are checked; separate cases put a referenced station
outside each requested edge to check padding. These thresholds allow the
declared model and interpolation differences; they are not physical bounds.

Native comparisons use the existing read-only events build if present, and
are explicitly skipped if absent. The independent hand-derived cases always
run. [m8-tests.json](docs/evidence/m8-tests.json) records the local run's
runtime, statuses, comparison scope and source digests, produced from Vitest's
report by [record-m8-tests.mjs](scripts/record-m8-tests.mjs). It carries statuses
and provenance, never native sky output as a reference expectation. All data
is non-personal or synthetic; no Swiss Ephemeris material is used.
