# Offline geocode workbench

This private project is being developed separately from `@zodiacs/engine`.
It will provide offline place lookup, IANA civil-time resolution, a CLI and
an optional HTTP service. [PLAN.md](PLAN.md) tracks implementation. The
current milestone provides the place-data contract, an attributed GeoNames
sample, an offline index builder, pure in-memory place lookup, a composed
API for atlas-first civil-time resolution, the `geocode` CLI and an optional
local HTTP service with bounded rate and resource limits.

## Development

Use Node.js as declared in this folder's `package.json` and Python 3 for the
source acquisition scripts and their offline subprocess tests, then run:

```sh
cd geocode
npm ci --ignore-scripts --cache .cache/npm
npm run check
```

The local TypeScript check emits no files. Vitest runs this project's tests;
dependency installation and test caches stay in this folder when configured
with `npm --cache .cache/npm`. No engine build or root dependency installation
is required. The repository's root configuration and packed files are outside
this project's write scope.

`npm run scope:check` also checks the candidate files for the repository's
size limit and documentation punctuation rule and uses an npm dry run to
check that `geocode/` stays out of the engine package. It does not run the
engine build or replace the full root `package:contents` gate, which needs
an existing root build.

## Current library API

`src/index.ts` exports `parsePlaceDataset`, `DatasetValidationError`,
`createPlaceLookup`, `createTimeResolver`, `createGeocoder` and the TypeScript
data, lookup and time-resolution types. Pass already
parsed JSON to the validator:

```ts
import { parsePlaceDataset } from "./src/index.js";

// jsonText comes from the caller's chosen local data source.
const dataset = parsePlaceDataset(JSON.parse(jsonText));
for (const place of dataset.places) {
  console.log(place.name, place.latitude, place.longitude, place.timeZone);
}
```

This is a TypeScript source entry intended for TypeScript tooling. There is
no generated JavaScript distribution yet. The validator performs no file,
network, clock or timezone-provider access. It returns a detached, deeply
frozen snapshot and throws `DatasetValidationError` for an invalid structure.
Errors name a field without repeating its submitted value. JSON parsing
errors remain the caller's responsibility. This boundary validates JSON-like
data; it does not sandbox JavaScript getters, proxies or other executable
objects.

The format is defined in [src/types.ts](src/types.ts). It retains source
identifiers and attribution, Unicode display names and aliases, country and
region labels, coordinates and source timezone identifiers. Duplicate names
are valid; duplicate identifiers are rejected. Region codes remain opaque
strings so leading zeroes survive; region fields describe the source's first
administrative division. `asciiName` retains the source's transliteration
field but does not require its contents to be ASCII.

Latitude and longitude are WGS84 decimal degrees, north and east positive,
with inclusive geographic boundaries. `elevationMeters` is the source's
elevation above sea level; `demElevationMeters` is the separate terrain-model
estimate. Negative heights and zero are retained. `null` means unknown, for
height, population, region fields or timezone assignment. It never means
sea level, an unpopulated place or UTC. The validator preserves coordinate
precision and does not authenticate geographic facts.

Source timezone identifiers receive a syntax check only. Actual IANA-provider
support belongs to the timezone adapter, so loading a dataset does not
depend on the host's zone-name support. Raw offset strings are not timezone
identifiers. Source-file digests are provenance claims here. The builder
checks source bytes; the local index loader checks shard bytes against a
manifest.

[tests/dataset.test.ts](tests/dataset.test.ts) exercises these rules with
invented places and malformed variants. These are contract and regression
checks, not measurements of real-world geographic or timezone accuracy.

## Offline place lookup

Pass a dataset to `createPlaceLookup` to validate and detach it, then reuse
the returned index for synchronous queries. Construction and lookup perform
no I/O and access no timezone provider. The index exposes its source
`provenance` and place `size`. Results, matches and place records are frozen.

```ts
import { createPlaceLookup } from "./src/index.js";

// jsonText contains a caller-loaded PlaceDataset. This is an invented query.
const index = createPlaceLookup(JSON.parse(jsonText));
const result = index.lookup("Springfield", { country: "US", region: "IL" });
for (const { place, match } of result.candidates) {
  console.log(place.id, place.name, place.latitude, place.longitude, match.kind);
}
console.log(result.status, result.total, result.truncated);
```

