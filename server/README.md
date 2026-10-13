# Engine HTTP server

This private package is a self-hosted HTTP adapter for the engine in this
checkout. It serves natal charts, transit snapshots, synastry, solar/lunar
returns, moon phase and houses with engine receipts, health and readiness,
API-key authentication, per-key rate limits, bounded JSON validation, JSON
logging, generated OpenAPI and process lifecycle. Docker deployment is tracked
in [PLAN.md](PLAN.md).

## Run from a checkout

Use Node.js matching `engines.node` in [package.json](package.json), on the
Node 22 release line. From the repository root:

```sh
cd server
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Dependencies and the lockfile belong to this directory. The server imports
the engine's public source entries by relative path. Its build bundles those
sources into ignored `server/build/` and resolves external dependencies from
`server/node_modules/`. No root dependency installation or engine build is
needed. The ephemeris dependency remains pinned to the engine's exact version.

The listener defaults to `127.0.0.1:3000`. `HOST` and `PORT` override that
address; `PORT=0` requests an available port, reported in the `server_started`
JSON log. `LOG_LEVEL` defaults to `info` and accepts the levels listed in
`src/config.ts`. Invalid configuration fails startup without logging supplied
values. These defaults and validation rules are checked in
`test/config.vitest.ts` and `test/process.vitest.ts`.

```sh
curl --fail http://127.0.0.1:3000/healthz
curl --fail http://127.0.0.1:3000/readyz
```

## Current HTTP behavior

`GET /healthz` reports that the HTTP handler is running. `GET /readyz` reports
readiness after startup has computed a synthetic natal chart and created its
receipt using the actual engine, including in the calculation worker. Neither
route needs credentials. Readiness becomes unavailable during worker recovery
and shutdown. A busy worker remains ready; its bounded queue decides whether
a calculation can be admitted. Shutdown marks the server unready and closes
its listener on SIGINT or SIGTERM.

Successful calculation and probe responses have `data`, `engine`, `receipts`
and `requestId`. `GET /openapi.json` returns the specification itself.
Errors replace `data` with an `error` containing a stable `code` and a generic
`message`. Authenticated requests to unknown routes return `not_found`.
Unauthenticated requests outside the public probes and discovery route return
`unauthorized`.
Malformed HTTP or URLs can be rejected before authentication.
The engine identity comes from its own exported version and ephemeris
constants. Probe and error responses produce no calculation receipt, so their
`receipts` list is empty. The startup
probe's chart is not returned as a receipt for a health request.

Responses have a server-generated `x-request-id`, matching the JSON body when
it has an envelope, and disable caching. The server does not trust a caller's
request ID. Request logs record the method, matched route template, HTTP status
and elapsed milliseconds;
unmatched paths are recorded as `unmatched`. They omit raw URLs, query strings,
headers, bodies and raw errors. Route, error and logging behavior is covered
by `test/app.vitest.ts`.

## API discovery

```sh
curl --fail http://127.0.0.1:3000/openapi.json
```

`GET /openapi.json` is public and unmetered, including with a supplied API
key or an exhausted bucket. It returns an
[OpenAPI 3.1.1 document](https://spec.openapis.org/oas/v3.1.1.html)
with JSON Schema 2020-12 contracts. It has no outer response envelope;
the request ID remains in the response header. Query parameters and bodies
are refused. Other methods and similar paths remain protected.

The document is generated once per app from the registered routes and their
actual request schemas. Each route supplies its operation description,
synthetic examples, result schema and receipt scopes. Adding an application
route without documentation fails app construction. There is no generated
specification file to keep in sync or commit. Relative server URLs refer to
the serving origin; Host and forwarded headers never enter the document.

Clients can discover Bearer authentication, input types and units, required
fields, defaults, error envelopes, response headers and engine receipt
shapes. `x-json-limits` states the parser bounds, `x-rate-limit` states this
process's configured bucket capacity and refill rate, `x-resource-limits`
states socket, worker and shutdown limits, and `x-time-coverage`
contains the engine's exported spans with their meaning. The per-operation
`x-query-schema` preserves the strict empty query contract, and
`x-receipt-scopes` identifies each receipt's JSON pointer and kind. These
extensions are descriptive; generic OpenAPI clients may ignore them.

Calendar validity, time-basis coverage, flag consistency and other engine
rules still run after schema validation. A schema-valid request may therefore
return `invalid_request`. Response schemas describe transport shape; the
engine's receipt codec supplies full semantic validation of natal envelopes.
Read the scope descriptions before treating a chart receipt as coverage of
derived transit, synastry, return or moon-phase fields. Response schemas are
documentation only and never filter or round engine output.

[test/openapi.vitest.ts](test/openapi.vitest.ts) validates the document with
Swagger Parser and its schemas with AJV, checks request-schema agreement,
executes every synthetic example, and validates response shapes, receipt
scopes, configured limits, errors and privacy. The tests cover nullable and
polar charts, independent clocks and pinned delta T too.
[test/process.vitest.ts](test/process.vitest.ts) checks discovery and a
documented calculation through the built listener. These are HTTP contract
checks, not independent astronomical accuracy evidence.

## API keys

Set `API_KEYS` to a JSON array of key strings, or set `API_KEYS_FILE` to a
file containing that same JSON. Set only one source. Relative file paths are
resolved from the server process's working directory. Keys are loaded once,
before the listener starts; restart the process after changing them. A
malformed, empty, duplicate or oversized configuration, an unreadable file,
or conflicting sources makes startup fail with a generic JSON log that
contains no supplied value or path. With neither source configured, probes
and discovery remain available and every protected request is denied.

Use random keys generated by a cryptographic generator. The accepted format
is a case-sensitive string of 32 to 256 ASCII letters, digits, underscores
or hyphens. A configuration accepts at most 128 unique keys and at most
65,536 UTF-8 bytes. These limits and their boundaries are enforced in
`test/api-keys.vitest.ts`. A key file must resolve to a regular file; symlinks
to regular files are accepted for mounted secrets. Restrict its permissions
to the server account. The server retains digests for comparison and opaque
process-local key identities; it never returns a key or a digest to clients.

For example, from `server/`, create a fresh ignored credential file without
printing its key or overwriting an existing file:

```sh
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('secrets', { recursive: true, mode: 0o700 });
writeFileSync('secrets/api-keys.json', JSON.stringify([
  randomBytes(32).toString('base64url')
]) + '\n', { flag: 'wx', mode: 0o600 });
NODE
API_KEYS_FILE=secrets/api-keys.json npm start
```

Supply a key as `Authorization: Bearer <key>` over HTTPS at your reverse
proxy, or over loopback for local use. The scheme is case-insensitive; the
key is not. Send one Authorization header with a single space after the
scheme. Duplicate headers, unsupported schemes, invalid keys and credentials
in query parameters, bodies, cookies or alternate headers do not authenticate.
The server does not load `.env` files automatically.

All routes default to authentication, including future calculation routes
and the not-found handler. Only exact `GET /healthz`, `GET /readyz` and
`GET /openapi.json` are public. Authentication runs before body parsing. Rejected
requests receive HTTP 401 with the usual error envelope and a Bearer
`WWW-Authenticate` challenge. Infrastructure errors carry empty receipts.
Route protection and absence of credentials in logs and responses are
checked through injection in `test/auth.vitest.ts` and through a real
listener in `test/process.vitest.ts`, including duplicate headers and trace
logging. Natal, transit, synastry, solar/lunar return, moon-phase and houses
routes are available.

## Natal charts

`POST /v1/natal` accepts the engine's birth input as a JSON object. Send an
Authorization Bearer header and `Content-Type: application/json`. For
example, this invented input is exercised by `test/process.vitest.ts`:

```json
{
  "utc": "2004-02-29T08:30:00+02:00",
  "latitude": 48.25,
  "longitude": -3.75,
  "houseSystem": "placidus"
}
```

Only `utc` is required. It accepts a resolved ISO date-time with an explicit
offset, an ISO calendar date, or a finite epoch-millisecond number. Strings
are limited to 40 characters. The engine validates actual calendar dates,
offsets and ephemeris coverage; local date-times without an offset, calendar
rollovers and instants outside its supported ephemeris span are refused.
Date-only strings denote midnight on the selected scale. Numeric inputs
follow the engine's JavaScript Date conversion, including truncation to
whole milliseconds. Resolve local times before calling the server.

Latitude is degrees north in [-90, 90] and longitude is degrees east in
[-180, 180]; supply both or neither. Timed charts at exactly either
geographic pole are refused because the natal receipt cannot represent
that geometry. Coordinates at the poles remain accepted with
`timeKnown: false`. `houseSystem` accepts the engine's `HOUSE_SYSTEMS` values
and defaults to `whole`. Requested Placidus or Koch houses may fall back
to whole sign at polar latitudes; the chart flags and receipt retain that
fact and distinguish the requested system from the computed one.

`timeKnown` defaults to true. False suppresses angles and houses, retains
the supplied reference instant and adds the engine's `no-time` flag. It
does not infer noon. Missing coordinates also omit angles and houses, with
the receipt identifying the reason. `timeScale` accepts `utc`, `ut1` or
`tt` and defaults to `utc`; the `utc` field keeps its name on every scale.
Optional `deltaT` pins TT minus UT1 in seconds, within [-1e10, 1e10].

Optional `flags` accepts at most 64 entries chosen from `dst-gap`,
`dst-fold`, `lmt`, `no-time`, `polar-fallback` and
`outside-reference-span`. The engine collapses duplicates and requires
derived flag echoes to agree with the calculation. `dst-gap`, `dst-fold`
and `lmt` are caller assertions; the server does not resolve or verify
their local-time history. Contradictory flags are refused. Unknown body
fields, query parameters, null settings and coerced values such as a string
latitude are refused too. [src/natal.ts](src/natal.ts) holds the request
schema; `test/natal.vitest.ts` enforces these limits and behaviors.

The response's `data` is the complete `natalChart` result: canonical input,
bodies, angles, houses, aspects, flags, time basis, delta T and engine
version. Dates serialize as ISO strings and numerical values are not
rounded. The response's `receipts` list contains an object with
`scope: "/data"` and `envelope`, the complete, unchanged output of the
engine's `createNatalEnvelope`. Scope is a server label pointing to the
chart in this response. It is not part of the engine receipt. The envelope
can be passed to `parseNatalEnvelope` and `natalReplayInput` from the
engine's receipt entry. The original ISO input spelling is captured in
`receipt.sourceInstant`; numeric inputs have no source spelling.

Receipts describe conventions and coverage; they are not signed
attestations. The engine may compute a chart outside its independently
checked reference span and flag it `outside-reference-span`. Preserve and
read those flags and the receipt's coverage statements. Full-output and
receipt comparisons in `test/natal.vitest.ts` verify transport and replay
against direct calls to this same engine, not astronomical accuracy.

If the engine's receipt codec refuses a computed chart, the server returns
HTTP 422 with `receipt_unavailable`, empty receipts and no partial chart.
This can occur for extreme near-pole house geometry; a synthetic case is
covered in `test/natal.vitest.ts`. Unexpected failures return the sanitized
HTTP 500 envelope. Both successful and failed calculations spend a rate-limit
token. Birth inputs, chart output and receipts are omitted from logs.

## Transit snapshots

`POST /v1/transits` accepts `natal`, a birth input with the same fields and
validation as `/v1/natal`, and `at`, the resolved instant for the moving sky.
Both are required. For example, this synthetic request shape is exercised
by `test/comparisons.vitest.ts`:

```json
{
  "natal": {
    "utc": "2001-02-03T04:05:06.789Z",
    "latitude": 23.45,
    "longitude": -67.89
  },
  "at": "2024-06-07T08:09:10+02:00"
}
```

`at` accepts the same string or epoch-millisecond forms and limits as a
natal `utc`. The engine reads it as UTC on its default time basis; date-only
strings mean midnight UTC. The natal chart's `timeScale`, pinned `deltaT`,
coordinates and house settings do not carry over to the moving sky. The
route requires an explicit instant and calculates a snapshot, without a
date range or event search. Unknown fields and query parameters are refused.

`data` retains the complete `transits` result: `natal`, `at`, `positions`
and `aspects`. It adds `sky`, a separate location-free engine natal chart
at the transit instant, whose `bodies` equal `positions`. This supporting
chart supplies the sky's flags, time basis and delta T. It has no houses
or angles because no location was supplied; its time is known. Dates
serialize as ISO strings and numbers keep their full engine precision.
In the transit aspects, `a` is the moving body and `b` is the natal body.

The receipts have scopes `/data/natal` and `/data/sky`. Each envelope is
the unchanged result of the engine's natal receipt creator, with the
corresponding original instant spelling when it was a string. They cover
the named contributing charts only. The cross-chart `data.aspects` are
computed directly by `transits` and are outside these natal receipts.
No receipt certifies the transit analysis as a whole. Read `data.sky.flags`
as well as `data.natal.flags` for reference coverage.

## Synastry

`POST /v1/synastry` accepts `a` and `b`, both birth inputs with the same
fields and validation as `/v1/natal`. For example:

```json
{
  "a": { "utc": "2001-02-03T04:05:06.789Z", "timeKnown": false },
  "b": { "utc": "2003-04-05T06:07:08-03:00" }
}
```

Each chart keeps its own time scale, delta T, coordinates, house settings
and flags. The response's `data` is the complete engine `synastry` result:
`a`, `b`, `aspects`, `top`, `counts`, `easeful`, `charged`, `elements` and
`modalities`. Chart and aspect ordering follows the submitted `a` and `b`;
the server does not reorder the pair or customize the engine's aspect
policy. Unknown fields, precomputed charts, imported receipts and query
parameters are refused.

Receipts scoped to `/data/a` and `/data/b` cover the corresponding natal
charts only. The inter-chart aspects, top-aspect selection, counts and
balance summaries are direct engine output outside those natal receipts.
The scope labels are server metadata, not engine-authored conventions.

Both routes use the same authentication, per-key bucket, JSON limits and
error envelopes as the natal route. Invalid input in either chart fails
the whole request. A receipt refusal returns `receipt_unavailable` with
no partial analysis or receipts. Birth inputs and calculation output stay
out of logs. `test/comparisons.vitest.ts` checks direct-engine transport
parity, receipt parsing and replay, independent clocks, flags, validation,
authentication, rate limits and error privacy. `test/process.vitest.ts`
checks the routes through the built listener. These checks establish
adapter behavior, not independent astronomical accuracy.

## Solar and lunar returns

`POST /v1/returns/solar` accepts a required `natal` birth input and `at`
instant. Optional `selection` is `nearest` (the default) or `most-recent`.
`POST /v1/returns/lunar` accepts required `natal` and `after` fields and
finds the first lunar return strictly after that instant. Both routes call
the public engine's return functions directly. For example, these synthetic
requests are exercised through the built listener in `test/process.vitest.ts`:

```json
{
  "natal": {
    "utc": "2001-02-03T04:05:06.789Z",
    "latitude": 23.45,
    "longitude": -67.89
  },
  "at": "2024-06-07T08:09:10+02:00",
  "selection": "most-recent",
  "location": { "latitude": 45.25, "longitude": 12.5 },
  "houseSystem": "placidus"
}
```

```json
{
  "natal": {
    "utc": "2001-02-03T04:05:06.789Z",
    "latitude": 23.45,
    "longitude": -67.89
  },
  "after": "2024-06-07T08:09:10+02:00",
  "location": null
}
```

`natal` has the same schema as `/v1/natal`. `at` and `after` accept the same
string and epoch-millisecond forms as natal `utc`, but are always read as
UTC on the engine's default time basis. The return search and chart use
that basis even when the natal chart has a different `timeScale` or a pinned
`deltaT`. The target longitude comes from the supplied natal chart's own
calculation. Date-only search inputs mean midnight UTC.

Both routes accept optional `location` and `houseSystem` fields. Omit
`location` to inherit the natal coordinates, supply a latitude/longitude
object to relocate the return chart, or use null to omit angles and houses.
The return chart always has a known time, including when the solar return's
natal chart has an unknown time. Exact geographic poles are refused as a
return location, including an inherited pole from an untimed natal chart;
an explicit null or valid relocation remains usable for that natal chart.
The requested house system defaults to the natal chart's requested system.
Polar fallback is preserved in the chart and its receipt.

The engine owns these fixed search windows and coarse steps:

| Request | Search window | Step in days |
| --- | --- | ---: |
| Solar `nearest` | 200 days either side of `at`; a tie selects the earlier return | 1 |
| Solar `most-recent` | The 370 days before `at`, selecting the latest return at or before it | 1 |
| Lunar | `(after, after + 40 days]`, selecting the first return | 0.25 |

`test/returns.vitest.ts` enforces the public engine constants in this table
and checks selected instants within these windows against direct engine
calls. Requests cannot set ranges, step sizes, sample budgets, batches or
arbitrary bodies. These bounds limit each search's extent, not its elapsed
runtime. The engine calculation runs synchronously inside the worker, with
the server deadline described below. Unknown fields and query parameters
are refused. The server does not implement a separate event search.

The engine refuses a lunar return for an unknown birth time, a natal
`dst-gap` or `dst-fold` assertion, or `after` preceding the birth's actual
UTC instant. A solar return accepts an unknown birth time and uses its
supplied reference instant. Invalid dates, unsupported ephemeris instants,
search windows extending beyond ephemeris coverage and other engine input
refusals return `invalid_request`. No partial calculation is returned.

`data` preserves the complete return result: `body`, `natalLongitude`,
`instant`, `chart`, `location`, technique `flags`, and solar `selection`.
It adds `natal`, the contributing natal chart. Read both the technique flags
and each chart's own flags: a search window can extend outside the reference
span even when the selected return chart is inside it. Dates serialize as
ISO strings and numbers keep their full engine precision.

Receipts scoped to `/data/natal` and `/data/chart` are unchanged engine natal
envelopes for those charts. The natal envelope retains its original string
spelling. The return chart's `sourceInstant` is null because its instant was
computed, not submitted; the caller's `at` or `after` is not its source
instant. These envelopes do not cover the return search, its selection,
`natalLongitude` or the technique flags. They are not an attestation of the
return calculation as a whole. If either chart's receipt is refused, the
response is `receipt_unavailable` with empty receipts and no partial data.

Both routes share authentication, rate limits, validation and logging rules
with the other calculations. `test/returns.vitest.ts` covers full transport
parity and receipt replay, clocks, options, limits, refusals, authentication,
rate limiting and privacy. These are integration checks against this engine,
not independent astronomical accuracy evidence.

## Moon phase

`POST /v1/moon-phase` accepts a required `at` instant and calls the engine's
`moonPhase` function. For example, this synthetic request is exercised by
`test/process.vitest.ts`:

```json
{ "at": "2024-06-07T08:09:10+02:00" }
```

`at` accepts the same string or epoch-millisecond forms and limits as natal
`utc`. It is always read as UTC on the engine's default time basis;
date-only strings mean midnight UTC. Unknown fields and query parameters
are refused. The endpoint takes no location, time-scale override or pinned
delta T.

`data` preserves every `moonPhase` field: `at`, `angle` in degrees,
`illumination` as a fraction, `name` and `waxing`. It adds `sky`, a complete
location-free natal chart computed for the same instant on that same basis.
That chart supplies the bodies, coverage flags, delta T and time basis;
it has a known time and no angles or houses. Dates serialize as ISO strings
and numeric values retain the engine's full precision.

The receipt has `scope: "/data/sky"` and `envelope`, the unchanged engine
natal envelope for the sky chart. It retains the original `at` spelling
in `receipt.sourceInstant` when supplied as a string; numeric input gives
null. This envelope covers the contributing sky chart. The derived phase
angle, illumination, name and waxing flag are outside that natal receipt.
Read `data.sky.flags` for reference coverage. A receipt refusal returns
`receipt_unavailable` without a partial result. `test/moon-phase.vitest.ts`
checks full transport parity, receipt replay, coverage, validation and the
shared authentication, rate-limit and privacy behavior.

## Houses

`POST /v1/houses` calls `houses` from the public `@zodiacs/engine/calc`
entry. It requires `time` and `place`; `houseSystem` is optional and defaults
to `whole`. These synthetic examples are exercised by
`test/process.vitest.ts`:

```json
{
  "time": { "iso": "2004-02-29T08:30:00+02:00", "deltaT": 70 },
  "place": { "latitude": 48.25, "longitude": -3.75 },
  "houseSystem": "placidus"
}
```

```json
{
  "time": { "jd": 2451545, "scale": "tt", "deltaT": 64 },
  "place": { "latitude": 78.25, "longitude": 15.5 },
  "houseSystem": "placidus",
  "zodiac": "tropical"
}
```

`time` accepts an ISO string, `{ "iso": string }`, or a Julian-date object
`{ "jd": number, "scale": "utc" | "ut1" | "tt" }`. ISO forms use UTC on
the engine's time basis. Date-only strings mean midnight UTC; date-times
need an explicit offset. A bare epoch-millisecond number is not accepted
by this route. Object forms may include `deltaT`, TT minus UT1 in seconds,
with the same bound as natal `deltaT`. ISO strings use the natal string
length limit. The engine validates calendar dates, finite Julian dates
and the resulting time basis.

`place` requires finite latitude in degrees north and longitude in degrees
east. It uses the natal coordinate bounds but refuses exact geographic
poles. Heights and unknown fields are refused. `houseSystem` accepts the
engine's `HOUSE_SYSTEMS` values. Placidus and Koch may fall back to whole
sign at polar latitudes, preserved in the output and receipt. The optional
`zodiac` must be `tropical`; allowing its explicit default also lets a
client replay the normalized request from a returned receipt. Sidereal
options, birth flags, `timeKnown`, imported receipts and query parameters
are unsupported.

This route uses the calc entry's `CALC_SPAN`: both the computed UT1 and TT
must lie inside that span, with the upper endpoint excluded. Its accepted
coverage is narrower than the natal route's ephemeris span. A delta T pin
can move a time basis outside the span even when the submitted instant
looks inside it. See [the engine calc reference](../docs/calc.md) for the
time basis and typed refusals. `test/houses.vitest.ts` checks the actual
span boundaries, pins, request limits and polar behavior.

`data` is the complete successful calc result, including `status`,
`requested`, `system`, `cusps`, `angles`, `vertex`, `eastPoint`, `armc`,
`obliquity`, `flags`, `ayanamsa`, `bounds` and `receipt`. Cusps, angles,
Vertex, East Point, ARMC and obliquity are in degrees and retain their
full engine precision; `ayanamsa` is null for these tropical requests.
The receipt records the normalized request, used time
basis and convention identifiers. The engine's bounds and their stated
measurement basis are preserved without changing their scope.

The outer `receipts` list contains `{ "scope": "/data", "receipt": ... }`,
where `receipt` is exactly `data.receipt`. This is the calc engine's native
receipt, not a natal envelope, and is not input to `parseNatalEnvelope`.
Its `request` can be submitted to `/v1/houses` to repeat the calculation
with this engine. As with natal receipts, convention records are not signed
attestations and replay depends on the engine and runtime used.

Typed calc refusals and invalid inputs return HTTP 400 `invalid_request`
with no data and an empty receipts list. Engine refusal details and supplied
values are omitted from responses and logs. Moon phase and houses share
authentication, the per-key bucket, JSON limits and sanitized errors with
the other routes. `test/houses.vitest.ts` checks complete engine-output
parity, native receipt replay and refusals; `test/process.vitest.ts` checks
both routes and their privacy through the built listener. These comparisons
verify the adapter against this engine, not independent astronomical accuracy.

## Rate limits

Each configured key gets a token bucket shared across protected routes. The
bucket starts full, spends one token per authenticated request and refills
continuously using elapsed monotonic time, capped at its capacity. Invalid
bodies, schema failures and unknown routes spend a token too. Unauthenticated
requests, public probes and API discovery do not use a bucket; sending
credentials to a public route does not change that. Exhausted requests are
refused before body parsing or calculation, and a refusal does not spend
another token.

`RATE_LIMIT_CAPACITY` defaults to 60 tokens and
`RATE_LIMIT_REFILL_PER_SECOND` to 1 token per second. Both accept decimal
integers from 1 through 10,000; an invalid value fails startup with a generic
log. These defaults and bounds are enforced in `test/config.vitest.ts` and
`test/token-bucket.vitest.ts`. Buckets belong to the server process: restart
resets them, and separate replicas have separate allowances. Bucket storage
uses only authenticated, opaque key identities and is bounded by the loaded
key set.

Authenticated responses include `X-RateLimit-Limit` (bucket capacity) and
`X-RateLimit-Remaining` (whole tokens left after that request). Exhaustion
returns HTTP 429, `error.code: "rate_limited"`, and `Retry-After`, the wait
until another token is available, rounded up to seconds. Another request
using the same key can spend the refilled token first. The error has an empty
receipts list. Header behavior, request ordering, concurrent exhaustion,
refill and key isolation are checked in `test/rate-limit.vitest.ts` and
through the built listener in `test/process.vitest.ts`.

## JSON requests and errors

Bodies must be UTF-8 JSON objects with `Content-Type: application/json`.
An optional `charset=utf-8` parameter is accepted, including the quoted
form; media type and charset comparisons ignore letter case. Other media
types, charsets and parameters are refused. Compression is unsupported:
omit `Content-Encoding` or use `identity`. Duplicate content-type or
content-encoding header fields are refused. GET, HEAD and TRACE requests
must have no body.

The body cap is 65,536 bytes, including JSON punctuation and whitespace,
whether the request supplies Content-Length or uses chunked encoding.
JSON may contain at most 16 container levels and 4,096 values. The root
object is the first level and the first value; arrays and objects count
as containers and values, scalar values count as values, and property
names do not count separately. Numeric overflow, invalid UTF-8, malformed
JSON, scalar or array roots, and the property names `__proto__`,
`constructor` and `prototype` at any level are refused. Boundary tests are
in `test/request-validation.vitest.ts`; `test/process.vitest.ts` checks
chunked byte overflow and duplicate headers on the actual listener.

Routes validate their declared JSON schemas without coercing types,
discarding unknown properties or inserting defaults. Required-body and
schema behavior is exercised with test-only routes in
`test/request-validation.vitest.ts` and the calculation routes in
`test/natal.vitest.ts`, `test/comparisons.vitest.ts`,
`test/returns.vitest.ts`, `test/moon-phase.vitest.ts` and
`test/houses.vitest.ts`. Parser, schema and
engine input errors expose no input values or validation internals in
responses or logs.

| HTTP status | Error code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Malformed JSON or headers, invalid route input, or an instant the engine cannot compute. |
| 401 | `unauthorized` | Missing or invalid API-key authentication. |
| 404 | `not_found` | Authenticated request to an unavailable route or method. |
| 413 | `body_too_large` | JSON body exceeds the byte cap. |
| 415 | `unsupported_media_type` | Missing or unsupported content type, charset or encoding. |
| 422 | `receipt_unavailable` | The engine's codec refused a calculation receipt; no chart is returned. |
| 429 | `rate_limited` | This key has no request token available. |
| 500 | `internal_error` | Unexpected server failure. |
| 500 | `calculation_failed` | The calculation worker was lost; no partial result is returned. |
| 503 | `not_ready` | Worker unavailable, readiness check failed, or server shutting down. |
| 503 | `server_busy` | The shared calculation queue is full. |
| 504 | `calculation_timeout` | The calculation deadline, including queue wait, expired. |

The table describes ordinary request handling, as checked in
`test/app.vitest.ts`, `test/auth.vitest.ts`, `test/request-validation.vitest.ts`,
`test/natal.vitest.ts`, `test/comparisons.vitest.ts`, `test/returns.vitest.ts`,
`test/moon-phase.vitest.ts`, `test/houses.vitest.ts` and
`test/rate-limit.vitest.ts`, `test/openapi.vitest.ts` and
`test/lifecycle.vitest.ts`. Raw HTTP parser and router failures can
occur earlier. Authentication precedes rate limiting, which precedes JSON
validation, so a rejected request reports the first applicable error.

## Resource limits and shutdown

The executable runs calculations in a worker thread so engine work does not
block the HTTP event loop. It admits one active calculation and a bounded
FIFO queue shared across keys and routes. Authentication, token consumption
and request validation happen before admission. Overload and invalid engine
inputs still consume a request token. A full queue returns `server_busy`;
clients should back off before retrying. The worker owns its engine state,
including the engine's shared delta T setting. It calls the same public
engine functions as the source integration tests.

Configure these environment variables before starting the executable:

| Variable | Default | Accepted range | Meaning |
| --- | ---: | ---: | --- |
| `MAX_CONNECTIONS` | 128 | 1 to 10000 | Maximum simultaneous TCP sockets, including incomplete requests and idle keepalive sockets. |
| `REQUEST_TIMEOUT_MS` | 30000 | 100 to 120000 | Request receipt timeout and socket inactivity timeout, in milliseconds. |
| `CALCULATION_TIMEOUT_MS` | 5000 | 100 to 30000 | Milliseconds from worker admission, including queue wait, until the worker result. |
| `CALCULATION_QUEUE_SIZE` | 8 | 0 to 64 | Maximum waiting calculations, excluding the active calculation. Zero disables waiting. |
| `SHUTDOWN_TIMEOUT_MS` | 10000 | 100 to 30000 | Milliseconds allowed for shutdown before the process exits with failure. |

All values are decimal integers; configuration never disables a deadline.
Defaults and boundaries are enforced by `test/config.vitest.ts`. The worker's
queue, deadline, failure recovery and drain behavior are tested in
`test/calculation-pool.vitest.ts`. Calculation timeouts are measured by the
parent's monotonic clock. They exclude body receipt, validation, serialization
and transfer of the HTTP response. Timer delivery and worker termination are
subject to operating-system scheduling; this is not a real-time guarantee.
An early HTTP disconnect does not cancel already admitted work, which remains
bounded by its deadline.

An active timeout terminates the worker. Its active request receives
`calculation_timeout`; waiting requests receive `not_ready`. A worker crash
uses `calculation_failed` for the active request. Both trigger one replacement
attempt, with readiness unavailable until the replacement verifies the engine
and its receipt. Only a successful calculation resets the replacement
allowance. Failed replacement or another crash before that success leaves
the service unready; restart the process. A queue-wait timeout removes that waiting request without returning
a partial result. Saturation alone keeps readiness healthy so a transient
burst does not trigger restart loops. Liveness and discovery use the HTTP
thread. Socket limits and host resource exhaustion can still make them
unreachable.

HTTP headers are limited to 16384 bytes. Headers must arrive within the
smaller of 10000 milliseconds and `REQUEST_TIMEOUT_MS`; the HTTP parser checks
deadlines every 1000 milliseconds. Idle keepalive timeout is 5000 milliseconds.
`test/openapi.vitest.ts` checks the configured timeouts, and
`test/lifecycle.vitest.ts` exercises header overflow, stalled bodies and
socket-cap recovery through a real listener. Socket-cap overflow and socket
inactivity close the connection without promising a JSON response; parser
rejections that can respond use the sanitized envelope. A reverse proxy may
apply its own limits too.

SIGINT and SIGTERM stop admission, mark readiness unavailable, close the
listener and reject waiting calculations. The active calculation may finish
within its existing deadline. A body that finishes arriving during shutdown
is refused before calculation. Repeated signals share the same shutdown.
The process deadline may close stalled connections before their own deadlines;
operators should allow it to elapse before force-killing the process.
`test/lifecycle.vitest.ts` covers active work, stalled uploads, repeated signals
and the forced exit. Worker messages contain validated calculation inputs and
server-generated request IDs, never HTTP headers or credentials. Workers
receive an empty environment and no inherited preload flags; their output
and raw failures are discarded. Logs contain fixed failure codes only.

`buildApp()` is a test and embedding factory. Without an explicit calculation
runner it executes the engine in process; use the executable for worker
isolation and process deadlines. Its callers own their runner's lifecycle.

## Development and isolation

```sh
npm run typecheck
npm test
npm run check:package
```

The test script builds the server and worker before Vitest checks in-process HTTP
requests and a real loopback listener. Tests use `*.vitest.ts` filenames and an
explicit local include pattern so the root engine's default Vitest discovery
does not pick them up. All example and probe instants are synthetic.

`check:package` asks npm for a dry-run file list with lifecycle scripts
disabled and verifies that `server/` is excluded. It writes no archive and
does not build root `dist/`. It does not replace the repository's full package
contents gate, which requires an existing engine build.

Keep runtime secrets in environment variables or the ignored `secrets/`
directory. `.env` files and `api-keys.json` are also ignored. Generated build
output, dependency installs, caches and raw logs stay ignored. No credentials
are included in this package.

Server code is MIT under [the repository licence](../LICENSE). A server build
also contains engine code and data covered by [LICENSING.md](../LICENSING.md)
and [NOTICE](../NOTICE); retain those notices when redistributing it.
