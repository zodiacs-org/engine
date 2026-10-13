# Calendar workbench

This private TypeScript project exports astrology event records as iCalendar
text and searches for tropical sign ingresses through the existing events
package. It imports the parent engine sources without building or changing the
parent npm package. The implemented scope is M1 through M4 in [PLAN.md](PLAN.md):
UTC and timezone serialization, validation, stable event identities and ingress
schedules. Other schedule searches, streaming, the CLI and the HTTP feed
endpoint remain planned milestones.

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
`searchIngressSchedule` connects upstream search results to this model; no
event search is implemented here.

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
a running search. This milestone collects the result in memory. Streaming
and worker-based HTTP execution remain later milestones.

`test/ingresses-boundary.calendar-test.ts` uses analytic synthetic motion
through the actual events scanner to check midnight crossing ownership,
touch suppression, partition stability, validation and work controls.
`test/ingresses.calendar-test.ts` compares delegation and receipts with the
parent APIs on its declared synthetic windows and round-trips UTC and TZID
feeds through `ical.js`. These are integration and regression checks, not
independent astronomical accuracy evidence.

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
requires a calendar component. Later CLI and HTTP milestones must explicitly
handle an empty successful schedule as well as an upstream search refusal.

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

## Fixtures and scope

Fixtures under `test/fixtures/` are small synthetic formatting examples. Their
event instants and angular values were invented for serializer tests; they
are not astronomical predictions or accuracy evidence. Golden text fixes the
wire format, while parser checks verify dates, text and receipt preservation.
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
authored files; the golden fixtures contain only the clock changes they test.