Queries start with a city name or alias. Accepted forms include `Paris`,
`Paris France`, `Paris Ile-de-France France`, `Paris, France` and
`Paris, Ile-de-France, France`. A comma after the city makes the next field
an exact region or country qualifier; with both qualifiers, the region
precedes the country. Without commas, every valid division into city and
qualifiers is considered, together with the complete phrase as a city.
Exact source names or aliases containing commas are also considered as whole
names, with their comma positions preserved. This can return both a literal
city name and a city with a region qualifier. Unknown qualifiers do not
silently disappear. Malformed comma fields throw `RangeError` unless the
whole input matches an actual comma-bearing source label.

Search uses source names, `asciiName` and aliases. Matching normalizes Unicode
compatibility forms and case, folds Latin accents, expands sharp s, unifies
Greek sigma forms, removes apostrophes and treats other punctuation and
spacing as separators. Non-Latin combining marks are retained. Display
labels are returned unchanged. Transliteration comes only from source
fields; there is no general transliterator or spelling correction.

City matching accepts a whole normalized name or a prefix from its start.
Country and region qualifiers must match a whole normalized name or source
code. The explicit `country` and `region` options apply the same exact
matching and intersect all query conditions. Region codes remain opaque:
leading zeroes matter, and a region name or code can occur in several
countries. Country names and codes come from the dataset, without extra
country aliases. Explicit filter labels may contain commas; a country code
or explicit filter avoids treating those commas as query delimiters.
A country or region alone is not a request to list all its
places; a matching city name is always required.

Each place appears once, with its best matching label in `match.text` and
the field (`name`, `asciiName` or `alias`) that supplied it. Whole-name
matches rank before prefixes, then primary names before transliterations
and aliases, then higher population before lower population with unknown
population last. Normalized display name and source ID break remaining ties
using JavaScript code-unit order, independent of input order and host locale.
Equivalent labels on the same place choose the first by code-unit order.
These rules order suggestions; they are not confidence estimates.

`status` is `no-match`, `unique` or `ambiguous` across all matching places,
including lower-ranked prefixes. `total` counts those matches before
truncation. `limit` defaults to 10 and accepts integers from 1 through 100;
`truncated` reports whether the returned list omits matches. A short list or
a higher population never removes ambiguity. `unique` means unique only
within the supplied dataset, whose sample or extract may omit other places.
The API does not select a place on the caller's behalf.

`getById(placeId)` retrieves a frozen record by its exact source ID, without
search normalization, filters or result limits. An absent ID returns
`undefined`. The ID must be nonempty trimmed text under the same text limit
as queries. This retrieves the same validated snapshot as a lookup result;
it does not load a record from another dataset or from the network.

Empty or punctuation-only text returns `no-match`. Query and filter strings
are limited to 512 UTF-16 code units and reject controls and lone surrogates.
Invalid options throw `RangeError` without repeating submitted values.
[tests/lookup.test.ts](tests/lookup.test.ts) enforces these limits and search
semantics with invented records. [tests/sample.test.ts](tests/sample.test.ts)
checks invented queries against the committed GeoNames sample, including
duplicate names and polar settlements. These tests establish behavior on
those inputs, not worldwide geographic completeness.

This factory accepts an in-memory dataset, not a manifest path. To search a
local build as a whole, use the separate Node-only `loadPlaceIndex` in
`src/load-index.ts`, then pass the returned dataset to the factory. The loader
checks every listed shard's bytes, digest, count and shared provenance before
combining its records, and rejects duplicate IDs. Searching an individual
shard only establishes uniqueness within that shard. Digests bind the files
to the supplied manifest; they do not authenticate the manifest or place facts.
The factory retains the supplied records and a normalized name index in
memory. It is not an on-disk search engine for an arbitrary full dump.

## Composed place and civil-time requests

`createGeocoder(dataset, atlasProvider)` validates and snapshots the dataset,
then composes the existing lookup and time resolver. It exposes `lookup`,
`getById`, `size` and `provenance`, plus an asynchronous `resolve` method.
Construction performs no I/O. Load the repository atlas explicitly through
the separate Node-only entry:

```ts
import { createGeocoder } from "./src/index.js";
import { loadAtlasTimeProvider } from "./src/atlas-time.js";

// jsonText contains the caller's local PlaceDataset. This query is invented.
const geocoder = createGeocoder(JSON.parse(jsonText), loadAtlasTimeProvider());
const result = await geocoder.resolve({
  query: "Brest, France",
  date: "1891-03-20",
  time: "12:00"
});
if (result.status === "time-result") {
  console.log(result.place, result.provenance);
  console.log(result.time.provider, result.time.status);
  if (result.time.provider === "atlas") {
    console.log(result.time.resolution.instants, result.time.provenance);
  }
}
```

