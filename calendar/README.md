# Calendar workbench

This private TypeScript project exports astrology event records as iCalendar
text and searches for tropical sign ingresses, natal transit exacts, stations,
solar/lunar eclipses and void-of-course Moon intervals through the existing events package, plus explicit
progressed synastry schedules. It imports the parent engine sources without
building or changing the parent npm package. The implemented scope is M1
through M11 in [PLAN.md](PLAN.md):
UTC and timezone serialization, validation, stable event identities and ingress
schedules, plus natal transit and synastry analysis for explicitly synthetic
charts, and receipt-bearing station, eclipse and void-of-course schedules,
with async streaming over bounded windows, a command-line exporter and a
local HTTP feed endpoint.

Use Node satisfying `engines` in [package.json](package.json). From this folder:

```sh
npm ci --ignore-scripts
npm run prepare:events
npm run typecheck
npm test
```

Dependencies are installed only in `calendar/node_modules`. Tests have the
suffix `.calendar-test.ts`, selected by the local Vitest configuration, so the
parent repository's default test scan does not need calendar dependencies.
Keep generated feeds and other bulk output in `generated/` or `.cache/`, both
gitignored. No calendar file belongs in the parent engine's packed contents.

The test and typecheck commands also run source preparation. It reads the
already available git objects pinned in [events-source.json](events-source.json),
originally from `origin/infra/events`, into `.cache/events-source/`. It does not
fetch, write git metadata, or change that branch. A source link keeps the
upstream package's relative engine imports intact. Preparation verifies the
source bytes, their recorded digests, and compatibility with the parent source
tree and package metadata. Missing pinned git objects require a checkout that
contains them; a different parent engine requires a reviewed pin update.

`node scripts/prepare-events.mjs --check` verifies an existing cache without
writing it. Missing files can be restored by preparation, while changed or
unexpected files are refused. To recover from an edited cache, remove only
`calendar/.cache/events-source/` and prepare it again. Direct library imports
assume preparation has already succeeded. Source metadata records provenance;
it does not authenticate files at runtime. A TypeScript runner or bundler must
resolve `astronomy-engine` to this project's installed dependency, as the local
Vitest configuration does, since the parent sources have no required install.

## Library input

Import `serializeCalendar` and the types from `src/index.ts` through a
TypeScript-aware build or test runner. Pass an iterable of `ScheduleEvent`
records and `{ dtstamp }`, the UTC revision instant. The function returns a
string and does not read the current clock, write files or perform searches.
Repeating the same inputs yields the same output. It preserves input event
order. Callers can supply persistent, distinct UIDs or derive them with
`eventUid(identity)` as described below.

An event supplies `uid`, `summary`, `receipt` and optionally `endUtc` for an
exclusive interval end. Its receipt supplies:

- `schema: "zodiacs-calendar-receipt/1"` and `utc`, the event instant.
- `eventType`, one of the schedule types declared in `src/types.ts`.
- `bodies`, in participant order, and `aspect`, a name and `angleDegrees`,
  or null when no aspect applies.
- `orbDegrees`, an angular residual in degrees, or null when not applicable.
  A station's speed residual is not an angular orb.
- `engine`, the source engine and ephemeris identity.
- Optional `source`, a plain JSON object for original calculation conventions,
  time-basis receipts and search metadata. Non-finite or cyclic data is refused.

`currentEngineIdentity()` reads the checkout's version and ephemeris constants
by relative import. It describes only calculations from this checkout; it must
not relabel a result imported from another engine version. Serializer input
is a calculation record supplied by the caller, not authenticated evidence.
The schedule search adapters connect upstream search results to this model;
no event search is implemented here.

## Ingress schedules

```ts
import { searchIngressSchedule, serializeCalendar } from "./src/index.ts";

const result = searchIngressSchedule({
  namespace: "synthetic-ingress.calendar.invalid",
  body: "Sun",
  startUtc: "2026-03-19T12:00:00.000Z",
  endUtc: "2026-03-22T12:00:00.000Z",
  clock: "utc",
  stepMs: 3_600_000,
  maxEvaluations: 10_000
});
if (result.status === "refused") throw new Error(result.reason);
if (result.events.length > 0) {
  const ics = serializeCalendar(result.events, {
    dtstamp: "2026-01-01T00:00:00.000Z"
  });
}
```

This invented schedule window and these work settings are exercised in
`test/ingresses.calendar-test.ts`; they are not default accuracy settings.
Supported bodies are the Sun, Moon and planets named by the pinned events
package. The request requires a positive canonical UTC range, an explicit
`clock: "utc"`, a positive integer evaluation budget, and a sampling step in
milliseconds that divides a UTC day. TT and UT1 input clocks are refused;
their epoch labels cannot be emitted as UTC without a separate conversion.

Results own `(startUtc, endUtc]`. The adapter executes the upstream DSL's
`all` mode for each canonical UTC day, with a following day of padding so
an exact boundary touch can be checked against its outgoing motion. Padding
events are removed before identity assignment; requested-range filtering
happens afterwards. The fixed sample grid and ownership policy keep UIDs and
receipts consistent across overlapping requests and partitions at event
instants. The step is part of the identity's search policy, so changing it
changes UIDs. Request bounds and budgets are outside the identity. Padding
can cause an engine refusal near its coverage boundary even if the displayed
range lies inside that coverage.

Each ingress carries the body, from/to signs, direction, target longitude,
numerical bracket and signed angular residual returned by the search. The
top-level orb is the absolute residual in degrees. An additional `calc`
request at that instant supplies the full engine receipt, including its
conventions, UTC, UT1 and TT, Delta T and time basis. Source metadata retains
the pinned events commit and engine tree, coordinate conventions and padded
query window. Searches use apparent geocentric tropical longitude in the
true ecliptic and equinox of date, including the engine's own Moon convention.

