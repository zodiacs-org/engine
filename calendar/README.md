# Calendar workbench

This private TypeScript project exports supplied astrology event records as
iCalendar text. It imports the engine's identity from the parent source tree
without building or changing the parent npm package. The implemented scope is
M1 in [PLAN.md](PLAN.md): UTC serialization and its validation. Event searches,
generated UIDs, timezones, streaming, the CLI and the HTTP feed endpoint remain
planned milestones.

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
order; callers supply persistent, distinct UIDs until M2 adds their factory.

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
