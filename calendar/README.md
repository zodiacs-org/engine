# Calendar workbench

This private TypeScript project exports supplied astrology event records as
iCalendar text. It imports the engine's identity from the parent source tree
without building or changing the parent npm package. The implemented scope is
M1 and M2 in [PLAN.md](PLAN.md): UTC serialization, validation and stable event
identities. Event search adapters, timezones, streaming, the CLI and the HTTP
feed endpoint remain planned milestones.

Use Node satisfying `engines` in [package.json](package.json). From this folder:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
```

Dependencies are installed only in `calendar/node_modules`. Tests have the
suffix `.calendar-test.ts`, selected by the local Vitest configuration, so the
parent repository's default test scan does not need calendar dependencies.
Keep generated feeds and other bulk output in `generated/` or `.cache/`, both
gitignored. No calendar file belongs in the parent engine's packed contents.

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
M4 will connect real upstream search results to this model. The existing
events implementation is available read-only on `origin/infra/events`; no
event search is implemented here.

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
