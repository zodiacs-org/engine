# Chart HTTP examples

`src/worker.ts` exports a default object with a `fetch(request)` method, the
[Cloudflare module Worker Fetch handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/)
shape. It delegates to `src/http.ts`, which uses standard Fetch APIs and the
engine's public root entry. It needs no environment bindings, Node polyfills
or network requests to calculate a chart. `src/deno.ts` and `src/bun.ts`
export that same handler as `handleRequest` and start local servers only when
executed as the main module.

The Workers build emits `.generated/workers/worker.mjs` as a self-contained
module and records its source and output digests in the manifest. Keep the
licence and attribution sidecars with copied bundles, as the
[lab README](../README.md) describes. `engine.mjs` and `workloads.mjs` are
separate library and test entries; the handler does not load either.

## Local use

After the [local install](../README.md#run-the-foundation), use Node 22 from
the repository root:

```sh
npm --prefix edge run build -- workers
node --test edge/tests/http.check.mjs
node --input-type=module <<'JS'
import worker from './edge/.generated/workers/worker.mjs';

const response = await worker.fetch(new Request('https://edge.invalid/chart', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    utc: '2000-03-20T12:34:56Z',
    latitude: 35.25,
    longitude: -110.75,
    houseSystem: 'whole'
  })
}));
console.log(response.status, await response.json());
JS
```

The input is invented and is also a case in `src/workloads.ts`. This invokes
the built handler locally without opening a socket or making an HTTP request.
Local Workers runtime launch tooling and checks belong to M7; this invocation
does not establish Workers execution or deployment. The entry to supply to
that tooling is `.generated/workers/worker.mjs`.

## Deno and Bun

Build the examples using the local Node toolchain, from the repository root:

```sh
npm --prefix edge run build -- deno
npm --prefix edge run build -- bun
```

Run either server in the foreground. Stop it with Ctrl-C before starting the
other, since both use `127.0.0.1:8787`:

```sh
DENO_DIR="$PWD/edge/.cache/deno" deno run \
  --no-config --no-lock --no-npm --no-remote --no-prompt \
  --allow-net=127.0.0.1:8787 edge/.generated/deno/deno.mjs
```

```sh
bun --no-env-file --no-install edge/.generated/bun/bun.mjs
```

Deno starts with [Deno.serve](https://docs.deno.com/api/deno/http-server/).
Its [run flags](https://docs.deno.com/runtime/reference/cli/run/) disable
configuration discovery and remote/npm resolution, with network permission
limited to the example's loopback address. The self-contained module needs
no application file or environment permissions. Bun starts with
[Bun.serve](https://bun.sh/docs/runtime/http/server); the launch command
disables automatic environment-file loading and dependency installation.
Neither example reads host or
port from environment variables. Change the source and rebuild to choose
another listening address. These are local examples, with no remote deployment
or hosting setup included.

From another terminal, send this invented input:

```sh
curl --fail-with-body http://127.0.0.1:8787/chart \
  -H 'Content-Type: application/json' \
  --data '{"utc":"2000-03-20T12:34:56Z","latitude":35.25,"longitude":-110.75,"houseSystem":"whole"}'
```

Both entries guard startup with `import.meta.main`; an application can import
`handleRequest` from the generated module and pass it to its own listener.
They use named exports so importing the Bun module cannot trigger its default
Fetch-export serving convention. Runtime type declarations are local to the
adapters and cover only the calls they use; they do not replace the host's
full API types. The build emits `deno.mjs` and `bun.mjs` beside the same licence
sidecars and manifest as the library entries.

Use Node 22 for the native server checks, with Deno and Bun installed separately:

```sh
node edge/scripts/check-http-runtime.mjs deno
node edge/scripts/check-http-runtime.mjs bun
# Optional final argument selects an executable outside PATH.
node edge/scripts/check-http-runtime.mjs deno "$PWD/edge/.cache/deno-tool/node_modules/.bin/deno"
```

Run these commands sequentially with the example port free. Each builds its
target, checks that importing it does not start a server, launches the real
entry, exercises synthetic HTTP requests and shuts down its child process.
Missing tools, startup failures and failed checks are errors, never skipped
passes. The report names the runtime and build digests. These checks validate
response structure and HTTP behavior; they do not compare numerical results
between runtimes. [M4 validation](evidence/m4-validation.md) records the
versions and checks actually run. Workers and browser runtime checks remain
in M7.

## Request

Use `POST /chart` without query parameters. Send an uncompressed UTF-8 JSON
object with `Content-Type: application/json`; an optional `charset=utf-8`
parameter is accepted, including its quoted form. An absent Content-Encoding
or `identity` is accepted. The endpoint computes a single natal chart.

| Field | Accepted value |
| --- | --- |
| `utc` | Required nonempty string in the engine's ISO calendar-date or explicit-offset date-time syntax. The engine validates the date and its supported ephemeris span. |
| `latitude`, `longitude` | Optional pair of finite numbers in degrees, respectively within `[-90, 90]` and `[-180, 180]`, inclusive. |
| `houseSystem` | Optional exact member of the engine's `HOUSE_SYSTEMS`; defaults to `whole`. |
| `timeKnown` | Optional boolean; defaults to true. False preserves the supplied reference instant while suppressing angles and houses. |
| `timeScale` | Optional `utc`, `ut1` or `tt`; defaults to `utc`. The instant field keeps its name `utc` on every scale. |

All other fields, including flags and pinned delta T, are refused by this
example. Explicit nulls, arrays, misspellings, numeric strings and nested
objects are refused. Input is parsed with JSON.parse, whose duplicate object
keys use the last value. The example is not a lossless input codec.

`HTTP_LIMITS` in `src/http.ts` caps the body at 4096 bytes, delivered in at
most 4096 chunks, and `utc` at 64 UTF-16 code units, with a 5000 ms deadline
for reading the entire body.
`tests/http.check.mjs` enforces these constants and exercises their boundaries,
along with the coordinate ranges in the table above. These are application
limits, not provider limits or measured performance guarantees.

Content-Length can refuse a large body before reading it. The handler also
counts the actual stream bytes, so a missing or understated header cannot
bypass the cap. Empty chunks count toward the chunk cap so an always-ready
stream cannot spin indefinitely and starve the timer. UTF-8 decoding is fatal
on malformed bytes. The handler
cancels reading after failure without waiting for the sender to acknowledge
cancellation. Its deadline covers body receipt, not synchronous computation.

## Response

Success has HTTP status `200` and shape `{ "ok": true, "result": chart }`.
The result contains every chart field as ordinary JSON, with Date values
converted to ISO strings and undefined properties omitted. Numerical values
are not explicitly rounded, but JSON loses signed zero; this format is not
the exact binary64 parity protocol planned in M5.

An error has shape
`{ "ok": false, "error": { "code": "...", "message": "..." } }`.
Some invalid-input errors include a fixed `field` name. Error responses
contain no submitted values, raw exception messages, causes or stack traces.
The status/code contract below is tested in `tests/http.check.mjs`.

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `invalid-request` | Query parameters were supplied. |
| `400` | `invalid-content-length` | The declared byte count is malformed or outside the safe integer range. |
| `400` | `invalid-json` | Missing, malformed or invalid UTF-8 JSON body. |
| `400` | `invalid-input` | The object, fields or field values fail the request contract. |
| `400` | `unreadable-body` | The body is aborted, consumed, locked or fails while reading. |
| `404` | `not-found` | The path is not `/chart`. |
| `405` | `method-not-allowed` | The path exists but the method is not POST. `Allow: POST` is sent. |
| `408` | `body-timeout` | Body reading did not finish before the deadline. |
| `413` | `body-too-large` | Declared or received body size exceeds the byte cap. |
| `413` | `body-too-fragmented` | The stream yields more chunks than the chunk cap, including empty chunks. |
| `415` | `unsupported-media-type` | JSON media type or UTF-8 charset is missing or unsupported. |
| `415` | `unsupported-content-encoding` | A compressed or unsupported encoding was supplied. |
| `422` | `calculation-rejected` | The engine threw RangeError, including for invalid ISO dates or instants outside its supported span. |
| `500` | `calculation-failed` | An unexpected calculation or serialization failure occurred. |

Routing checks path, then method, then query parameters before reading the
body. HEAD responses have an empty body. All responses set
`Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`
and `X-Content-Type-Options: nosniff`. The endpoint has no CORS preflight route.
This contract describes responses from the shared Fetch handler. A host HTTP
server may reject malformed HTTP framing or a disconnected client before a
Fetch request reaches the handler; those transport errors need not use this
JSON error shape.

The handler keeps no request log, cache or storage. Its limits constrain each
request, not request frequency or aggregate CPU use; this example includes no
authentication or rate limiting. Dates outside reference coverage may still
compute and carry the engine's coverage flag. This adapter makes no accuracy
claim. Node tests compare chart JSON to the same engine on invented inputs.
The Deno/Bun native checks additionally exercise the listening servers.
Workers execution, exact cross-runtime parity and CPU measurements remain
separate milestones. [M3 validation](evidence/m3-validation.md) and
[M4 validation](evidence/m4-validation.md) record what was run.
