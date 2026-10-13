# Export and subscribe to a synthetic schedule

Install this private workbench's dependencies and prepare the pinned events
sources from the available git objects, using the runtime in
[package.json](../package.json):

```sh
cd calendar
npm ci --ignore-scripts
npm run prepare:events
node scripts/calendar.mjs --help
```

The workbench runs directly from TypeScript sources. These commands create
neither parent build output nor an npm archive. It needs the parent checkout
and the events revision in [events-source.json](../events-source.json);
copying this folder alone does not provide its calculation dependencies.

[synthetic-complete.json](../examples/synthetic-complete.json) selects
ingresses, personal natal transit exacts, secondary-progressed synastry
exacts, Mercury stations, solar eclipses and void-of-course Moon intervals.
It uses invented charts, an explicit aspect policy and spherical regression
radii. Each selected event kind occurs in its February 2026 range, enforced
by [mixed-feed.calendar-test.ts](../test/mixed-feed.calendar-test.ts).
The test fixes wire bytes against the committed
[UTC golden](../test/fixtures/synthetic-complete.ics), varies search window
sizes and selection order, and independently parses UTC and New York TZID
output, preserving every DESCRIPTION receipt and structured X-property.
This verifies export behavior against the parent engine, not astronomical
accuracy. The generator is [mixed-fixture.mjs](../scripts/mixed-fixture.mjs).

From `calendar/`, export to stdout or a new local file:

```sh
node scripts/calendar.mjs --config examples/synthetic-complete.json --utc
node scripts/calendar.mjs --config examples/synthetic-complete.json --output generated/synthetic-complete.ics
node scripts/calendar.mjs --config examples/synthetic-complete.json --select ingress,station --utc
```

The configured display timezone is New York. `--utc` selects UTC dates;
`--tzid` changes the display zone while retaining configured coverage.
Timezone display does not change event UIDs or the exact UTC calculation
receipt. Include every full void interval endpoint in timezone coverage,
even when an endpoint falls outside the selected display range. Generated
files live in the ignored `generated/` folder; file output is exclusive and
refuses an existing filename. Stdout supports streaming without a saved file.

To serve this configuration, place it under a durable ID in an HTTP feed map,
as [synthetic-server.json](../examples/synthetic-server.json) does for its
void schedule. The existing runnable server example is:

```sh
node scripts/serve.mjs --config examples/synthetic-server.json --port 8080
curl http://127.0.0.1:8080/feeds/synthetic-void.ics
```

The loopback URL and launcher example are tested in
[http-launcher.calendar-test.ts](../test/http-launcher.calendar-test.ts).
Stop the process with SIGINT or SIGTERM. Feed IDs keep their URLs when a
configured range changes. Event UIDs follow semantic chart and search
settings; revision timestamps and timezone presentation do not change them.
The server has configured feeds and conditional requests, with generation
workers and bounded work. It has no chart submission or authentication API.
See [the HTTP reference](../README.md#local-http-feeds) for its controls.

## Interpretation and limits

Every DESCRIPTION carries JSON describing the UTC instant, ordered bodies,
event type or aspect, angular residual orb and engine/ephemeris identity.
Source records preserve upstream search settings and the engine's calculation
receipts. Stations and eclipses have a null angular orb, with speed or
geometry residuals in their source records. These are calculation records,
not authenticated provenance or independent physical error bounds.

Calendars display whole seconds. The receipt and UTC X-properties preserve
the original millisecond instants; a displayed second is not an event timing
accuracy claim. TZID output embeds bounded VTIMEZONE definitions and falls
back to UTC for ambiguous or unsupported civil offsets.

Synthetic charts require `synthetic: true`. This is a caller assertion;
all committed chart examples and tests use invented birth inputs. Static
natal synastry is undated and produces no VEVENT. Dated synastry requires
the explicit convention that progresses the first chart toward the second
chart's fixed natal longitude. It is not an ordinary future sky transit.

Searches delegate to the pinned events sources and engine. A completed
sampled search does not prove that all physical events were found. Paired
roots, tangencies and time-basis discontinuities retain the upstream
limitations. Eclipse classification follows the explicit spherical model;
there are no visibility maps, local contact times or solar total/annular
classifications. Void intervals depend on the selected bodies and angles
and retain full endpoints, without clipping to the display range.

A global budget, per-window buffer cap and cooperative cancellation control
library streaming. A synchronous search can still delay cancellation; the
HTTP workers can be terminated. A stream that fails after output begins
cannot recall earlier bytes and omits its successful calendar footer.
Check CLI exit status and HTTP transfer completion before using a feed.
An empty completed search is reported separately and is not serialized as a
successful empty calendar. See [the adapter reference](../README.md) for
event definitions, exact boundary ownership and refusal behavior.