A request supplies either `query` with optional `filters` (the lookup's
country, region and limit options), or `placeId`. Supplying both selectors
is invalid. A unique text match is selected only within this dataset.
Ambiguous text returns `ambiguous-place` with its lookup candidates and no
time result, even when the result limit shows only one candidate. After the
caller chooses a place, submit a separate request with its exact `placeId`.
Direct selection can address any record in the same dataset, including one
outside the suggestion list. It does not assert that an earlier query or
its filters match that ID.

All requests require a Gregorian civil `date`. An optional `time` is an
explicit local clock reading in the same format as the time adapter below.
A date-time string, UTC timestamp or `Date` object is not a civil date.
Omitting `time` produces `input.kind: "date-only"`; supplying it produces
`input.kind: "civil-time"`. Neither input is already a resolved instant.
Explicit null or undefined fields, malformed dates or times, unknown fields
and invalid filters reject with `RangeError`, including when no place matches.
The request accepts JSON-like objects; it does not sandbox executable getters
or proxies. The explicit atlas provider is trusted code.

| `status` | Meaning |
| --- | --- |
| `no-match` | Text matched no place in this dataset. |
| `ambiguous-place` | Text matched several places; the caller must select one. |
| `unknown-place` | The explicit ID is absent from this dataset. |
| `date-only` | A place is selected, but no clock time was supplied. |
| `time-result` | A place is selected and the time provider answered; inspect `time.status`. |

Every answer retains the civil `input` and dataset `provenance`. Text
requests also retain the complete lookup metadata, including total matches
and truncation; direct ID requests have `lookup: null`. A selected record
is in `place`, with `selection: "unique-match"` or `"explicit-id"`.
Unselected answers have null place, selection and time fields.

Date-only answers keep `time: null`. They call no time provider, choose no
midnight or noon, and assert no historical coverage or offset for the day.
The selected record's `place.timeZone` is only the source's assignment and
may be null or unsupported. Supplying an explicit clock time is necessary
to check atlas coverage and resolve offsets, gaps, folds or unavailable
zones. A date alone cannot establish that a whole civil day existed.

For a timed request, `time` preserves the native `PlaceTimeResult` described
below. `time-result` is not a success or certainty claim: `time.status` may
be `ambiguous`, `nonexistent`, `unavailable` or `no-such-clock`, and even an
atlas `ok` result may carry historical uncertainty. Read each atlas instant's
uncertainty and citations. Covered uncertainties and refusals never trigger
an IANA replacement. The source assignment on `place` remains distinct from
an atlas comparison zone on `time`. Missing assignments outside atlas
coverage remain unavailable with no offset or instant.

The factory, outer results, civil inputs, place records and dataset provenance
are frozen. Native time results are detached per-call snapshots; the engine's
UTC value stays a `Date` and can be mutated without changing later answers.
`JSON.stringify` naturally serializes that Date as an ISO string. Provider
exceptions propagate without a fallback answer. The library performs no chart
calculation and does not turn unresolved place or time choices into a chart
input.

[tests/geocoder.test.ts](tests/geocoder.test.ts) checks selection, validation,
date-only requests and snapshot isolation with invented data.
[tests/geocoder-atlas.test.ts](tests/geocoder-atlas.test.ts) builds the
attributed sample offline and compares composed answers with the existing
atlas resolver, including civil coverage edges, uncertain changes and
gap/fold outcomes. These are composition regressions, not independent
historical accuracy evidence. [evidence/M5.md](evidence/M5.md) records the
checks and their limits.

## Command-line lookup and time resolution

Install this folder's locked dependencies as above and build a local sample
index with `npm run index:build -- --sample --out generated/sample`. From
`geocode/`, these invented queries use that index:

```sh
node bin/geocode.mjs --help
node bin/geocode.mjs lookup "Springfield" --country US --index generated/sample
node bin/geocode.mjs tz "Brest, France" --index generated/sample --date 1891-03-20 --time 12:00
node bin/geocode.mjs tz --place-id geonames:3030300 --index generated/sample --date 1891-03-20
```

