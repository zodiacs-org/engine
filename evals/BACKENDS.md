# Generation backend contract

The M5 client in [lib/generation-backend.mjs](lib/generation-backend.mjs) is a
bounded text transport. It keeps backend selection, request identity and failures
consistent for later generators. It does not parse a model's JSON, claim that a
response follows its prompt, assign a license, or assemble a meaning entry.

## Offline use

From the repository root in a Node ES module:

```js
import { createGenerationClient } from "./evals/lib/generation-backend.mjs";

const client = createGenerationClient();
const response = await client.generate({
  schemaVersion: "1.0.0",
  promptVersion: "inline-prompt-v1",
  system: "Return original symbolic prose as JSON.",
  prompt: "Use this invented factor: Sun in aries.",
  seed: 0
});
console.log(response.backend, response.finishReason, response.text);
```

This example is exercised by the
[backend contract tests](tests/generation-backend.checks.mjs).
Omitting `backend` selects `mock`; `{ backend: "mock" }` selects the same backend.
Environment variables do not change selection. An unknown id is an error.
Importing the module and calling the mock require no provider, application file
I/O or network call. The
[integration tests](tests/generation-backend-integration.checks.mjs) disable
those operations in a fresh process and check repeatability across processes,
working directories and request property order.

The mock is `offline-meaning-template-v1`. It returns JSON text with `summary`,
`themes` and `epistemicStatus: "symbolic-interpretation"`. Its original template
explicitly says `Offline mock` and contains a request digest marker. It never
copies source interpretations or simulates a reviewed answer. The same request
produces the same text; the seed participates in its digest, without random
sampling. The draft fits the meaning portion of an entry, as the contract tests
check. Entry identity, factor, provenance, source ids and licensing must be
provided and validated by the generator. Generated datasets stay ignored.

## Requests and results

`client.generate(request, { signal })` returns a promise. Its optional `signal`
must be a native `AbortSignal`. The request has exactly these fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Contract version `1.0.0` |
| `promptVersion` | Lowercase slug identifying the caller's prompt template |
| `system` | Nonblank system instruction text |
| `prompt` | Nonblank user prompt text |
| `seed` | Integer from zero through `4294967295`, passed unchanged to the adapter |

Strings must contain well-formed Unicode. Text is retained exactly, including
line endings and normalization. The client rejects extra fields, missing fields,
wrong types and accessor properties. It supplies an immutable detached request
to the adapter, in the field order shown above. Input objects remain unchanged.
Custom adapters decide whether their model supports the seed; a seed alone does
not establish reproducibility for a real model. Request validation and the seed
boundaries are enforced by the contract tests.

Successful transport results are immutable JSON data:

```text
{
  schemaVersion,
  backend: { id, model, version, mode },
  limits: { maxInputBytes, maxOutputBytes, timeoutMs, maxCalls },
  requestDigest,
  promptVersion,
  text,
  finishReason
}
```

`text` is the exact returned string. `finishReason` is `stop`, `length` or
`refusal`; the latter two may have empty text. A `stop` with empty or blank text
is invalid. Invalid JSON remains text at this boundary. A `length` or `refusal`
result is not a completed interpretation and must not be treated as one by the
generator. Excess output is rejected, never silently shortened. No provider
response object, arbitrary usage metadata or exception is copied into results.

`requestDigest` is SHA-256 of the UTF-8 encoding of `JSON.stringify` on this
fixed-order object: `{ schemaVersion: "1.0.0", backend, limits, request }`.
Backend fields, limit fields and request fields use the orders shown above.
Negative zero in the seed is normalized to zero. Different property insertion
orders therefore have the same identity, while changed prompt bytes, seed,
prompt version, backend metadata or limits change it. Returned text is not an
input to this digest. No timestamp, elapsed duration or temporary path enters
the result. The contract tests independently calculate the digest and test
changes to each kind of input. This is local invocation identity, not an
authenticated provider receipt or a hash of adapter implementation code.

## Bounds and cancellation