`complete` means the prescribed scan finished. It does not prove that every
physical ingress was found: the upstream scanner assumes continuous,
monotonic motion within each cell with travel shorter than a half turn.
Paired crossings near a station can be missed. UTC time-basis transitions can
break continuity. Outside the engine's observed time data, UTC input can be
read as civil UT1 under its model; the retained calculation receipt says which
basis was used. See the pinned package's
[search limitations](https://github.com/zodiacs-org/engine/blob/7d6fb88d03b3896ee1e5496ed99961015d291d3c/events/LIMITATIONS.md).

Budget units are adapter requests, not internal ephemeris operations or a
wall-clock deadline. All days, padding and receipt calculations share the
request's budget. A budget, cancellation or engine refusal returns an empty
event list and a reason, discarding any earlier results. A completed empty
schedule remains distinct and cannot be passed to the current serializer.
Unexpected calculation failures throw. Cancellation via `signal` is
cooperative between synchronous calls; a same-thread timer cannot interrupt
a running search. This adapter collects its result in memory. `streamSchedule`
collects bounded windows, and the HTTP endpoint runs it in disposable workers.

`test/ingresses-boundary.calendar-test.ts` uses analytic synthetic motion
through the actual events scanner to check midnight crossing ownership,
touch suppression, partition stability, validation and work controls.
`test/ingresses.calendar-test.ts` compares delegation and receipts with the
parent APIs on its declared synthetic windows and round-trips UTC and TZID
feeds through `ical.js`. These are integration and regression checks, not
independent astronomical accuracy evidence.

## Personal natal transit schedules

```ts
import { searchNatalTransitSchedule, serializeCalendar } from "./src/index.ts";

const result = searchNatalTransitSchedule({
  namespace: "synthetic-natal-transit.calendar.invalid",
  body: "Sun", natalBody: "Sun", clock: "utc",
  startUtc: "2026-02-01T00:00:00.000Z",
  endUtc: "2026-02-06T00:00:00.000Z",
  stepMs: 3_600_000, maxEvaluations: 100_000,
  policy: { aspects: [{ id: "conjunction", angleDegrees: 0 }] },
  natal: {
    id: "synthetic-chart-a", synthetic: true,
    birth: {
      utc: "2001-02-03T04:05:06.789Z", timeScale: "utc",
      latitude: 12.5, longitude: 34.25,
      houseSystem: "whole", timeKnown: true
    }
  }
});
if (result.status === "refused") throw new Error(result.reason);
if (result.events.length > 0) {
  const ics = serializeCalendar(result.events, {
    dtstamp: "2026-01-01T00:00:00.000Z"
  });
}
```

This invented chart, range and sampling policy are exercised in
`test/natal-transits.calendar-test.ts`, including the golden feed
`test/fixtures/synthetic-natal-transits.ics`. They are regression examples,
not recommended accuracy settings or evidence of astronomical accuracy.

The request names a moving `body` and a fixed `natalBody`, each from the
pinned events package's supported Sun, Moon and planets. The bodies can be
the same for a natal return. The adapter calls the parent `natalChart` once
and takes the target longitude from that chart's body row. It calls the
events package's `searchExactAspects` directly, with an explicit `policy`:
each rule has a unique `id` and unique `angleDegrees`, in degrees from
conjunction through opposition. Custom angles are supported. The rule ID
is a caller-supplied label; the numeric angle defines the calculation.
There are no inherited natal aspect orbs, in-orb intervals or
applying/separating allowances. The top-level `orbDegrees` is the absolute
angular residual of the returned exact-contact estimate.

Only invented chart inputs are accepted by project policy. `synthetic: true`
is required and is a caller declaration, not verification. `id` names a
durable chart configuration. The birth input requires a canonical UTC
instant and explicit `timeScale: "utc"`; TT, UT1, unresolved wall times,
offset spellings and precomputed chart objects are refused. Optional birth
settings are `latitude` and `longitude` together, `houseSystem`, `timeKnown`
and a pinned `deltaT` in seconds. Unknown time retains the caller's exact
reference instant and suppresses natal angles/houses according to the engine;
the adapter does not infer noon. A natal Delta T pin applies to the natal
chart alone. The moving body uses the engine's ordinary UTC time basis.

Each event preserves the complete natal envelope from
`createNatalEnvelope`, including chart bodies, requested/actual houses,
flags, conventions, Delta T and time basis, under
`receipt.source.natal.calculation`. The moving body's full `calc` receipt is
`receipt.source.calculation`. The original search event preserves the fixed
target longitude, aspect angle, oriented relative-longitude branch,
direct/retrograde direction, numerical bracket and signed residual.
`source.policy` preserves all requested labels and angles. The receipt's
ordered bodies identify the moving body first and the natal body second.
These records describe the calculation; they do not authenticate its origin.

The same fixed UTC-day search, following-day padding, `(startUtc, endUtc]`
ownership and all-occurrences identity assignment used for ingresses apply
here. Non-conjunction/non-opposition rules search both oriented branches.
The UID includes the durable chart ID, normalized birth settings, numeric
aspect policy, branch, direction and sampling settings. Default birth
settings normalize before identity assignment. Aspect labels, rule order,
request bounds, budgets, receipt residuals and display timezone do not change
UIDs; changing the numeric aspect set does. Computed natal longitude is
retained in the receipt rather than hashed as a chart configuration. The
day-ordinal scheme's limitations across engine/search revisions still apply.

The evaluation budget includes natal creation, every upstream sample and
each moving receipt calculation for every owned event before display
filtering. Natal creation counts as one adapter request, even though the
engine performs many calculations internally. Cancellation before work
performs no natal calculation. Budgets and cancellation are cooperative,
as for ingress schedules; any refusal discards all collected events.
Moving-search engine refusals return `reason: "engine-refused"`. Invalid
input, natal engine errors (including a birth outside its ephemeris span),
and unexpected calculation errors throw. A completed empty result remains
distinct from a refusal.

This is a sampled longitude-crossing search. `complete` says that the scan
finished, under the upstream continuity, monotonic-cell and short-arc
assumptions. Tangential contacts, paired roots inside a cell and time-basis
discontinuities need the upstream limitations described above. Following-day
padding resolves sampled endpoint touches; it does not establish general
completeness. `test/natal-transits-boundary.calendar-test.ts` uses analytic
synthetic motion through the upstream scanner to exercise repeat contacts,
branch separation, midnight ownership, clipping, validation and work controls.
The integration tests verify engine delegation, stable overlapping requests,
the natal Delta T pin and independent iCalendar parser round trips. No new
event search algorithm is introduced here.

## Synastry analysis and exact schedules

`analyzeStaticSynastry({ first, second })` calls the parent engine's
`natalChart` and `synastry` for two fixed synthetic natal inputs. It returns
`convention: "static-natal/1"`, `timing: "undated"`, ordered participants
with full natal envelopes, and the engine's major inter-chart `aspects`.
`exactAspects` filters those rows to strictly zero engine-reported orb. A
small positive orb remains outside that subset; this is a numerical
classification under the engine's ordinary synastry policy, not physical
accuracy evidence. Static analysis has no occurrence time and produces no
VEVENT. Its input refuses date-range and moving-convention fields.
`test/static-synastry.calendar-test.ts` compares the analysis and envelopes
with the parent APIs for its declared invented births, including coincident
and nearly coincident charts.

For dated events, `searchSynastrySchedule` requires the explicit convention
`"secondary-progressed-first-to-natal-second/1"`. `firstBody` belongs to the
first chart, progressed to each calendar instant; `secondBody` stays at the
second chart's natal longitude. Reversing the participants changes the
calculation. Both participants require distinct durable IDs and the same
synthetic input declaration and validation as natal transits. The same body
may appear on both sides. Nodes and chart angles are outside this adapter's
supported body set.

```ts
import { searchSynastrySchedule, serializeCalendar } from "./src/index.ts";
import {
  syntheticSynastryRequest, syntheticSynastryDtstamp
} from "./test/fixtures/synthetic-synastry.ts";

const result = searchSynastrySchedule(syntheticSynastryRequest);
if (result.status === "refused") throw new Error(result.reason);
if (result.events.length > 0) {
  const ics = serializeCalendar(result.events, {
    dtstamp: syntheticSynastryDtstamp
  });
}
```

This example uses the invented births, explicit conjunction policy and
February 2026 range in `test/fixtures/synthetic-synastry.ts`, exercised by
`test/synastry.calendar-test.ts` and its small golden feed
`test/fixtures/synthetic-synastry.ics`. The second birth is deliberately
chosen at a progressed epoch of the first to construct a contact. It tests
export behavior, not an independently observed astronomical event.

At every sample the adapter calls the engine's `progressedInstant` with the
first birth UTC and the schedule UTC, then `calc` at that mapped instant.
The mapping is the engine's elapsed-year secondary progression, with its
`PROGRESSION_DAYS_PER_YEAR` convention. It also accepts the engine's signed
extension for schedule instants before birth. These are elapsed UTC
milliseconds, not local anniversaries. The resulting longitude is passed
to the pinned events package's existing `searchExactAspects` provider
interface. No event search is implemented in this project. The explicit
angle policy supports custom angles and both oriented branches, as for
natal transits; the engine's static synastry orb allowances do not apply.

The schedule UTC is the VEVENT's start and the top-level receipt's `utc`.
`source.progression` separately records that schedule instant, the first
birth, the progressed calculation instant, the mapping constant and the
integer-millisecond epoch convention. `source.calculation` is the full
`calc` receipt at that progressed instant. `source.first.calculation` and
`source.second.calculation` retain both natal envelopes, including their
birth clocks and settings. The top-level ordered bodies and ordered chart
IDs keep the progressed and fixed roles. `source.event` preserves the
upstream bracket, branch, direction, fixed target and signed residual;
`orbDegrees` is its absolute residual in degrees. The summary names both
roles and the secondary progression.

A natal Delta T pin is retained in its natal envelope. The second chart's
pin affects its fixed target. Progressed calculations follow the ordinary
engine clock at the mapped instant, as `progressedBodies` does; they do
not carry the first chart's natal pin forward. Unknown natal times retain
the explicit reference instant with `timeKnown: false`. No progressed
houses, progressed angles, second-chart progression or ordinary sky
transits are implied by this convention. Calculation coverage applies to
the natal and progressed epochs; the schedule year alone does not establish
coverage or accuracy. Receipts retain the engine's UTC/UT1 time basis.

Progression maps to a JavaScript Date with integer milliseconds. This makes
the sampled longitude a staircase in elapsed calendar time. The adapter
requires `stepMs` to divide a UTC day and be at least 1,000 milliseconds of
calendar time, checked in `test/synastry-boundary.calendar-test.ts`. Smaller
steps can repeatedly sample an identical progressed epoch and make the
upstream scanner suppress a contact as stationary. The minimum avoids that
clock-level collapse; it does not establish astronomical completeness or
remove numerical plateaus in computed positions. A returned exact contact
is a numerical crossing estimate with its actual residual, not a claim of
zero angular error or sub-millisecond event timing. Tangencies, paired roots
inside a scan cell and time-basis jumps retain the upstream search limits.

The adapter uses the ingress and natal transit boundary policy: fixed UTC
days with following-day padding, ownership in `(startUtc, endUtc]`, then
identity assignment before display clipping. UIDs include the convention,
both ordered IDs, both normalized births, numeric angle set, branch,
direction and sampling settings. Labels, rule order, display timezone,
request bounds and budgets do not change UIDs. The existing day-ordinal
limitations across engine and search revisions apply.

Both natal creations, all upstream samples, padding and every owned
progressed receipt calculation share the evaluation budget. A refusal or
cancellation discards all collected events. A typed moving-engine refusal
returns `reason: "engine-refused"`; invalid input, natal calculation errors
and unexpected failures throw. Cancellation is cooperative between
synchronous calls. The implementation collects events in memory until the
streaming milestone. The boundary tests use analytic synthetic providers
through the actual scanner to check ownership, overlap, repeated contacts,
validation, budget exhaustion and cancellation. Integration tests compare
real progression and search calls, retain both natal pins correctly, and
round-trip UTC and TZID feeds with `ical.js`.

## Station schedules

`searchStationSchedule` searches a body's changes between direct and
retrograde longitude motion. Its request has the same `namespace`, `body`,
`startUtc`, `endUtc`, `clock: "utc"`, `stepMs`, `maxEvaluations` and optional
`signal` fields as an ingress request. Optional `direction: "direct"` or
`"retrograde"` selects the outgoing motion. Omit the field to retain both;
explicit null or undefined is refused.

The adapter calls the pinned DSL's `all` station search on each fixed UTC
day, with a following day to establish outgoing motion at a sampled midnight
zero. It assigns identities to the entire owned day before filtering by the
request range or direction. The outgoing direction belongs to the event's
identity; the request's direction filter does not. Computed longitude and
speed residual are retained in receipts, outside the identity. The range
owns `(startUtc, endUtc]`, as for ingress schedules.

Stations are sign-changing zeros of the parent calculation API's
finite-difference longitude speed in apparent geocentric tropical
true-of-date coordinates. `receipt.source.event` keeps the station's
longitude, outgoing direction, numerical bracket and signed
`residualDegreesPerDay`. `source.calculation` keeps the full speed-enabled
engine receipt, including time basis and speed convention;
`source.result` keeps the calculated longitude in degrees and speed in
degrees per day. The receipt's `aspect` and `orbDegrees` are null because a
speed residual is not an angular orb.

A zero-speed touch without a sign change is omitted. Consecutive zero-speed
samples make the upstream search throw an unresolved-plateau error; the
adapter does not treat that as an empty complete feed. Multiple reversals
inside one cell can be missed. Completion assumes continuous speed with
isolated sampled zeros and at most one sign-changing zero per cell. UTC
time-basis discontinuities retain the upstream limitations.

All padded searches and event receipt calculations share the evaluation
budget, including events hidden by direction or range filtering. Any budget,
cancellation or typed engine refusal discards all events. Unexpected
calculation errors propagate. Tests in `test/stations.calendar-test.ts`
compare delegation and receipts on their invented Mercury schedule in March
2026 and round-trip UTC and TZID feeds. The analytic tests in
`test/stations-boundary.calendar-test.ts` exercise midnight ownership,
touches, plateaus, filtering, overlapping requests and work controls.

## Solar and lunar eclipse schedules

```ts
import { searchEclipseSchedule, serializeCalendar } from "./src/index.ts";

const result = searchEclipseSchedule({
  namespace: "synthetic-eclipse.calendar.invalid", kind: "solar", clock: "utc",
  startUtc: "2026-08-11T00:00:00.000Z", endUtc: "2026-08-14T00:00:00.000Z",
  stepMs: 3_600_000, derivativeStepMs: 60_000, maxEvaluations: 100_000,
  model: {
    sunRadiusAu: 0.00465, moonRadiusAu: 0.0000116, earthRadiusAu: 0.0000426
  }
});
if (result.status === "refused") throw new Error(result.reason);
if (result.events.length > 0) {
  const ics = serializeCalendar(result.events, {
    dtstamp: "2026-01-01T00:00:00.000Z"
  });
}
```

The window, model and work settings above are explicit regression inputs from
`test/fixtures/synthetic-stations-eclipses.ts`, exercised by
`test/eclipses.calendar-test.ts`. They are not built-in physical radii or
recommended accuracy settings. Select `kind: "lunar"` for lunar eclipses.
The model requires positive finite spherical radii in astronomical units,
with the Sun largest. It is validated and detached before any search work.

The adapter calls the existing spherical shadow search. Its event instant
is a minimum of squared shadow-axis distance as found by a finite-difference
derivative: Earth's center from the Sun-Moon shadow axis for solar events,
or the Moon's center from the axis opposite the geocentric Sun for lunar
events. `derivativeStepMs` is the central-difference half-width, in integer
milliseconds, positive and no greater than a UTC day. `stepMs` must divide
a UTC day. The adapter pads each canonical day with both neighboring days,
so the upstream derivative guards do not omit minima near the owned day's
edges. Padding is fixed independently of the requested display range;
events belong to `(startUtc, endUtc]` after whole-day identity assignment.
Padding can reach outside engine coverage and cause refusal.

`receipt.source.event` preserves the upstream definition, kind,
classification, spherical model, numerical bracket, forward-shadow flag,
axis distance, penumbral and umbral radii in au, and signed derivative
residual in squared au per millisecond. `source.search` preserves the scan
and derivative steps and padded window. `source.calculations.Sun` and
`.Moon` each retain the complete parent `receipt` and the `cartesian`
position in au at the event instant. These use the search's apparent
geocentric true-of-date ecliptic frame; the Moon retains the parent's
geometric lunar-series convention. The participating bodies include Earth,
the geocentric origin and spherical target or shadow caster; no separate
Earth position is calculated. `aspect` and `orbDegrees` are null.

Solar classification is only `central` or `partial`. Lunar classification
is `total`, `partial` or `penumbral`, evaluated at the returned minimum.
There are no local visibility, path, contact-time, magnitude, or solar
total/annular/hybrid results. The model omits oblateness and atmospheric
shadow enlargement and excludes exact grazing equality. Near grazing
boundaries its classification can differ from physical eclipse catalogs.
The minimum and bracket describe this numerical model, not a physical timing
error bound. A completed scan assumes continuous geometry and isolated
slope zeros resolvable by the selected step; multiple minima inside a cell
can be missed. Flat minima need not produce events. TT and UT1 request
clocks are refused, and the original engine time basis remains in each UTC
receipt. A UTC epoch label is never used to relabel a TT search result.

UIDs include eclipse kind, radii, scan step, derivative step and boundary
policy. Computed classification, geometry and residuals are outside the
identity. Both vector calculations per sample and both final event receipt
calculations share the budget across all days. Any budget, cancellation or
engine refusal discards the collected output. Empty complete results remain
distinct. Execution and cancellation are synchronous and cooperative, as
for the other adapters.

`test/eclipses.calendar-test.ts` compares solar and lunar delegation,
geometry and full receipts on the invented August 2026 windows in the
fixture module, with UTC/TZID parser round trips and stable overlapping
requests. `test/eclipses-boundary.calendar-test.ts` supplies analytic vectors
to the real upstream scanner to check minima near midnight, repeat passes,
model validation, budget exhaustion and cancellation. The golden feed
`test/fixtures/synthetic-stations-eclipses.ics` combines a station and both
eclipse kinds; `test/stations-eclipses-golden.calendar-test.ts` enforces its
bytes, line format and independently parsed receipts. These are regression
and integration checks, not independent astronomical accuracy evidence.

## Stable event identities

`createEventIdentity` validates, detaches and deeply freezes an
`EventIdentity` with schema `zodiacs-calendar-event/1`. `eventUid` hashes its
canonical JSON with SHA-256 and returns
`zcal-v1-<hex digest>@calendar.zodiacs.org`. Object keys sort by JavaScript
string order; array order is preserved. Finite JSON numbers use JavaScript's
JSON representation, including normalization of negative zero. Hidden fields,
symbol keys, accessors, extra array properties, sparse arrays and non-JSON
values are refused rather than silently omitted. This encoding is local to
the versioned identity scheme; it does not claim an external canonical JSON
standard.

The identity consists of:

- A durable `namespace` owned by the producer. Use a globally unique feed or
  producer identifier and retain it across regeneration and URL changes.
- `eventType`, ordered `bodies`, and ordered `chartIds`. Natal transits need
  the target chart ID; synastry needs both chart IDs in participant order.
  Sky events have no chart IDs. Chart IDs name a durable chart configuration,
  not a display name. Change the configuration ID when birth inputs or chart
  settings change; retain it when a label changes.
- `aspectAngleDegrees`, or null when no aspect applies. An aspect's displayed
  name is outside the identity.
- `definition`, with an adapter-owned `id` ending in a version suffix and
  `parameters` containing all semantic settings. Include relevant zodiac,
  time basis, body/aspect policy, direction and aspect branch. Opposite
  branches of the same aspect angle must remain distinguishable. Exclude
  display settings, request range, budgets and output residuals.
- `occurrence`, identifying a particular pass or interval by one of the
  schemes below.

The UID is independent of summary, DTSTAMP, receipt provenance and residual
orb. Put `{ identity, uid: eventUid(identity), summary, receipt }` into
`serializeCalendar`. It checks that the UID, event type, ordered bodies and
aspect angle agree, then emits the identity as JSON in
`X-ZODIACS-IDENTITY;VALUE=TEXT`. Existing caller UIDs without an identity remain
supported. Identity claims do not authenticate receipts, chart IDs or search
completeness. [RFC 5545 section 3.8.4.7](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.4.7)
defines UID persistence and uniqueness.

For an upstream durable key, use
`{ scheme: "source-key/1", key: "synthetic-pass-a" }`. The adapter must ensure
that this key identifies the same occurrence across ranges and differs for
other occurrences of that series. An interval uses this scheme so display
clipping cannot change its identity. Do not derive the key from a rounded
instant, a displayed label or an index within the user's requested range.

When the search provides no durable key, `canonicalIdentityWindows(startUtc,
endUtc)` lazily yields fixed UTC-day windows intersecting the requested
`(startUtc, endUtc]` range. Each day excludes its starting midnight and includes
the following midnight. For each day, an adapter must run the same complete
search with the same settings and deterministic boundary handling. Pass its
owned instantaneous events to `identifyEventBatch(namespace, batch)` before
filtering to the requested range. The function sorts by receipt UTC instant
and assigns a zero-based ordinal within each semantic series for that day.
It produces `utc-day-ordinal/1` occurrences, refusing non-day windows,
out-of-window events, refused searches, intervals and tied instants in the
same series. Empty complete batches return an empty list.

```ts
for (const window of canonicalIdentityWindows(startUtc, endUtc)) {
  // Adapter supplied in a later milestone: complete fixed-day search.
  const batch = await searchCanonicalDay(window);
  const identified = identifyEventBatch(producerNamespace, batch);
  const visible = identified.filter(({ receipt }) =>
    receipt.utc > startUtc && receipt.utc <= endUtc);
  // Send visible events to the serializer or later streaming layer.
}
```

`status: "complete"` is the adapter's assertion about the entire series, not
proof. In particular, the upstream events DSL's `next` mode can return a
complete result containing only the next match. It must not feed day ordinals;
request all occurrences before display filtering. Any search padding and
ownership decisions must be fixed by the adapter, independent of the user's
range. Merely widening arbitrary queries does not establish this property.
Changes that add, remove, reorder or move occurrences across midnight can
change day ordinals. This scheme does not promise identity stability across
such changes to the engine or search policy; a durable source key is needed
for that. The later event adapters must test their own boundary policies.

`test/identity.calendar-test.ts` enforces semantic separation, detached
identities, malformed-input rejection and UID retention under metadata and
in-day estimate changes. Its invented close passes remain distinct even
within a calendar second. `test/identity-windows.calendar-test.ts` calls the
existing engine crossing solver on synthetic motion over February 2026 and
checks regeneration, overlapping ranges, chunk boundaries and exact midnight
ownership. These are identity and plumbing checks, not astronomical accuracy
evidence. `test/fixtures/synthetic-identities.ics` pins generated UIDs and the
identity property's parser round trip.

## Calendar representation

Dates must be canonical UTC ISO strings with milliseconds, in the form
`YYYY-MM-DDTHH:mm:ss.sssZ`. Local times, offsets, date rollovers, leap seconds
and years outside the supported calendar form are refused. `DTSTART`,
`DTEND` and `DTSTAMP` omit fractional seconds as required by the iCalendar
format. The original event instant is retained in the receipt. An interval
whose endpoints collapse to the same calendar second is refused. An event
without an end is instantaneous.

Every VEVENT has a JSON receipt in DESCRIPTION. Explicit TEXT X-properties
repeat its schema, UTC instant, event type, bodies, aspect, orb, engine and
ephemeris. JSON values encode bodies and aspects so punctuation in labels
cannot change their structure. `X-ZODIACS-END-UTC` retains the original
interval end when present. `TRANSP:TRANSPARENT` leaves these informational
events out of busy time.

TEXT values escape backslashes, commas, semicolons and newlines. Output uses
CRLF endings and folds physical lines at the RFC's 75-octet limit without
splitting a Unicode code point. Continuation whitespace counts toward that
limit. Unsupported controls and lone surrogates are refused. The governing
definitions are [RFC 5545 sections 3.1, 3.3.5, 3.3.11 and 3.6.1](https://www.rfc-editor.org/rfc/rfc5545.html).
The content-line and serializer tests enforce these formatting rules and
round-trip the result with the independent `ical.js` parser.

An empty iterable is refused because [RFC 5545 section 3.6](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.6)
requires a calendar component. The CLI and HTTP endpoint report an empty
successful search separately from an upstream refusal.

## Timezone display

Create a timezone projection before serializing and pass it as `timeZone`:

```ts
import { createCalendarTimeZone, serializeCalendar } from "./src/index.ts";

const timeZone = createCalendarTimeZone(
  "America/New_York",
  "2026-03-08T06:59:59.000Z",
  "2026-11-01T07:00:00.000Z"
);
const ics = serializeCalendar(events, {
  dtstamp: "2026-01-01T00:00:00.000Z",
  timeZone
});
```

The dates above are the synthetic fixture's coverage in
`test/fixtures/synthetic-timezone.ts`. Coverage bounds are inclusive and must
contain every event start and interval end, including their milliseconds.
They describe timezone availability, separate from a search's boundary policy.
The factory returns frozen metadata backed by a private snapshot of offsets.
Pass the factory result itself; a copied or JSON-deserialized object is refused.
The projection can be reused for repeated exports within its coverage.

Normal event dates become local `DTSTART;TZID=...` and `DTEND;TZID=...`.
The calendar embeds a matching VTIMEZONE with an initial offset and explicit
clock transitions over the coverage and boundary padding. Onsets use the
offset before each transition, as
[RFC 5545 section 3.6.5](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.6.5)
requires. These definitions cover the requested interval; they are not
indefinite recurrence rules. DTSTAMP stays UTC. UID, the calculation receipt,
and the exact UTC start/end X-properties remain unchanged.

Each projected event also records `X-ZODIACS-TZID`, `X-ZODIACS-TZDB` and
`X-ZODIACS-TZDB-FORM`, separately from the calculation receipt. Display uses
the full timezone database bundled with the dependencies pinned in
`package-lock.json`: js-joda's IANA tzdb `2026e`, in rearguard form. Its clock
offsets come from that database, without host Intl sampling or a network
request. This is separate from the engine's historical birth-time resolver;
it does not replace a birthplace's local mean time or revise natal input.
Future civil rules can change, so a database update requires review and new
formatting checks. Display changes do not change event identities. The factory
checks a pinned digest of the provider's data because reduced js-joda bundles
share the full bundle's version label. Replacing that shared provider with a
reduced bundle prevents new projections; existing snapshots retain their
offsets. `test/timezone-provider.calendar-test.ts` enforces this behavior.

The factory accepts coverage from `0100-01-04T00:00:00.000Z` through
`2499-12-29T23:59:59.999Z`. The lower bound avoids calendar clients' handling
of early years; the upper bound stays inside the dependency's compiled future
transitions with space for padding. `test/timezone.calendar-test.ts` checks
both bounds and rejects dates outside them. This is a serialization range,
not evidence of historical or astronomical accuracy. Transition enumeration
also has a work budget. The
[js-joda timezone documentation](https://github.com/js-joda/js-joda/blob/main/packages/timezone/README.md#implementation-details)
describes the source and coverage. Its rearguard form represents daylight
saving as nonnegative. STANDARD/DAYLIGHT labels describe the offset at each
emitted onset; changes of abbreviation or DST classification that leave the
clock unchanged are not reconstructed.

Some dates use UTC even with a requested timezone:

- If either event endpoint is in a repeated wall-time interval, both endpoints
  use UTC. The RFC's local form denotes the first occurrence, while calendar
  clients can choose differently. Both occurrences are kept distinct this way.
- If the projection, including its padding, contains an offset with seconds
  below minute resolution or an offset outside the parser's supported range,
  every event in that projection uses UTC and no VTIMEZONE is emitted. No offset
  is rounded to make it fit a client.

`X-ZODIACS-TIME-FALLBACK` gives the reason: `ambiguous-local-time`,
`sub-minute-offset` or `offset-outside-client-range`. The requested zone and
database metadata remain attached. Inputs are resolved UTC instants, so a
spring gap is crossed without creating a nonexistent wall time. Interval
ordering is checked in UTC before display conversion.

`test/timezone.calendar-test.ts` and the small
`test/fixtures/synthetic-timezone.ics` golden cover New York's spring and fall
changes, Lord Howe's non-hour changes, fixed offsets, endpoint validation,
milliseconds, and UID retention. `test/timezone-history.calendar-test.ts`
compares the exported clocks and onsets with cited IANA definitions at Apia's
date-line change, Kathmandu's offset change, Paris's seconds-valued historical
offset, and Dublin's and Casablanca's seasonal rules. All use invented event
receipts and round-trip with `ical.js`, resolving the embedded VTIMEZONE.

## Void-of-course Moon schedules

`searchVoidOfCourseSchedule` calls the pinned events package's
`searchVoidOfCourseMoon` directly. Supply `namespace`, `startUtc`, `endUtc`,
`clock: "utc"`, `stepMs`, `maxEvaluations`, an optional `signal`, and an
explicit `policy: { bodies, aspects }`. Bodies are unique supported Sun and
planet identifiers, excluding the Moon. Aspect rules have unique IDs and
unique unsigned angles in degrees; custom angles are supported. No body set,
aspect set, orb allowance or traditional definition is inferred.

```ts
import { searchVoidOfCourseSchedule, serializeCalendar } from "./src/index.ts";
import { voidRequest, revisionUtc } from "./test/fixtures/synthetic-void-of-course.ts";

const result = searchVoidOfCourseSchedule(voidRequest);
if (result.status === "refused") throw new Error(result.reason);
if (result.events.length > 0) {
  const ics = serializeCalendar(result.events, { dtstamp: revisionUtc });
}
```

The example's invented February 2026 range and explicit Sun/Venus policy
are exercised by `test/void-of-course.calendar-test.ts` and its small golden
`test/fixtures/synthetic-void-of-course.ics`. The golden is an engine
regression record, not independent evidence of astronomical accuracy.

The convention is sign-based: a void interval begins at the Moon's last
exact contact with the selected bodies before its sign exit and ends at
that exit. If the policy has no exact contact during the sign, the interval
begins at sign entry. The upstream API excludes contacts exactly at sign
entry or exit from that sign's last-contact selection. Simultaneous contacts
use the upstream deterministic body/rule ordering. Retrograde Moon sign
motion is rejected by the upstream search. This convention does not cover
every historical definition of void-of-course.

The requested display range is `[startUtc, endUtc)`. Any interval overlapping
it is exported with its **full** start and exclusive end, without clipping.
An interval ending exactly at the requested start or beginning exactly at
the requested end is excluded. DTSTART can precede the requested range and
DTEND can follow it. Timezone coverage must contain those full endpoints.
`test/void-of-course-boundary.calendar-test.ts` exercises these rules with
analytic invented motion; the engine-backed golden spans both display edges.

Each interval is owned by its UTC sign-exit day. The adapter delegates
fixed-day searches with four UTC days of padding on each side and enumerates
exit days through four days after the display end. These finite padding
choices are enforced by the boundary tests over their invented February
2026 windows; they are work settings, not a guarantee about lunar motion.
The step must divide a UTC day. A source occurrence key combines the fixed
exit day and the interval ordinal within that day's same-sign series,
assigned before display filtering. The UID also includes the sign, selected
bodies, numeric angle set, coordinate conventions and sampling/boundary
policy. Request bounds, budgets, rule labels, policy order and display
timezone do not change it. Repeated exits within one day remain distinct.
Overlapping or adjacent requests can return the same full interval; deduplicate
by UID when joining their results. Receipts and UIDs are stable under the
tested overlapping windows, without promising stability across engine or
search revisions.

`receipt.utc` and `endUtc` retain the full UTC boundaries. Top-level
`aspect` and `orbDegrees` are null because the event is an interval. Ordered
`bodies` lists the Moon followed by the canonical selected body set.
`source.event` retains the original interval, sign, clipped flag and last
exact contact, including its aspect, moving target, root bracket and signed
angular residual. `source.lastContactOrbDegrees` is that contact's absolute
angular residual, or null when no contact exists. `source.boundaries` states
whether the start is a contact or sign entry and that the end is exclusive.
`source.calculations` preserves full Moon `calc` receipts at both boundaries
and the target body's receipt at the last contact when present. Search
provenance, policy, coordinate conventions and UTC/UT1/TT time bases remain
attached. `X-ZODIACS-END-UTC` preserves the exact end alongside DTEND.

Upstream unresolved padding tails are expected and discarded when they
cannot affect the requested coverage. If a displayed day's next sign exit
is unresolved, or a relevant interval has a clipped upstream start, the
adapter returns `status: "refused"`, `reason: "unresolved-interval"`, an
empty event list and `unresolved` diagnostics with the source windows and
boundary reason. It never calls an unresolved tail an empty successful
schedule or fabricates a missing boundary. Earlier collected intervals are
discarded too. Padding, all upstream scans and boundary/target receipt
calculations share the total evaluation budget. Budget exhaustion,
cancellation and typed engine refusal likewise return no partial events.
Unexpected failures throw. Searches remain synchronous with cooperative
cancellation and collect the result in memory.

`complete` means the prescribed scans finished under the upstream
continuity, monotonic-cell and short-arc assumptions. It is not proof that
every physical event was found. Paired crossings, nearly simultaneous
aspect/ingress brackets and time-basis jumps retain the upstream limitations.
Fixed padding can cause refusal near calculation coverage edges or when a
boundary lies beyond the halo. Integration tests compare delegation and
receipts with the parent APIs and parse UTC and TZID feeds with `ical.js`;
they supply no independent astronomical void-period reference dates.

## Streaming schedules and calendars

`streamSchedule` accepts shared `startUtc`, `endUtc`, `maxEvaluations`,
`windowDays`, `maxBufferedEvents`, optional `signal`, and a nonempty
`schedules` array. Each selection supplies `kind` and the existing adapter's
`request` fields, leaving range, budget and signal to the shared request.
Supported kinds are `ingress`, `natal-transit`, `synastry-exact`, `station`,
`eclipse` and `void-of-course`. Static synastry remains undated analysis.
All selections are validated against the full range before search work starts.
Inputs, including nested policies and synthetic charts, are detached when
the stream is created; the original AbortSignal remains connected.

```ts
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { streamSchedule, streamCalendar } from "./src/index.ts";
import { voidRequest, revisionUtc } from "./test/fixtures/synthetic-void-of-course.ts";

const { startUtc, endUtc, maxEvaluations: _singleSearchBudget, ...request } = voidRequest;
const events = streamSchedule({
  startUtc, endUtc, maxEvaluations: 1_000_000,
  windowDays: 1, maxBufferedEvents: 100,
  schedules: [{ kind: "void-of-course", request }]
});
// output is a caller-owned Writable, such as a file in generated/.
const feed = Readable.from(streamCalendar(events, { dtstamp: revisionUtc }), {
  objectMode: false, highWaterMark: 1
});
await pipeline(feed, output);
```

These work settings and synthetic fixture inputs are exercised by
`test/stream.calendar-test.ts`. `windowDays` is a positive integer duration
in UTC days, measured from the requested start, with a cap enforced by
`test/stream-control.calendar-test.ts`. The final window may be shorter.
Windows can begin at non-midnight instants. Every window delegates to the
existing synchronous schedule adapters, which retain their canonical-day
ownership, fixed padding and search definitions. No crossing algorithm is
implemented in the streaming layer. Choosing another window size changes
padding overhead and evaluation consumption; it preserves the tested event
records and UIDs. It can also change which window first exhausts a budget.

The evaluation budget is shared across selections and windows, including
chart construction, receipt calculations and repeated padding scans. A
window is fully searched before any of its events leave the stream. Its
records sort by receipt UTC, then by code-unit UID order, independent of
locale and selection order. Identical records with the same UID collapse;
conflicting records sharing a UID throw. Instantaneous events keep
`(startUtc, endUtc]` ownership. Void intervals keep `[startUtc, endUtc)`
overlap selection and their full endpoints. Only intervals still overlapping
a later window retain duplicate records across windows. Intervals spanning
several windows are emitted once; they are never clipped or split for display.

`maxBufferedEvents` caps the sum of adapter records collected for a window,
before duplicate removal, and the retained active interval records. The cap
is checked as each adapter returns. An individual adapter still allocates
its synchronous result before that check; its evaluation budget and bounded
search window control that work. Streaming retains a current window and
active intervals rather than accumulating the complete range. Timezone
definitions are separately bounded by the timezone factory's work controls.
Each encoded event is yielded as a complete string, so one unusually large
receipt is still held in memory while it is encoded.

Search begins only when the consumer calls `next()`. A paused consumer causes
no further searches. Breaking iteration or returning the iterator stops
future windows. The stream yields to the Node event loop between adapter
calls and emitted events so timers and HTTP disconnect handlers can deliver
cancellation. A synchronous adapter call must return or reach its cooperative
checkpoint before cancellation can take effect; streaming does not put it
in a worker. Pass the same `signal` to `streamCalendar` when cancellation
must also stop already encoded wire chunks.

A search refusal throws `ScheduleStreamError` with `reason`, cumulative
`evaluations`, `emitted`, the current `window`, and the selection index when
known. Its `cause` retains the adapter refusal, including unresolved interval
diagnostics. A buffer refusal uses `reason: "buffer-budget"`. Earlier emitted
windows cannot be recalled. The refused window emits nothing, and no later
window is searched. Unexpected failures and invalid adapter records throw
instead of becoming complete results. Manual `next()` iteration receives
`ScheduleStreamSummary` as the generator's successful return value, with
evaluation, emitted-event and completed-window counts. A complete schedule
with no events returns that summary with an empty event stream.

`streamCalendar` accepts an ordered sync or async event iterable and the
serializer's options, plus optional `signal`. It uses the same escaping,
folding, exact receipt properties and UTC/TZID representation as
`serializeCalendar`. It reads the first event before emitting the calendar
header, then yields the header, individual VEVENT strings, and the footer.
It does not pull the next event while the consumer is paused on a wire chunk.
Early return and failure close the upstream iterator. Empty input is refused
with no output. A failure after output begins omits `END:VCALENDAR` and
propagates to the consumer; callers must discard an incomplete artifact or
terminate an already started HTTP response. File callers should stream to
a temporary path and install it only after the pipeline succeeds.

The streaming serializer requires UTC/UID ordering and globally unique source
UIDs. It checks strict ordering, including duplicate UIDs at the same instant,
without retaining a range-wide UID set. For arbitrary externally supplied
records, the caller must establish global UID uniqueness before streaming.
`streamSchedule` supplies the existing adapters' stable identities and
deduplicates overlapping intervals and selections. `serializeCalendar`
remains available for unordered small iterables with a full duplicate check.
Timezone coverage must contain full interval endpoints, including those
outside the display range; insufficient coverage fails serialization.

`test/stream.calendar-test.ts` compares chunked and full-range records and
wire bytes over the synthetic February, March and August fixture windows.
It covers every schedule adapter, mixed ordering, exact split ownership,
non-midnight windows, interval deduplication, the committed formatting
golden, and independent UTC/TZID parser round trips. These are regression
and plumbing checks, not astronomical accuracy or physical completeness
evidence. `test/stream-control.calendar-test.ts` uses invented adapter
results to check pull backpressure, early return, total budgets, buffer
limits, cancellation, long-range iteration, conflict detection and refusal
diagnostics. It checks that an interrupted calendar never receives a
successful footer.

## Command-line export

Run the launcher from this folder with the local dependencies installed:

```sh
node scripts/calendar.mjs --help
node scripts/calendar.mjs --config examples/synthetic-void.json --utc
node scripts/calendar.mjs --config examples/synthetic-void.json --output generated/synthetic-void.ics
node scripts/calendar.mjs --config examples/synthetic-mixed.json --select ingress,natal-transit,synastry-exact
node scripts/calendar.mjs --config examples/synthetic-void.json --tzid America/New_York --dtstamp 2026-01-02T00:00:00.000Z
```

These invented configurations and the revision override are exercised in
`test/cli-config.calendar-test.ts` and `test/cli.calendar-test.ts`. The
eclipse radii in the mixed example are explicit spherical regression settings
from `test/fixtures/synthetic-stations-eclipses.ts`, not physical defaults.
To search lunar eclipses, set that selection's request `kind` to `lunar`.
Every event selection retains its adapter's definitions and limitations above.

The JSON object requires `schema: "zodiacs-calendar-feed/1"`, `dtstamp`,
and `schedule`. The schedule is the existing `streamSchedule` request:
canonical UTC `startUtc` and `endUtc`, explicit `maxEvaluations`,
`windowDays`, `maxBufferedEvents`, and `schedules`. Each selection has `kind`
and `request` as described under Streaming schedules. Chart-bearing requests
require explicit `synthetic: true`, durable chart IDs, and UTC birth inputs.
That declaration is a caller assertion; the CLI cannot verify whether a
birth was invented. There are no wall-clock timestamp defaults, implicit
aspect policies, physical radius defaults, or new event-search algorithms.

Optional `timeZone` contains `tzid`, `startUtc`, and `endUtc` for the timezone
definition's coverage. Include the requested range and every full interval
endpoint, including void periods extending past the requested range. The
serializer refuses an endpoint outside coverage during streaming. The void
example deliberately supplies a larger coverage window, exercised by the
CLI parser round trip. Timezone conversion retains the existing historical
offset and ambiguous-time UTC fallback behavior.

`--config -` reads JSON from stdin. Omitting `--output`, or supplying
`--output -`, writes only iCalendar bytes to stdout. Use the direct launcher
for pipes: `npm run cli -- ...` also prints npm's script banners unless npm
is run with `--silent`. Paths are relative to the invocation's working
directory. The launcher also works with absolute paths from another working
directory. It prepares and verifies the pinned read-only events source before
loading the adapters. A private TypeScript loader uses the installed compiler,
resolves relative source imports and pins the ephemeris import to the local
dependency. It emits no build files and does not rebuild the parent package.
Continue running `npm run typecheck`; runtime transpilation does not check types.

`--select` includes all configured selections of the named kinds and refuses
unsupported or absent kinds. `--start`, `--end`, and `--dtstamp` override the
corresponding canonical UTC instants. `--utc` removes timezone output;
`--tzid` changes the configured timezone ID while retaining its explicit
endpoint coverage. It requires a configured timezone object. Both flags
together are refused. Every configured selection is validated before work,
even when excluded by `--select`, and unknown fields are refused.

Configuration input is bounded to 1,048,576 UTF-8 bytes, enforced for files
and stdin by `test/cli.calendar-test.ts`. File output is bounded to
1,999,999 bytes; `test/cli-output.calendar-test.ts` checks the exact byte
boundary and an overflowing multibyte chunk. Stdout retains streaming over
large ranges. File output must be a new `.ics` file directly inside this
project's gitignored `generated/` directory. Existing files and symlinks
are refused. An export streams into a private temporary file, publishes it
exclusively only after success, and removes staging on handled failures.
Abrupt process termination can leave a hidden `.feed-` staging directory
inside `generated/`; remove that local output before retrying. It never
publishes a partially completed target file.

The CLI reports failures on stderr. Exit statuses are enforced by the CLI
tests: `0` for a complete nonempty feed, `1` for invalid input or an output
failure, `2` for a search refusal or an empty selection result, `130` for
cancellation, and `141` for a broken output pipe. SIGINT and SIGTERM both
request cooperative cancellation. Cancellation reaches synchronous search
calls at their existing checkpoints. Refusal diagnostics include the reason,
cumulative evaluations, emitted event count, window, and selection index when
available. Earlier stdout bytes cannot be recalled; a failed stream has no
successful calendar footer. Consumers must check the exit status. The CLI
preserves the library's refusal of empty calendars instead of presenting an
empty search as a complete feed.

`test/cli.calendar-test.ts` compares actual subprocess output with the
committed synthetic void golden across file/stdin input and regeneration,
parses TZID output with `ical.js`, exercises every adapter, and checks
filesystem isolation, exclusive publication, diagnostics and disconnects.
`test/cli-output.calendar-test.ts` uses invented wire chunks to exercise a
late failure and the file byte cap without asserting astronomical results.

## Local HTTP feeds

From this folder, start the loopback server with the committed synthetic map:

```sh
node scripts/serve.mjs --config examples/synthetic-server.json --port 8080
curl http://127.0.0.1:8080/feeds/synthetic-void.ics
```

The launcher accepts `--config`, `--port` and standalone `--help`. Its
startup message reports the actual listening port, including when the
operator requests an ephemeral port. The server example and launch command
are exercised by `test/http-launcher.calendar-test.ts`; the port is a local
example setting, not a deployed service. Stop with SIGINT or SIGTERM, which
closes open sockets and terminates their feed workers. The launcher verifies
the pinned source cache and uses the same TypeScript loader as the CLI.

The map associates a durable feed ID with a complete
`zodiacs-calendar-feed/1` configuration, the same schema the CLI accepts.
For example, `synthetic-void` selects the configuration from the void CLI
example. Library callers can use `createFeedServer({ id: configuration },
limits)` and explicitly call `listen()`. `feedPath(id)` returns
`/feeds/ID.ics`. IDs use ASCII letters, digits, underscore and hyphen,
enforced by `test/http-control.calendar-test.ts`. Configurations are copied
and every selection is validated before the server can accept work.
All chart declarations must remain explicitly synthetic. Configuration,
chart or date-range changes retain the named URL; existing event identity
rules determine which UIDs stay the same.

Clients cannot submit charts, date ranges, work budgets or filenames.
Query parameters, encoded path spellings, request bodies and unsupported
methods are refused. Known feed URLs accept GET and HEAD; unknown feed IDs
return 404. The endpoint has no authentication or mutable schedule API.
The launcher binds to loopback. Library callers choosing another binding
are explicitly serving their configured synthetic data there.

Each generation uses a disposable worker that calls `streamSchedule` and
`streamCalendar` directly. The parent pulls the next wire chunk only after
the current response write drains. It stores configuration and completion
metadata, without retaining complete feeds or writing cache files. Existing
per-window buffers, interval deduplication, receipt records and UTC/TZID
rules are unchanged. Worker termination interrupts synchronous JavaScript
searches on disconnect or deadline, including work between cooperative
checkpoints. A worker keeps its capacity slot until termination finishes.
Workers also isolate the ephemeris's module-wide time basis between requests.

The default limits below are enforced in
`test/http-control.calendar-test.ts`. Its invented transport chunks and
worker lifecycle check byte accounting, UTF-8 boundaries, backpressure,
capacity and deadline termination. HTTP integration checks use the declared
synthetic February fixture ranges in `test/http.calendar-test.ts`.

| Setting | Default |
| --- | ---: |
| Configuration UTF-8 bytes | 1,048,576 |
| Configured feeds | 32 |
| Concurrent generation workers | 2 |
| Deadline per generation, including startup and slow response writes | 30,000 ms |
| Adapter evaluations per feed request | 1,000,000 |
| Buffered events per search window | 1,000 |
| Schedule range | 3,660 UTC days |
| Selections per feed | 32 |
| Total response UTF-8 bytes, including footer | 8,000,000 |
| Worker V8 old-generation heap | 128 MiB |

`createFeedServer` accepts positive integer overrides for the work limits
in `DEFAULT_HTTP_LIMITS`; the configuration byte cap stays fixed. An
oversized configured range, budget, buffer or selection count rejects at
startup. The worker heap limit bounds V8's old-generation heap, not total
process memory, native allocations or response socket buffers. Deadline
timing depends on the host scheduler and worker termination. These are work
controls, not astronomical accuracy or latency guarantees.

Every configured revision has a weak ETag. A completed feed qualifies for
conditional GET/HEAD using `If-None-Match`, including weak comparison, lists
and wildcard matching under [RFC 9110 section 13.1.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2).
A match returns 304 with no body and no search. An unconfirmed feed must
first finish generation, even for conditional requests or HEAD; a failed
search never becomes a successful cache validation. HEAD discards generated
wire chunks and returns the same feed metadata after success. Completed
HEAD and conditional responses bypass occupied generation slots.

The validator includes a private process revision and the captured
configuration. It stays stable during that server instance and changes on
restart, so a client re-downloads after code, engine, dependency or runtime
changes. Feed URLs and event UIDs retain their existing stability across
restarts. Run the server from prepared, unchanged sources and dependencies.
DTSTAMP remains the configured calendar revision instant; it is not a
verified HTTP modification date, so no Last-Modified validator is inferred
and If-Modified-Since is ignored. Responses request private revalidation
and no transformation. There is no response-body cache or compression.

Early refusals and empty ranges return 422; worker failures return 500,
capacity exhaustion returns 503 with Retry-After, deadline expiry returns
504, and response byte overflow returns 413. The HTTP tests enforce these
status mappings. Error bodies use fixed diagnostics without birth details,
raw source errors or filesystem paths. After calendar bytes have been
sent, a failure closes the response without a calendar footer instead of
appending an error body. Clients must discard incomplete HTTP transfers.
The footer is sent only together with worker-confirmed completion and final
byte-limit validation.

`test/http.calendar-test.ts` serves the committed void golden through real
workers, checks UTC/TZID parser round trips, regeneration, conditionals,
refusals and disconnect interruption. `test/http-control.calendar-test.ts`
uses deterministic worker doubles to check late failures and transport
lifecycle behavior independently of event search. These remain regression
and plumbing checks, not independent astronomical accuracy evidence.

## Fixtures and scope

Fixtures under `test/fixtures/` use synthetic data. The serializer-only
fixtures use invented event instants and angular values. The natal transit
golden is generated by the parent engine and pinned events search for the
invented chart and range in `test/natal-transits.calendar-test.ts`; it is a
regression record, not independent accuracy evidence. The synastry golden uses the constructed progressed contact in
`test/fixtures/synthetic-synastry.ts` under the same regression-only scope.
The station/eclipse golden uses the invented windows and spherical model in
`test/fixtures/synthetic-stations-eclipses.ts` and the parent calculations
through the pinned event searches, also only as a regression record.
The void-of-course golden uses the invented range and explicit policy in
`test/fixtures/synthetic-void-of-course.ts` through those same parent and
pinned search APIs, with the same regression-only scope.
Golden text fixes the wire format, while parser checks verify dates, text and receipt preservation.
All future chart examples and fixtures must also be synthetic.

Code and documentation here use the repository's [MIT license](../LICENSE).
The engine and its data retain the terms and attributions in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE). `ical.js` is an
unmodified, development-only parser dependency under MPL-2.0; its source and
license remain in the installed dependency, not in calendar source files.
`@js-joda/core` and `@js-joda/timezone` are unmodified runtime dependencies
under BSD-3-Clause; retain their installed LICENSE files when redistributing
them. Their timezone data derives from the public-domain IANA database.
No dependency source or timezone database file is copied into this project's
authored files. Embedded timezone definitions contain only the clock changes
exercised by their tests.