The private package's bin is named `geocode`; the source-checkout launcher
above and `npm --silent run geocode -- ...` invoke the same command. It uses
the scoped [tsx TypeScript loader](https://tsx.is/dev-api/ts-import) to import
the existing source modules, with its disk cache disabled. It requires this
repository checkout, including `atlas/` and `src/`. No engine build, generated
JavaScript distribution or global installation is needed. Importing the pure
library does not load this launcher or tsx.

`--index` is mandatory. It accepts a builder output directory, an explicit
manifest JSON path or a complete `PlaceDataset` JSON file. Relative paths
are relative to the caller's working directory. The command never fetches
URLs or silently substitutes a sample index. A standalone shard is accepted
as a standalone dataset, so use the complete build directory for ambiguity
checks across all its shards. The loader reads the selected dataset into
memory; it does not search shards on disk or authenticate geographic facts.
Keep an index static while using it. Stronger publication and resource
hardening remain in M10.

`lookup` takes a quoted city query, optional `--country` and `--region`
filters, and an optional `--limit`. Its result is the library lookup result
plus dataset `provenance`. `tz` takes the same selector and filters plus
`--date` and optional `--time`, or an explicit `--place-id` instead of a
query and filters. Choose an ID from the dataset when lookup is ambiguous.
Limiting suggestions never selects the first match. All search limits and
matching rules are those of the library above.

The date and time formats are Gregorian `YYYY-MM-DD` and local `HH:MM`.
Omitting `--time` returns the date-only library result with no offset or
UTC instant. Timed answers preserve atlas precedence, citations and uncertainty,
or the native IANA provider metadata and gap/fold policy. The serialized
engine Date is an ISO string. The command does not offer an offset override
or a flag that bypasses covered atlas rules.

Normal outcomes are a single JSON document on stdout; `--json` is accepted
and optional. Help is plain text. Errors are a JSON object with
`error.code` and `error.message` on stderr, with stdout empty. Diagnostics
do not repeat submitted query text, local paths or raw provider exceptions.
Unknown, repeated and inapplicable options are refused. Options accept
`--name value` and `--name=value`; use `--` before a query beginning with a
hyphen. Command syntax, date, time and limit checks precede index loading;
selector and filter validation uses the loaded index's lookup rules.

| Exit status | Meaning |
| --- | --- |
| 0 | Help, a unique lookup, a selected date-only result, or time status `ok` |
| 1 | Runtime startup, index loading or time-provider failure |
| 2 | Invalid command or input |
| 3 | No matching place or an unknown place ID |
| 4 | Ambiguous place or a repeated/skipped local time |
| 5 | Missing or unsupported timezone, or unavailable atlas clock |

An atlas `ok` answer may still carry historical uncertainty; exit success
does not establish certainty. Nonzero statuses for place or time outcomes
still print the complete result on stdout. Input and operational failures
use the error codes `invalid-input`, `index-error`, `resolution-error` or
`runtime-error` on stderr. No request log or result file is written by the
command.

[tests/cli.test.ts](tests/cli.test.ts) checks this command contract in
subprocesses with network entry points blocked, including the exit statuses,
ambiguous names, date-only inputs, missing zones, atlas precedence and IANA
gap/fold outcomes. [tests/load-index.test.ts](tests/load-index.test.ts) checks
local loading and manifest/shard consistency. These are operational and
integration regressions, not additional historical accuracy evidence.

## Optional local HTTP service

The Node-only `src/http-server.ts` entry wraps an explicitly supplied
`Geocoder`. It imports no place files and opens no listening socket until
the caller invokes `start()`. It is separate from the pure library entry.
For a source checkout, start the optional launcher from `geocode/` with a
local index built as below:

```sh
node bin/server.mjs --help
node bin/server.mjs --index generated/sample
```

The launcher defaults to IPv4 loopback and an ephemeral port. It writes a
single JSON startup record with `status: "listening"` and the actual
`address`, including its `port`. Optional `--host` and `--port` select the
binding; `--port 0` requests an ephemeral port. Options may appear once,
and an index is required. Startup errors are private JSON diagnostics on
stderr with a nonzero exit status. The launcher loads the chosen offline
index and the repository atlas before listening. It performs no downloads
and writes no request log or result file. It needs this checkout's `src/`
and `atlas/`, plus this folder's locked dependencies, like the CLI.

The service applies a token bucket per client IP across both routes. An
admitted request consumes a token, including requests later rejected for
malformed input, unknown routes or provider failures. Tokens refill from a
monotonic clock and cannot exceed the burst capacity. Failed requests receive
no token refund. There is no admission queue: excess active work or a full
client table returns a structured rejection before body parsing or lookup.
The limiter is local to this service instance, not shared across processes.
Clients sharing an address share a bucket.

| Launcher option | Programmatic option | Default and units |
| --- | --- | --- |
| `--burst` | `admission.capacity` | 60 requests |
| `--refill-per-second` | `admission.refillPerSecond` | 1 token per second |
| `--max-clients` | `admission.maxClients` | 4096 tracked addresses |
| `--max-concurrent` | `admission.maxConcurrent` | 32 active requests |
| `--max-connections` | `maxConnections` | 128 TCP connections |
| `--idle-client-ms` | `admission.idleTimeoutMs` | 60000 milliseconds |
| `--cleanup-interval-ms` | `admission.cleanupIntervalMs` | 10000 milliseconds |
| `--trusted-proxies` | `trustedProxies` | Empty list; forwarding headers ignored |

These defaults are enforced by [http-admission.test.ts](tests/http-admission.test.ts)
and [http-limits.test.ts](tests/http-limits.test.ts). Numeric options must be
positive and within the bounds validated in [http-admission.ts](src/http-admission.ts)
and [http-server.ts](src/http-server.ts); all except refill rate are integers.
Rate and resource limits always apply. Programmatic options use an
`admission` object alongside `host`, `port`, `maxConnections` and
`trustedProxies`. An optional trusted `admission.clock` function supplies
monotonic milliseconds for controlled tests; normal operation uses Node's
`performance.now()`. A backwards test clock is clamped rather than granting
extra refill. Configuration is copied at construction.

Active requests include body streaming, asynchronous provider work and
response completion. A disconnected caller does not release its work slot
until a running provider settles. Provider code cannot be cancelled by this
transport. TCP admission also bounds sockets held before a request arrives.
At the TCP connection bound, Node closes excess connections without an HTTP
JSON answer. The service is intended to run as a standalone Node process;
it does not configure cluster workers or transfer sockets to child processes.

Periodic cleanup begins when the service listens and uses an unreferenced
timer. An idle bucket is removed only after it is fully refilled and has no
active requests, even when the configured idle duration is shorter than its
refill duration. A full table rejects new identities instead of evicting an
exhausted client and granting it a fresh burst. A bounded cleanup scan can
also run when that table is full. Close clears the timer and address table.
Addresses live only in memory; responses and aggregate controller diagnostics
do not expose them. No request log is written.

Proxy trust is opt-in. `--trusted-proxies` accepts a comma-separated list of
exact IP literals; the library accepts that list as an array. It accepts no
hostname, wildcard, CIDR range or trust-all switch. IPv6 spellings are
canonicalized, and IPv4-mapped IPv6 shares the corresponding IPv4 identity.
Configure only controlled proxies that overwrite or append the actual peer
address to `X-Forwarded-For`. Direct access from an address listed as a proxy
permits that peer to assert a client identity, so do not list client networks.

From an untrusted socket peer, forwarding headers are ignored. From a
trusted peer, a single `X-Forwarded-For` field is parsed as a bounded list
of IP literals. The resolver walks from the nearest peer towards the caller
and stops at the first untrusted address; client-supplied values before that
hop cannot change its identity. Missing forwarding uses the socket address.
Malformed or duplicate forwarded fields from a trusted proxy are rejected
before admission, without echoing their contents. `Forwarded` and `X-Real-IP`
are ignored. [http-client.test.ts](tests/http-client.test.ts) enforces these
rules and the chain/configuration bounds, with synthetic address identities.

| Route | Input | Normal response |
| --- | --- | --- |
| `GET /lookup` | URL parameters `query`, optional `country`, `region`, `limit` | Library lookup result with dataset `provenance` |
| `POST /tz` | UTF-8 `application/json` body containing a `GeocodeRequest` | Complete composed `GeocodeResult` |

The lookup route rejects repeated or unknown parameters and request bodies.
The timezone route accepts no URL parameters. Its JSON body uses the same
`query` with optional `filters`, or explicit `placeId`, plus required `date`
and optional `time` as the library. Fields and filters are validated before
time providers run. Only uncompressed JSON is accepted. Dates are Gregorian
civil dates and times are local clock readings; omission of time keeps the
date-only result without an offset or UTC instant.

Every normal library outcome returns HTTP 200. Inspect its `status`, then
`time.status` for a timed answer. No match, ambiguous names, truncated
suggestions, skipped/repeated wall times and unavailable zones remain
complete library outcomes. A successful HTTP response does not resolve an
ambiguous place or establish historical certainty. Atlas answers preserve
citations, rule versions and uncertainty; IANA answers retain the existing
provider's policy and provenance. Native Dates serialize as ISO strings.

Application errors have `{ "error": { "code": "...", "message": "..." } }`:

| HTTP status | Error code | Meaning |
| --- | --- | --- |
| 400 | `invalid-input` | Malformed parameters, request fields, JSON or UTF-8 |
| 404 | `not-found` | Unknown route |
| 405 | `method-not-allowed` | Wrong method, with an `Allow` response header |
| 413 | `body-too-large` | JSON body exceeds the byte bound |
| 414 | `url-too-large` | Request target exceeds the byte bound |
| 415 | `unsupported-media-type` | Unsupported content type, charset or encoding |
| 417 | `unsupported-expectation` | Unsupported HTTP `Expect` value |
| 429 | `rate-limited` | Client token bucket is exhausted; includes `Retry-After` |
| 500 | `resolution-error` | Operational failure, including a time-provider exception |
| 503 | `overloaded` | Active work or tracked-client bound is full; includes `Retry-After` |

The Node parser returns structured `invalid-http` errors for malformed HTTP
or excessive headers when the connection is still writable. Incomplete or
aborted connections and transport timeouts may close without an application
JSON response. Diagnostics never repeat submitted queries, dates, paths or
raw provider exceptions. Provider exceptions never substitute a fallback
answer, including when the exception is a `RangeError`.

Rate-limit `Retry-After` is a positive integer number of seconds, rounded up
to the next available token. Overload uses a short retry hint rather than
promising when a provider or table entry will become available. Rejected
admissions close the connection without draining an arbitrary request body.
`Expect: 100-continue` requests pass admission before a continue response;
rate and overload rejections send no continue response.

The service bounds URL, header and JSON body bytes through `HTTP_LIMITS` in
[src/http-server.ts](src/http-server.ts). Bodies are bounded during streaming,
including chunked transfer. Rejected requests close the connection rather
than drain arbitrary input. Requests and idle sockets have transport
deadlines. JSON responses use `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff`; no CORS permission is added.

Programmatic startup and shutdown are explicit:

```ts
import { createGeocoder } from "./src/index.js";
import { loadAtlasTimeProvider } from "./src/atlas-time.js";
import { loadPlaceIndex } from "./src/load-index.js";
import { createGeocodeServer } from "./src/http-server.js";

const dataset = await loadPlaceIndex("generated/sample");
const geocoder = createGeocoder(dataset, loadAtlasTimeProvider());
const service = createGeocodeServer(geocoder);
const address = await service.start();
console.log(address);
// Once the caller is done serving requests:
await service.close();
```

`start()` may be called once. `close()` is idempotent, stops accepting
connections and drains active requests, then closes remaining connections
at the shutdown bound. It also handles closing before or during startup.
It cannot cancel arbitrary executable provider code already running.
The launcher handles `SIGINT` and `SIGTERM` through this shutdown path.

[tests/http-server.test.ts](tests/http-server.test.ts) enforces request
validation, byte boundaries, structured diagnostics, library outcomes and
listener lifecycle on ephemeral ports with invented records.
[tests/http-service.test.ts](tests/http-service.test.ts) checks sample-based
atlas/IANA transport fidelity and the launcher, including signals and help
with network entry points blocked. [evidence/M7.md](evidence/M7.md) records
the original transport scope. [tests/http-limits.test.ts](tests/http-limits.test.ts)
checks rate and overload responses, proxy routing, body streaming, connection
bounds, disconnected providers and timer lifecycle.
[evidence/M8.md](evidence/M8.md) records admission checks and limitations.
These are service regressions, not new geographic or
historical accuracy evidence.

## Build a local place index

The place source is the GeoNames downloadable gazetteer. Its current
dump format includes IANA zone identifiers and distinguishes elevation from
DEM estimates. [The official dump readme](https://download.geonames.org/export/dump/readme.txt)
describes those fields. Attribution and data terms are recorded in
[LICENSING.md](LICENSING.md) and [NOTICE](NOTICE). The
[sample receipt](data/sample-receipt.json) binds selected unchanged rows to
upstream archives, member digests and retrieval times. It includes ambiguous
names, polar places and cities with IDs matching the atlas.
[tests/sample.test.ts](tests/sample.test.ts) checks every copied field
against these input rows; it does not claim geographic accuracy.

From `geocode/`, rebuild the sample without network access:

```sh
python3 scripts/select-sample.py --check
npm run index:build -- --sample --out generated/sample
```

Every output directory must be new. Choose another name for a later build.
`--sample` verifies local input hashes against the committed receipt. The
generated manifest's hashes describe selected local inputs; the receipt
separately records the full upstream inputs and exact selection.

Download the worldwide `cities15000` extract and build a larger index:

```sh
python3 scripts/download-inputs.py --out downloads/world-snapshot
npm run index:build -- --downloaded downloads/world-snapshot --out generated/world
```

The downloader uses public GeoNames HTTPS files and Python's standard
library. It reads bounded archives in memory and stores uncompressed place
bytes as small numbered parts, alongside metadata and `sources.json`.
It never persists a full ZIP or a full extracted place file. The builder
verifies the concatenated parts against the archive-member digest and both
metadata inputs against their raw file digests. The builder itself makes no
network requests. Daily sources can change between downloads; keep the
matching source directory and receipt together. Digests identify bytes, not
the authenticity of geographic facts.

`cities15000` is a city extract, not all inhabited places. The sample adds
Waitangi and McMurdo Station from country dumps. The downloader also accepts
`--places-archive cities500.zip` or a country filename such as `NZ.zip`.
It refuses compressed or uncompressed sources beyond its in-memory bound.
For a larger input obtained separately, the builder accepts a local text
file or a directory of contiguous `part-000000.tsv`, `part-000001.tsv`, and
subsequent parts:

```sh
npm run index:build -- --places downloads/local-parts \
  --places-url https://download.geonames.org/export/dump/allCountries.zip \
  --countries downloads/countryInfo.txt --admin1 downloads/admin1CodesASCII.txt \
  --out generated/local
```

Optional `--places-sha256`, `--countries-sha256` and `--admin1-sha256` pin
these raw inputs. A parts digest covers their ordered concatenation, not a
ZIP. Preserve original bytes when splitting, including line endings. Keep
full inputs in ignored `downloads/`, split into small parts, and indexes in
ignored `generated/`. Only the attributed sample belongs in source control.

The builder selects feature class `P`, retains source IDs, coordinates,
population, elevation, DEM and timezone spelling, and joins country and
region labels. Missing region labels remain null with their code retained;
missing country labels are errors. Elevation and DEM stay separate. Numeric
source sentinels remain numeric, without an invented replacement height.
Blank optional fields become null. Zone labels do not determine offsets at
build time.

Real source data contains edge whitespace and a control-bearing alias.
The builder trims label edges, omits empty or control-bearing aliases,
deduplicates aliases and sorts by JavaScript code-unit order. Manifest
`transformations` counts each trimmed label occurrence, omitted alias token
and duplicate alias token. Retained labels and aliases must pass the dataset
contract. Numeric fields require decimal syntax and safe integers where
appropriate. Invalid retained rows fail with a field or line description
without echoing submitted content. Non-place rows receive structural, ID and
feature checks before exclusion. Unused country metadata is not interpreted.

Each shard is a complete `PlaceDataset`. `manifest.json` lists row counts,
byte sizes and SHA-256 hashes, and is written last. Rows retain source order.
Identical input bytes, source filenames, source URLs and shard settings yield
identical output bytes, independent of parent directory paths and clock time.
Source filenames are retained in provenance, so renaming an input changes
the output. Inputs are hashed again during
parsing to detect changes during a build. Memory holds label maps, seen IDs
and a shard, rather than the full place dump. Failed builds remove only their
newly created output directory; existing directories are refused.

`src/build-index.ts` exports Node-only `buildGeoNamesIndex` separately from
the pure library entry. Its command compiles into ignored `.cache/tools/`.
Byte limits and validation are exercised by
[tests/build-index.test.ts](tests/build-index.test.ts). The local loader
checks manifest/shard consistency; broader hostile-input hardening and
stronger publication guarantees remain later milestones. Consuming an
incomplete directory is not supported.

To check or deliberately refresh the committed sample:

```sh
python3 scripts/select-sample.py --check-upstream
python3 scripts/select-sample.py --check-upstream --source-dir downloads/pinned-inputs
python3 scripts/select-sample.py --refresh
```

The first command requires today's upstream bytes to match the pinned hashes
and fails if they have changed. The second reads saved original archives and
text files. `--refresh` deliberately replaces the sample and receipt with a
new daily snapshot; review and test that change before committing it.
Selection preserves complete row bytes and sorts rows by source identifier.

## Civil-time adapters

The owner's scope note requires building on [the atlas](../atlas/README.md)
and [the existing geo API](../api/geo.api.md). `createTimeResolver` takes an
explicit atlas provider. Load the repository atlas through the separate
Node-only `loadAtlasTimeProvider` entry, then reuse the resolver:

```ts
import { createTimeResolver } from "./src/index.js";
import { loadAtlasTimeProvider } from "./src/atlas-time.js";

const timeResolver = createTimeResolver(loadAtlasTimeProvider());
// selectedPlace is a validated PlaceRecord explicitly chosen by the caller.
// dataset is its validated PlaceDataset. This civil-time request is invented.
const result = await timeResolver.resolve({
  place: selectedPlace,
  dataset: dataset.provenance.dataset,
  date: "1880-06-01",
  time: "12:00"
});
console.log(result.provider, result.status, result.timeZone);
```

The factory performs no file or network I/O. Loading the default atlas is an
explicit synchronous filesystem operation; importing either entry reads no
atlas data. The default provider delegates to `atlas/tools/lib.mjs` through
a small locally typed bridge. The engine adapter imports `src/geo.ts`
through a relative source path. This remains a source-checkout API for
TypeScript tooling; the existing builder compilation emits only its own
tools and lookup modules into the ignored cache. No atlas or engine source
is copied into this project, and no chart is computed.

Requests require an explicit Gregorian `YYYY-MM-DD` and `HH:MM`. Invalid
calendar dates are rejected using the engine's public calendar function.
There is no default noon or midnight, seconds input, calendar inference or
date-only resolution in this adapter. The place and dataset kind must come
from the caller's validated dataset; their claims are not authenticated.

For GeoNames records, the provider matches only `geonames:<id>` against the
atlas's source IDs. It does not infer a jurisdiction from names, coordinates,
country or proximity. The index retains only the first administrative
division, so it does not supply the department required for the atlas's
optional unlisted-place interface. Covered results use the atlas's own
place and coordinates. The manifest's civil coverage boundaries are read
from the atlas, and native resolution decides the result inside them.
These boundaries are local clock readings, not UTC boundaries.

Atlas results have `provider: "atlas"` and keep their native `resolution`,
including all instants of a fold, the chosen interpretation of a skipped
reading, fractional offsets in seconds east of Greenwich, rule IDs and
versions, citation IDs and uncertainty reasons. `provenance` carries the
manifest, the atlas place and the complete cited entries. Results are
detached copies, so changing an answer cannot change later answers. Covered
uncertainty, gaps, folds and clock refusals remain atlas answers. An atlas
failure propagates instead of substituting tzdb.

An atlas result's `timeZone` has `timeZoneRole: "comparison"`: it is the
atlas's tzdb comparison label, not a historical zone-boundary claim. The
atlas can describe a historical clock that the comparison zone does not.
Its offsets remain authoritative for that covered request even when the
modern place record has no zone or a different assignment.

Outside coverage, for unmatched IDs, or for synthetic dataset records,
results have `provider: "iana"`, `timeZoneRole: "source-assignment"` and
`atlasFallback` explaining that routing. They use the place's supplied zone
without replacing it with the atlas comparison zone. The adapter awaits
`prepareLocalTime` and calls `resolveLocalToUtc`, without its longitude
option, so birthplace mean time never replaces IANA offsets. Missing zones
return `status: "unavailable"` with `reason: "missing-timezone"`; names
unsupported by the host return `reason: "unsupported-timezone"`. Neither
returns an offset. Other provider errors propagate, including shard-loading
failures. The low-level `resolveIanaTime` helper in `src/iana-time.ts` accepts
an explicit zone without atlas routing; ordinary place requests should use
`createTimeResolver` to keep atlas precedence.

Available IANA results retain the native engine `resolution`. `status` is
`ok`, `ambiguous` for a fold, or `nonexistent` for a gap. The engine returns
one chosen instant with its `localResolution.policy`: earlier for a fold,
shift forward for a gap. The adapter does not manufacture other candidates.
`resolution.zone` records the actual tzdb/Intl source, version and data
form; `jump`, `transition`, flags and calendar metadata are preserved.
The engine uses its pinned histories where available for older readings
and host Intl elsewhere, including older spans lacking a pinned offset.
Host zone support is required even when a pinned history supplies the offset.
See the engine's [time guide](../docs/time.md) for its provider limits.

[tests/atlas-time.test.ts](tests/atlas-time.test.ts) checks routing and
preservation against the existing atlas resolver, including local coverage
edges, uncertain changes and fractional-offset folds. Those are integration
regressions, not independent evidence of historical accuracy.
[tests/iana-time.test.ts](tests/iana-time.test.ts) reads the selected existing
IANA conformance vectors directly, including half-hour and quarter-hour
offsets and historical DST. The selected IDs, source and test results are
recorded in [evidence/M4.md](evidence/M4.md). No broader accuracy claim is made.

The composed API above requires explicit selection among ambiguous places.
A civil date alone does not imply a birth time or a single offset for the
whole day.

A modern place-to-zone assignment is not a historical boundary atlas.
IANA describes the limits of older histories and the distinction between
zones and geographic boundaries in its
[theory documentation](https://www.iana.org/time-zones/theory). Missing place
coverage, especially for small polar settlements or stations, and missing
zone assignments must stay explicit. The project will not infer a zone from
longitude, pick the nearest city as a substitute, or invent an offset.

No chart calculations, paid geocoding APIs, API keys or personal birth records
are needed. All query examples and tests must remain synthetic.
