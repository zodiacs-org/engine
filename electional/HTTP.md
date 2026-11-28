# Bounded HTTP condition endpoint

`createElectionalServer({ limits })` creates an import-safe Node HTTP server.
The host chooses when and where to listen and supplies an explicit operator
policy. `POST /electional/search` streams the shared library's chronological
condition windows. It preserves checks that pass, fail or remain unresolved,
source clocks, uncertainty and engine receipts. It accepts no scoring controls
and never imports the optional internal/pro annotation module. No chart REST
API, calendar export, webhook, prediction or date recommendation is provided.

After the local build, the loopback executable takes a policy file and port:

```sh
node bin/electional-http.mjs examples/http-policy.json 8080
```

This example bind is loopback only. Library hosts own their binding and access
controls. The example policy is in [examples/http-policy.json](examples/http-policy.json).
[examples/http-controls.json](examples/http-controls.json) supplies compatible
controls for [examples/synthetic-hours.yaml](examples/synthetic-hours.yaml).
The executable reads a bounded regular UTF-8 file, handles listen errors and
closes connections on SIGINT or SIGTERM. Importing the library starts no server
or worker.

## Request envelope

Send `Content-Type: application/json` with an optional UTF-8 charset and no
compression. The envelope has exactly `format`, `rules` and `controls`:

```js
const body = JSON.stringify({
  format: 'yaml',
  rules: yamlRuleDocument,
  controls: explicitStreamControls,
});
```

`format` is explicitly `json` or `yaml`; `rules` is the corresponding document
as a string. [RULES.md](RULES.md) defines its strict validation and synthetic
natal declaration. `controls` is a JSON object using the same explicit fields
as the [CLI controls](CLI.md) and [stream](STREAMING.md). YAML is supported only
inside the declared rule document. Duplicate JSON keys reject at every depth.
Unknown routes, methods, fields, malformed UTF-8 and compressed input reject.
The endpoint reads no submitted file path or URL.

Operator policy requires every field in `HttpLimits`. Admission, body upload,
parsing and worker lifetime fall within the request deadline. Byte limits count
UTF-8: request bodies are bounded incrementally even without Content-Length;
response limits include line delimiters and provisional-prefix diagnostics.
Range, step, lookahead, chunk and shared work controls must fit operator caps.
An over-limit request rejects instead of silently changing its conventions.

The host admits only the configured concurrent searches, counting pending body
uploads too. Each accepted search runs in a dedicated worker that loads the
existing local engine and optional events build. A deadline or disconnect
terminates the worker, including during synchronous native calls. The admission
slot remains occupied until termination finishes. Workers wait for host write
acknowledgement before requesting another frame, keeping transport pull-driven.
Native request counts, sky samples and scan assumptions retain the meanings
in the library guides; these controls do not establish ephemeris completeness
or a strict heap/CPU bound for hidden work inside a native call.

## Response and lifecycle

Accepted searches return newline-delimited JSON with the library's `chunk`
and `end` frames, `Cache-Control: no-store` and explicit receipt scope. Every
fragment is factual and chronological, without a score, contribution or rank.
A successful HTTP status alone does not mean all requested checks resolved;
consume the terminal library status and refusal records. Earlier chunks are
provisional. Interrupted searches never receive a fabricated successful end.

Before response headers, transport failures return a JSON error code and an
HTTP error status. After a provisional prefix, a bounded error line ends the
stream when possible; blocked output may close the socket instead. A missing
terminal frame always means an incomplete transport. Errors do not expose
submitted values, exception text, stack traces or filesystem paths.

| Status | Transport meaning |
| --- | --- |
| `400` | Invalid envelope, controls, rule document or UTF-8. |
| `404` | Unknown route, including query strings. |
| `405` | Unsupported method; only POST is allowed. |
| `413` | Declared or incremental request body exceeds policy. |
| `415` | Unsupported content type or encoding. |
| `417` | Unsupported Expect request. |
| `422` | Valid controls exceed operator policy. |
| `503` | Admission limit reached. |
| `504` | Deadline exceeded before response headers. |
| `507` | Response budget exceeded before response headers. |
| `500` | Worker/module/source transport failure before headers. |

Connections close after each response, preventing unread rejected body bytes
from becoming a later request on a reused connection. There is no automatic
retry or persistent job. Required source refusals and work-budget refusals are
library results with an `end` frame; transport failures are separate errors.

## Evidence

[test/http.electional-check.ts](test/http.electional-check.ts) sends real local
HTTP requests through the shared worker, coordinator and stream. Transport
references come from the hand-derived sets in
[test/fixtures/composition-windows.json](test/fixtures/composition-windows.json)
over its declared synthetic integer domain. It checks JSON/YAML equivalence,
chronological failed/unknown conditions, receipts, inclusive UTF-8 limits,
operator caps, cumulative output, admission, stalled uploads, synchronous
blocking work, disconnects, worker failures and acknowledgement ownership.
Native tests reuse the synthetic planetary-hours example with all rulers;
expected coverage follows from selecting every ruler, without pinning an
engine-produced astronomical position.

[scripts/check-http-esm.mjs](scripts/check-http-esm.mjs) checks the actual built
server and loopback executable, strict startup inputs, receipt transport and
signal shutdown. The suite and executable evidence are recorded by
[scripts/record-m13-tests.mjs](scripts/record-m13-tests.mjs) under
[docs/evidence/m13-tests.json](docs/evidence/m13-tests.json). Existing independent
astronomical references remain in [references/README.md](references/README.md).
The record distinguishes unavailable optional events integration from executed
checks. It establishes transport and set behavior, without new astronomical
accuracy, long-range completeness, throughput or predictive claims.