`createGenerationClient({ limits })` accepts partial overrides. Every limit is
a positive integer and may be tightened, never raised above the exported
`GENERATION_LIMITS`. The ceilings and exact byte boundaries are checked by the
backend contract tests; the lifecycle rules are checked by the integration tests.

| Limit | Default and ceiling | What it counts |
| --- | ---: | --- |
| `maxInputBytes` | 65,536 | UTF-8 bytes of the canonical request JSON, including metadata and JSON escaping |
| `maxOutputBytes` | 65,536 | UTF-8 bytes of returned `text`, before any parsing |
| `timeoutMs` | 30,000 | Milliseconds allowed for each dispatched request |
| `maxCalls` | 256 | Dispatched requests over this client's lifetime |

No queue or automatic retry exists. Concurrent calls reject with `busy`.
Validation failures, a signal already aborted before a call, and busy refusals
do not spend the call budget. Started calls spend it even if the adapter fails,
returns invalid output or refuses the request. After an ordinary backend or
response failure, another explicit call may use the remaining budget. An
exhausted client rejects with `call-limit`.

An active caller cancellation or deadline aborts the adapter's signal and
permanently closes the client. Later calls reject with `closed`, even if the
adapter subsequently settles. This prevents that client from starting more work
while a cancelled adapter may still be running. Late fulfillment is discarded
and late rejection is handled. Timers and caller abort listeners are removed
when the call settles. Aborting a caller signal after success does not affect
the client or the already completed adapter call. Caller abort reasons are not
forwarded to the adapter or included in errors.

Adapters execute as trusted code in the host process. The deadline bounds
waiting for asynchronous work; it cannot interrupt a synchronous loop, limit
memory already allocated by an adapter, or guarantee cancellation of remote
work or its cost. A synchronous result arriving after the deadline is rejected
when control returns. The output cap checks the completed text; adapters must
also bound their provider request, streamed buffers and output tokens, and
honor the supplied signal. There is no streaming API in this contract.

## Supplying an adapter

Registration is programmatic. There is no dynamic import, executable-path
option, environment discovery or credential configuration in the client.

```js
const adapter = {
  id: "local-adapter",
  model: "local-model",
  version: "adapter-v1",
  mode: "offline",
  async generate(request, { signal, maxOutputBytes }) {
    // Call a caller-owned model here, honoring the signal and output budget.
    signal.throwIfAborted();
    return { text: "Original inline adapter output.", finishReason: "stop" };
  }
};

const client = createGenerationClient({
  backend: "local-adapter",
  adapters: [adapter],
  limits: { maxCalls: 1 }
});
```

An adapter has exactly `id`, `model`, `version`, `mode` and `generate`.
The id is a lowercase slug; model and version are bounded, nonblank labels.
`mode` is `offline` or `network`, a supplied declaration that the client cannot
authenticate. `generate` is called as a standalone function without a `this`
binding. Capture any required runtime configuration in its closure.
Its result has exactly `text` and `finishReason`; it may return the object
directly or through a promise. The client captures the selected metadata and
function at construction, so later mutations of the registration object do not
change it. The contract and integration tests use original local stub adapters
to exercise selection, execution, snapshots and completion reasons.

Registration alone does not select an adapter. The registry rejects duplicate
ids and attempts to replace the built-in mock. `backend` must match a registered
id, and a selected adapter failure never falls back to the mock. Keep credentials
out of requests, labels, generated text, registration objects and files. The
client does not inspect environment values, log requests, persist credentials or
write output. A future provider adapter is responsible for its own secret
handling and bounded transport; no paid service is needed for these tests.

Failures use `GenerationError` with a fixed message and one of these codes:
`invalid-options`, `invalid-backend`, `invalid-request`, `input-limit`,
`invalid-response`, `output-limit`, `backend-failure`, `call-limit`, `busy`,
`timeout`, `aborted` or `closed`. No error includes raw request text, returned
text, the adapter's exception or its cause. These diagnostics avoid copying
provider failures that might contain private request information. They do not
remove sensitive content deliberately supplied as successful response text.
