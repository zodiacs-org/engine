# Calling the engine HTTP API

Fetch `GET /openapi.json` from the trusted server origin before integrating.
It is public and returns the generated specification directly. Calculation
responses use an envelope containing `requestId`, `engine`, `receipts` and
`data`; errors replace `data` with `error`. The specification describes the
actual request schemas, configured limits, response shapes and receipt scopes.
Its contracts and synthetic examples are exercised by
[test/openapi.vitest.ts](test/openapi.vitest.ts).

Send calculation inputs as JSON with `Content-Type: application/json` and
exactly one `Authorization: Bearer <key>` header. Provision the key through
your environment or secret manager. Keep it out of URLs, browser bundles,
source files and logs. The server does not load a client's environment file.
Use HTTPS through the operator's proxy for remote traffic, or loopback for
local development. The Node example below does not configure TLS or browser
cross-origin access; those are covered in
[DEPLOYMENT.md](DEPLOYMENT.md#probes-and-traffic-routing).

## Choose a calculation

All paths in this table use POST. Each birth input has the fields accepted by
`/v1/natal`; submit inputs rather than precomputed charts or imported receipts.
The [API reference](README.md#natal-charts) describes optional settings.

| Path | Required input | What the engine receipts cover |
| --- | --- | --- |
| `/v1/natal` | `utc` | Complete chart at `/data`, in a natal envelope. |
| `/v1/transits` | `natal`, `at` | Natal chart at `/data/natal` and supporting sky chart at `/data/sky`. Transit aspects are outside their scope. |
| `/v1/synastry` | `a`, `b` | Charts at `/data/a` and `/data/b`. Pair aspects and summaries are outside their scope. |
| `/v1/returns/solar` | `natal`, `at` | Charts at `/data/natal` and `/data/chart`. Search, selection and technique flags are outside their scope. |
| `/v1/returns/lunar` | `natal`, `after` | Charts at `/data/natal` and `/data/chart`. Search and technique flags are outside their scope. |
| `/v1/moon-phase` | `at` | Supporting sky chart at `/data/sky`. Phase angle, illumination, name and waxing are outside its scope. |
| `/v1/houses` | `time`, `place` | Full houses result at `/data`, using its native calculation receipt. |

Solar returns support nearest or most-recent selection. Lunar returns are
strictly after the supplied instant and require a known, unambiguous natal
time. Returns use the engine's fixed search windows. There is no arbitrary
event search, batch endpoint or MCP transport. Moon phase and transits are
snapshots at the explicit input instant.

## A Node client

Save this module in your application's source. Supply `API_ORIGIN` as a trusted
HTTP(S) origin, without a path, query, fragment or embedded credentials, and
`API_KEY` as the provisioned key. Neither environment value is printed.
The invented birth input is unrelated to any person.

```js
const errorCodes = new Set([
  'invalid_request', 'unauthorized', 'not_found', 'body_too_large',
  'uri_too_long', 'unsupported_media_type', 'receipt_unavailable',
  'rate_limited', 'internal_error', 'not_ready', 'server_busy',
  'calculation_failed', 'calculation_timeout'
]);

export class ApiFailure extends Error {
  constructor(status, code, requestId, retryAfterSeconds) {
    super('API request failed.');
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function requestNatal({
  origin = process.env.API_ORIGIN,
  key = process.env.API_KEY,
  deadlineMs = 15_000
} = {}) {
  if (!origin || !key) throw new Error('API_ORIGIN and API_KEY are required.');
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('API_ORIGIN must be an HTTP(S) origin.');
  }
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) {
    throw new Error('A finite positive deadline is required.');
  }
  const response = await fetch(new URL('/v1/natal', base), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(deadlineMs),
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      utc: '2001-02-03T04:05:06.789Z',
      latitude: 23.45,
      longitude: -67.89
    })
  });
  // The same abort signal remains active while the response body is read.
  const envelope = await response.json();
  if (!response.ok) {
    const code = errorCodes.has(envelope?.error?.code)
      ? envelope.error.code : 'unexpected_response';
    const id = response.headers.get('x-request-id');
    const requestId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id ?? '')
      ? id : null;
    const retry = response.headers.get('retry-after');
    const retryAfterSeconds = /^[0-9]+$/u.test(retry ?? '')
      && Number.isSafeInteger(Number(retry)) ? Number(retry) : null;
    throw new ApiFailure(response.status, code, requestId, retryAfterSeconds);
  }
  return envelope;
}
```

The deadline is an example client budget, independent of the server's worker
deadline. It covers waiting for headers and consuming JSON. Redirects fail
instead of resending credentials. There are no automatic retries. A proxy may
return non-JSON content, and a deadline or connection failure may produce no
HTTP envelope at all. Handle those failures without logging the raw exception,
which may contain a URL or other request details.

For example, after saving the module as `engine-client.mjs`:

```js
import { ApiFailure, requestNatal } from './engine-client.mjs';

try {
  const envelope = await requestNatal();
  // Pass the complete envelope to your application; do not log birth results.
} catch (error) {
  console.error(JSON.stringify(error instanceof ApiFailure
    ? { status: error.status, code: error.code, requestId: error.requestId }
    : { status: null, code: 'client_failure', requestId: null }));
  process.exitCode = 1;
}
```

Validate successful responses against the discovered schema in applications
that need a runtime contract. The example returns the envelope without
filtering it. Do not reduce it to positions before storing or forwarding it;
that would discard time basis, flags and receipts.

## Instants and settings

Resolve a local wall time, including its daylight-saving gap or fold, before
calling this API. Date-times require an explicit offset. A calendar date alone
means midnight on the selected scale; it does not mean local midnight at the
submitted coordinates. Coordinates do not select a time zone. Accepted string
and number forms and their bounds are enforced by
[test/natal.vitest.ts](test/natal.vitest.ts).

Natal `utc` accepts an ISO string or epoch milliseconds. Its optional
`timeScale` determines the scale despite that field's name; `deltaT` pins
TT minus UT1 in seconds. Each natal chart in a comparison keeps its own
settings. Transit, moon-phase and return search instants use the default UTC
time basis and do not inherit natal pins or scales. The houses route uses the
calc API's `time` vocabulary, including a Julian date with an explicit scale;
an epoch-millisecond number is not its Julian-date input.

Use `timeKnown: false` when the birth time is unknown. Supply the reference
instant you intend: the server does not infer noon. Missing coordinates also
omit angles and houses. Read the receipt's absence reason. Requested polar
house systems can fall back; preserve the requested and actual system, chart
flags, time basis and bounds. Schema-valid input can still fail the engine's
calendar, coverage or consistency checks. Null is not a substitute for omitting
an optional field unless its schema explicitly accepts null.

## Preserve and replay receipts

Each `receipts` item has a `scope`, a server-authored JSON pointer into the
response. Resolve it against the whole response envelope. An `envelope` item
contains the engine's unchanged natal envelope; a `receipt` item from houses
contains the engine's native calculation receipt, also present at
`data.receipt`. The table above states the scope exclusions. Error and probe
responses have an empty receipts list because they produced no calculation.

For a natal envelope, use `parseNatalEnvelope` and `natalReplayInput` from the
engine's public receipt entry. The replay helper returns a JavaScript birth
input, including a Date; convert that Date with `toISOString()` when sending
JSON to `/v1/natal`, and retain its other settings. For houses, send the native
receipt's `request` to `/v1/houses`. These are different receipt formats; do not
pass a houses receipt to the natal codec. Existing integration tests exercise
[natal replay](test/natal.vitest.ts) and
[houses replay](test/houses.vitest.ts).

A receipt records a claim about engine identity, conventions, inputs and
coverage. It is not signed, and parsing it does not authenticate its origin or
prove its positions. Preserve the original envelope when replaying. A replay
uses the engine installed at the destination, and its numeric result can
differ with engine, dependency, runtime or processor changes. Retain trusted
build and runtime provenance separately when reproducibility matters. Chart
coverage flags and houses bounds describe the engine's checked scope, not a
guarantee for every accepted instant.

## Failures and retry budgets

Branch on HTTP status and the stable `error.code`, rather than message text.
The server returns no partial calculation on a failure. An upstream proxy or
broken connection can prevent even that response; treat raw HTML, truncated
JSON and missing envelopes as transport failures. Retain a valid request ID
for operator correlation without logging inputs, credentials or receipts.

| Status and code | Client action |
| --- | --- |
| `400 invalid_request`, `413 body_too_large`, `414 uri_too_long`, `415 unsupported_media_type`, `431 invalid_request` | Correct the input or HTTP request before retrying. |
| `401 unauthorized` | Check credential provisioning and rotation. Do not retry the same rejected key in a loop. |
| `404 not_found` | Check the discovered path and method. |
| `422 receipt_unavailable` | The engine could not represent the calculation as a receipt. Review the inputs and supported geometry; repeating an unchanged request is not a repair. |
| `429 rate_limited` | Honor `Retry-After` seconds and coordinate the key's callers. Another request can spend the replenished token first. |
| `503 server_busy` | Reduce concurrency; retry only within a bounded budget with delay and jitter. |
| `503 not_ready` | Back off while the operator or worker recovers. Readiness probes are public, but must also be polled with a bounded schedule. |
| `504 calculation_timeout` | The queue wait or calculation exceeded its deadline. Reduce load or review the workload; repeatedly resubmitting the same slow work can repeatedly terminate the worker. |
| `500 calculation_failed`, `500 internal_error`, `408 invalid_request`, or connection failure | Use a bounded retry policy when appropriate and provide request IDs to the operator if it persists. |

Set both a maximum attempt count and a total elapsed retry budget in the
calling application. Use increasing delays with jitter for transient failures.
When `Retry-After` exceeds the remaining budget, stop rather than retrying
early. Cancellation on the client does not promise cancellation of work already
accepted by the server; an immediate retry can add duplicate work. These routes
do not persist calculations, but each admitted retry still consumes resources.

Authenticated invalid requests spend tokens. Public probes and discovery are
unmetered, and each replica has an independent allowance that resets on
restart. Rate-limit headers describe the responding process. Inspect the
discovery extensions for its configured limits, enforced in
[test/rate-limit.vitest.ts](test/rate-limit.vitest.ts),
[test/request-validation.vitest.ts](test/request-validation.vitest.ts) and
[test/calculation-pool.vitest.ts](test/calculation-pool.vitest.ts).
